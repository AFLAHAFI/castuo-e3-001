import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import validate_public_snapshot_firewall


class PublicSnapshotFirewallTests(unittest.TestCase):
    def snapshot(self):
        return {"promotion": "BLOCKED", "authority_verified": False, "assurance": {"oneA": False}, "public_verification": {"algorithm": "Ed25519", "public_key_b64": base64.b64encode(b"public").decode(), "signature_b64": base64.b64encode(b"signature").decode()}}

    def run_gate(self, value):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "status-snapshot.json"
            path.write_text(json.dumps(value), encoding="utf-8")
            with patch.object(sys, "argv", ["validate_public_snapshot_firewall.py", str(path)]):
                return validate_public_snapshot_firewall.main()

    def test_secure_snapshot_passes(self):
        self.assertEqual(self.run_gate(self.snapshot()), 0)

    def test_one_a_true_is_blocked(self):
        value = self.snapshot()
        value["assurance"]["oneA"] = True
        self.assertEqual(self.run_gate(value), 1)

    def test_authorized_promotion_is_blocked(self):
        value = self.snapshot()
        value["promotion"] = "AUTHORIZED"
        self.assertEqual(self.run_gate(value), 1)

    def test_missing_signature_is_blocked(self):
        value = self.snapshot()
        value["public_verification"]["signature_b64"] = "not base64"
        self.assertEqual(self.run_gate(value), 1)


if __name__ == "__main__":
    unittest.main()
