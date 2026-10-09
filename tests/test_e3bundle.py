import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
CLI = ROOT / "scripts" / "e3bundle.py"


def run(*args: object) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(CLI), *map(str, args)], capture_output=True, text=True)


class E3BundleTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.bundle = self.root / "bundle"
        (self.bundle / "data").mkdir(parents=True)
        (self.bundle / "data" / "readings.csv").write_text("t,value\n0,21.5\n", encoding="utf-8")
        (self.bundle / "report.txt").write_text("summary\n", encoding="utf-8")
        self.keys = {}
        for signer in ("alice", "bob"):
            key = self.root / f"{signer}.key"
            proc = run("keygen", "--private-key", key, "--signer-id", signer)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.keys[signer] = key
        self.assertEqual(run("manifest", self.bundle, "--bundle-id", "demo-001").returncode, 0)

    def sign(self, signer: str, role: str = "reviewer") -> None:
        proc = run("sign", self.bundle, "--private-key", self.keys[signer], "--signer-id", signer, "--role", role)
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def trusted(self, *signers: str) -> Path:
        path = self.root / "trusted.json"
        entries = {}
        for signer in signers:
            public = json.loads(self.keys[signer].with_suffix(".pub.json").read_text(encoding="utf-8"))
            entries[signer] = public["public_key_b64"]
        path.write_text(json.dumps(entries), encoding="utf-8")
        return path

    def verify(self, *extra: object) -> tuple[int, dict]:
        proc = run("verify", self.bundle, *extra)
        return proc.returncode, json.loads(proc.stdout)

    def assert_failed(self, expected: str, *extra: object) -> None:
        code, report = self.verify(*extra)
        self.assertEqual(code, 1, report)
        self.assertEqual(report["status"], "FAILED")
        self.assertTrue(any(expected in finding for finding in report["findings"]), report["findings"])

    def test_unsigned_bundle_verifies_integrity_only(self):
        code, report = self.verify()
        self.assertEqual(code, 0, report["findings"])
        self.assertEqual(report["status"], "VERIFIED")
        self.assertEqual(report["files_verified"], 2)
        self.assertEqual(report["signatures_valid"], 0)

    def test_two_trusted_signatures_meet_threshold(self):
        self.sign("alice")
        self.sign("bob")
        code, report = self.verify("--min-signatures", 2, "--trusted-keys", self.trusted("alice", "bob"))
        self.assertEqual(code, 0, report["findings"])
        self.assertEqual(report["signatures_trusted"], 2)

    def test_modified_file_is_detected(self):
        (self.bundle / "data" / "readings.csv").write_text("t,value\n0,99.9\n", encoding="utf-8")
        self.assert_failed("hash mismatch: data/readings.csv")

    def test_missing_file_is_detected(self):
        (self.bundle / "report.txt").unlink()
        self.assert_failed("missing file: report.txt")

    def test_undeclared_file_is_detected_unless_allowed(self):
        (self.bundle / "extra.bin").write_bytes(b"\x00")
        self.assert_failed("undeclared file: extra.bin")
        code, _ = self.verify("--allow-extra")
        self.assertEqual(code, 0)

    def test_manifest_edited_after_signing_invalidates_signature(self):
        self.sign("alice")
        manifest = json.loads((self.bundle / "manifest.json").read_text(encoding="utf-8"))
        manifest["bundle_id"] = "demo-edited"
        (self.bundle / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        self.assert_failed("does not match the manifest", "--min-signatures", 1)

    def test_forged_signature_is_detected(self):
        self.sign("alice")
        signatures = json.loads((self.bundle / "signatures.json").read_text(encoding="utf-8"))
        signatures[0]["role"] = "auditor"
        (self.bundle / "signatures.json").write_text(json.dumps(signatures), encoding="utf-8")
        self.assert_failed("signatures[0]: invalid Ed25519 signature", "--min-signatures", 1)

    def test_untrusted_key_does_not_count(self):
        self.sign("alice")
        self.sign("bob")
        self.assert_failed("signature threshold not met: 1 < 2", "--min-signatures", 2, "--trusted-keys", self.trusted("alice"))

    def test_duplicate_signer_counts_once(self):
        self.sign("alice")
        self.sign("alice")
        self.assert_failed("duplicate signer: alice", "--min-signatures", 2)

    def test_path_traversal_in_manifest_is_rejected(self):
        manifest = json.loads((self.bundle / "manifest.json").read_text(encoding="utf-8"))
        manifest["files"].append({"path": "../outside.txt", "sha256": "sha256:" + "0" * 64})
        (self.bundle / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        self.assert_failed("unsafe path: ../outside.txt")

    def test_unreadable_manifest_exits_2(self):
        (self.bundle / "manifest.json").write_text("{not json", encoding="utf-8")
        code, report = self.verify()
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "ERROR")

    def test_private_key_is_not_written_into_bundle(self):
        self.sign("alice")
        names = {path.name for path in self.bundle.rglob("*")}
        self.assertNotIn("alice.key", names)
        self.assertNotIn("PRIVATE", (self.bundle / "signatures.json").read_text(encoding="utf-8"))

    def test_symlinked_file_is_rejected(self):
        target = self.root / "outside.txt"
        target.write_text("summary\n", encoding="utf-8")
        (self.bundle / "report.txt").unlink()
        try:
            (self.bundle / "report.txt").symlink_to(target)
        except OSError as exc:
            self.skipTest(f"symlinks unavailable: {exc}")
        self.assert_failed("symlink not allowed: report.txt")

    def test_manifest_refuses_to_overwrite_signed_bundle(self):
        self.sign("alice")
        proc = run("manifest", self.bundle, "--bundle-id", "demo-002")
        self.assertEqual(proc.returncode, 2)
        self.assertIn("would invalidate", proc.stderr)


if __name__ == "__main__":
    unittest.main()
