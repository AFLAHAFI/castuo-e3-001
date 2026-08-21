import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import preflight_public_snapshot


class PreflightTests(unittest.TestCase):
    commit = "a" * 40

    def bundle(self, root: Path) -> Path:
        bundle = root / "bundle"
        bundle.mkdir()
        for filename in preflight_public_snapshot.REQUIRED_FILES:
            (bundle / filename).write_text("[]" if filename == "reviewers.json" else "{}", encoding="utf-8")
        (bundle / "manifest.json").write_text(json.dumps({"source_commit": self.commit, "external_runner": True, "foreign_replay": True, "production_claim": False, "commercial_claim": False}), encoding="utf-8")
        return bundle

    def run_preflight(self, bundle: Path, *extra: str) -> int:
        args = ["preflight_public_snapshot.py", str(bundle), "--source-commit", self.commit, *extra]
        with patch.object(sys, "argv", args):
            return preflight_public_snapshot.main()

    def test_complete_bundle_is_ready_with_secret(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = self.bundle(Path(directory))
            with patch.dict("os.environ", {"CASTUO_SNAPSHOT_SIGNING_KEY_B64": "present"}):
                self.assertEqual(self.run_preflight(bundle, "--require-signing-secret"), 0)

    def test_missing_secret_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = self.bundle(Path(directory))
            with patch.dict("os.environ", {}, clear=True):
                self.assertEqual(self.run_preflight(bundle, "--require-signing-secret"), 1)

    def test_mismatched_commit_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = self.bundle(Path(directory))
            with patch.object(sys, "argv", ["preflight_public_snapshot.py", str(bundle), "--source-commit", "b" * 40]):
                self.assertEqual(preflight_public_snapshot.main(), 1)

    def test_missing_artifact_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = self.bundle(Path(directory))
            (bundle / "runner-attestation.json").unlink()
            self.assertEqual(self.run_preflight(bundle), 1)


if __name__ == "__main__":
    unittest.main()
