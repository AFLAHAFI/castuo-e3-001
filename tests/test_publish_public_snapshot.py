import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

sys.path.insert(0, str(Path(__file__).parents[1] / "scripts"))
import publish_public_snapshot


class PublishPublicSnapshotTests(unittest.TestCase):
    def write_inputs(self, root: Path) -> tuple[Path, Path, Path]:
        validation = root / "validation.json"
        g2 = root / "g2.json"
        output = root / "public" / "status-snapshot.json"
        validation.write_text(json.dumps({"status": "VERIFIED_FOR_G2", "foreign_replay_verified": True, "human_review_verified": True, "oneR": True, "oneV": True}), encoding="utf-8")
        g2.write_text(json.dumps({"status": "PASS", "oneA": False, "promotion": "BLOCKED"}), encoding="utf-8")
        return validation, g2, output

    def test_signed_snapshot_is_verifiable_and_remains_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            validation, g2, output = self.write_inputs(root)
            private_key = Ed25519PrivateKey.generate()
            raw_private = private_key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
            argv = ["publish_public_snapshot.py", "--validation", str(validation), "--g2-decision", str(g2), "--source-commit", "a" * 40, "--workflow-run-id", "123", "--output", str(output), "--signing-key-b64", base64.b64encode(raw_private).decode(), "--require-signature"]
            with patch.object(sys, "argv", argv):
                self.assertEqual(publish_public_snapshot.main(), 0)
            snapshot = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(snapshot["promotion"], "BLOCKED")
            self.assertFalse(snapshot["assurance"]["oneA"])
            signature = base64.b64decode(snapshot["public_verification"]["signature_b64"])
            public_key = base64.b64decode(snapshot["public_verification"]["public_key_b64"])
            unsigned = {key: value for key, value in snapshot.items() if key != "public_verification"}
            Ed25519PublicKey.from_public_bytes(public_key).verify(signature, publish_public_snapshot.canonical(unsigned))

    def test_required_signature_missing_blocks_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            validation, g2, output = self.write_inputs(root)
            argv = ["publish_public_snapshot.py", "--validation", str(validation), "--g2-decision", str(g2), "--source-commit", "b" * 40, "--workflow-run-id", "124", "--output", str(output), "--require-signature"]
            with patch.object(sys, "argv", argv):
                with self.assertRaises(SystemExit):
                    publish_public_snapshot.main()
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
