import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "examples"))
import make_demo_bundle

VALIDATOR = ROOT / "scripts" / "validate_external_evidence_bundle.py"
G2 = ROOT / "scripts" / "evaluate_g2.py"


def run(*args: object) -> tuple[int, dict]:
    proc = subprocess.run([sys.executable, *map(str, args)], capture_output=True, text=True)
    return proc.returncode, json.loads(proc.stdout)


class ValidateExternalEvidenceBundleTests(unittest.TestCase):
    def validate(self, tamper: str | None) -> tuple[int, dict, Path]:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        bundle = Path(directory.name) / "bundle"
        make_demo_bundle.build(bundle, tamper=tamper)
        report = Path(directory.name) / "validation.json"
        code, payload = run(VALIDATOR, bundle, "--min-reviewers", 2, "--output", report)
        return code, payload, report

    def test_valid_demo_is_not_external_evidence_and_g2_blocks_it(self):
        code, payload, report = self.validate(None)
        self.assertEqual(code, 0, payload["findings"])
        self.assertEqual(payload["status"], "DEMO_VALIDATED")
        self.assertEqual(payload["mode"], "DEMO_ONLY")
        self.assertFalse(payload["g2_eligible"])
        self.assertFalse(payload["foreign_replay_verified"])
        self.assertFalse(payload["human_review_verified"])
        self.assertFalse(payload["oneR"])
        self.assertFalse(payload["oneV"])
        self.assertFalse(payload["oneA"])
        self.assertEqual(payload["promotion"], "BLOCKED")
        self.assertEqual(payload["claim_boundary"], "DEMO_ONLY")

        g2_code, decision = run(G2, report, "--output", report.with_name("g2.json"))
        self.assertEqual(g2_code, 1)
        self.assertEqual(decision["status"], "BLOCKED")
        self.assertFalse(decision["staging_handoff_eligible"])
        self.assertEqual(decision["promotion"], "BLOCKED")
        self.assertTrue(any("demo-only" in finding for finding in decision["findings"]))

    def assert_blocked(self, tamper: str, expected: str):
        code, payload, _ = self.validate(tamper)
        self.assertEqual(code, 1)
        self.assertEqual(payload["status"], "BLOCKED")
        self.assertEqual(payload["claim_boundary"], "NO_CLAIM")
        self.assertTrue(any(expected in finding for finding in payload["findings"]), payload["findings"])

    def test_modified_result_after_freeze_is_detected(self):
        self.assert_blocked("result", "result_hash does not match")

    def test_modified_fixture_after_freeze_is_detected(self):
        self.assert_blocked("fixture", "fixture_hash does not match")

    def test_forged_runner_signature_is_detected(self):
        self.assert_blocked("attestation-signature", "runner attestation Ed25519 signature is invalid")

    def test_reviewer_payload_edited_after_signing_is_detected(self):
        self.assert_blocked("reviewer-signature", "reviewers[1].signature is invalid")

    def test_missing_reviewer_breaks_quorum(self):
        self.assert_blocked("reviewer-quorum", "quorum not met: 1 < 2")

    def test_duplicate_reviewer_identity_is_detected(self):
        self.assert_blocked("reviewer-duplicate", "duplicate reviewer identity")

    def test_local_runner_identity_is_rejected(self):
        self.assert_blocked("local-runner", "runner_id must identify an external runner")

    def test_production_claim_is_rejected(self):
        self.assert_blocked("production-claim", "production and commercial claims must be false")

    def test_missing_artifact_is_reported(self):
        self.assert_blocked("missing-envelope", "missing envelope")


if __name__ == "__main__":
    unittest.main()
