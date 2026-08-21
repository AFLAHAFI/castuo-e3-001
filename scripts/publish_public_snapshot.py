#!/usr/bin/env python3
"""Build and sign the public CASTÚO status snapshot from read-only G2 outputs.

The private Ed25519 key is read only from an explicit environment variable or
CLI input on the external runner. It is never written to the snapshot or sent
to the browser. Missing signatures fail closed when --require-signature is set.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_private_key(value: str | None) -> Ed25519PrivateKey | None:
    encoded = value or os.environ.get("CASTUO_SNAPSHOT_SIGNING_KEY_B64")
    if not encoded:
        return None
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) == 32:
        return Ed25519PrivateKey.from_private_bytes(raw)
    return serialization.load_pem_private_key(raw, password=None)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--g2-decision", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--workflow-run-id", required=True)
    parser.add_argument("--signing-key-b64", default=None)
    parser.add_argument("--key-id", default="CASTUO-E3-SNAPSHOT-SIGNER-1")
    parser.add_argument("--require-signature", action="store_true")
    args = parser.parse_args()

    validation = load(args.validation)
    g2 = load(args.g2_decision)
    verified = validation.get("status") == "VERIFIED_FOR_G2" and g2.get("status") == "PASS" and g2.get("oneA") is False and g2.get("promotion") == "BLOCKED"
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    one_r = validation.get("oneR") is True and validation.get("foreign_replay_verified") is True
    one_v = validation.get("oneV") is True and validation.get("human_review_verified") is True
    snapshot: dict[str, Any] = {
        "snapshot_id": f"CASTUO-E3-{args.workflow_run_id}",
        "declared_at_utc": now,
        "source_commit": args.source_commit,
        "workflow": {"name": "e3-001-public-snapshot", "run_id": args.workflow_run_id, "conclusion": "success" if verified else "failure"},
        "claim_boundary": "EXTERNAL_REPLAY_AND_SIGNED_REVIEW_ONLY" if verified else "NO_CLAIM",
        "promotion": "BLOCKED",
        "authority_verified": False,
        "assurance": {"oneD": True, "oneR": one_r, "oneV": one_v, "oneA": False},
        "staging": {"environment": "staging-rls", "endpoint_configured": False, "reviewers_required": 2, "reviewers_ready": 2 if one_v else 0, "secrets_configured": False, "protection_state": "UNKNOWN"},
        "external_verifiability": {"package_status": "G2_PASS" if verified else "REVIEW_VERIFIED" if one_v else "AVAILABLE_NOT_ACCEPTED", "runner_attestation": one_r, "signed_review_quorum": "2/2" if one_v else "0/2", "g2_status": "PASS" if verified else "REVIEW_REQUIRED", "staging_handoff": "ELIGIBLE" if verified else "BLOCKED", "evidence_bundle_ref": validation.get("evidence_bundle_ref")},
        "foreign_replay": {"protocol": "E3-001", "stage": "REVIEWED" if verified else "REPLAY_PASS" if one_r else "REVIEW_PENDING", "smoke_passed": 3 if one_r else 0, "stress_passed": 3 if one_r else 0, "recovery_passed": 3 if one_r else 0, "independent_reviewers_required": 2, "independent_reviewers_ready": 2 if one_v else 0},
    }

    private_key = load_private_key(args.signing_key_b64)
    if private_key:
        public_key = private_key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        payload_bytes = canonical(snapshot)
        snapshot["public_verification"] = {"algorithm": "Ed25519", "key_id": args.key_id, "public_key_b64": base64.b64encode(public_key).decode("ascii"), "signed_payload_sha256": sha256(payload_bytes), "signature_b64": base64.b64encode(private_key.sign(payload_bytes)).decode("ascii"), "source": "evaluate_g2.py + validate_external_evidence_bundle.py"}
    elif args.require_signature:
        raise SystemExit("missing CASTUO_SNAPSHOT_SIGNING_KEY_B64: refusing unsigned public snapshot")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "g2": g2.get("status"), "signed": "public_verification" in snapshot, "promotion": snapshot["promotion"], "oneA": snapshot["assurance"]["oneA"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
