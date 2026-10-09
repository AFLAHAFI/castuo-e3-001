#!/usr/bin/env python3
"""Build a synthetic, self-signed DEMO bundle for trying the validator locally.

Every key is generated in memory for this run and discarded on exit; no private
key is written to disk. The runner and reviewers are fictional DEMO identities,
so a passing validation of this bundle proves only that the validator works.
It is not an S-001A replay, not independent review and not evidence for G2.

Use --tamper to produce a deliberately broken bundle and watch it fail.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

TAMPERS = (
    "result",
    "fixture",
    "attestation-signature",
    "reviewer-signature",
    "reviewer-quorum",
    "reviewer-duplicate",
    "local-runner",
    "production-claim",
    "missing-envelope",
)
DEMO_COMMIT = "0" * 39 + "d"


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sign(record: dict[str, Any]) -> dict[str, Any]:
    key = Ed25519PrivateKey.generate()
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    payload = {**record, "public_key_b64": base64.b64encode(public).decode()}
    return {**payload, "signature_b64": base64.b64encode(key.sign(canonical(payload))).decode()}


def build(output: Path, tamper: str | None = None) -> Path:
    if tamper is not None and tamper not in TAMPERS:
        raise ValueError(f"unknown tamper: {tamper}")
    output.mkdir(parents=True, exist_ok=True)
    runner_id = "LOCAL-demo-runner" if tamper == "local-runner" else "DEMO-RUNNER-001"

    fixture = output / "fixture.json"
    write(fixture, {"demo": True, "scenario_id": "S-001A", "steps": ["inject_fault", "capture", "recover", "replay"]})
    result = output / "foreign-replay-result.json"
    write(result, {
        "status": "PASS_WITHIN_DECLARED_SCOPE",
        "runner": {"runner_id": runner_id, "source_commit": DEMO_COMMIT, "network": "DISABLED_BY_HARNESS"},
        "replay": {"equivalent_decision": True, "equivalent_evidence_semantics": True,
                   "oneR_candidate": True, "oneV": False, "oneA": False, "promotion": "BLOCKED"},
    })
    envelope = output / "evidence-envelope.json"
    write(envelope, {
        "scenario_id": "S-001A",
        "claim_boundary": "DEMO_ONLY",
        "assurance": {"oneD": True, "oneR": True, "oneV": False, "oneA": False},
        "promotion": "BLOCKED",
    })
    result_hash, envelope_hash = digest(result), digest(envelope)
    write(output / "manifest.json", {
        "scenario_id": "S-001A",
        "protocol_id": "E3-001-S001A-FOREIGN-REPLAY",
        "source_commit": DEMO_COMMIT,
        "fixture_path": "fixture.json",
        "fixture_hash": digest(fixture),
        "result_hash": result_hash,
        "evidence_hash": envelope_hash,
        "rollback_ref": "demo-rollback-ref",
        "external_runner": True,
        "foreign_replay": True,
        "production_claim": tamper == "production-claim",
        "commercial_claim": False,
    })
    attestation = sign({
        "attestation_id": "DEMO-ATTESTATION-001",
        "runner_id": runner_id,
        "independent": True,
        "source_commit": DEMO_COMMIT,
        "result_hash": result_hash,
    })
    reviewers = [
        sign({
            "review_id": f"DEMO-REVIEW-{label}",
            "reviewer_id": f"DEMO-REVIEWER-{label}",
            "independence": True,
            "decision": "APPROVE",
            "source_commit": DEMO_COMMIT,
            "evidence_hash": envelope_hash,
            "replay_result_hash": result_hash,
        })
        for label in ("A", "B")
    ]

    if tamper == "attestation-signature":
        attestation["attestation_id"] = "DEMO-ATTESTATION-FORGED"
    elif tamper == "reviewer-signature":
        reviewers[1]["review_id"] = "DEMO-REVIEW-EDITED"
    elif tamper == "reviewer-quorum":
        reviewers = reviewers[:1]
    elif tamper == "reviewer-duplicate":
        reviewers[1] = reviewers[0]
    write(output / "runner-attestation.json", attestation)
    write(output / "reviewers.json", reviewers)

    if tamper == "result":
        data = json.loads(result.read_text(encoding="utf-8"))
        data["note"] = "edited after freeze"
        write(result, data)
    elif tamper == "fixture":
        fixture.write_text(fixture.read_text(encoding="utf-8").replace("recover", "skip"), encoding="utf-8")
    elif tamper == "missing-envelope":
        envelope.unlink()
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("output", type=Path, help="directory to create the demo bundle in")
    parser.add_argument("--tamper", choices=TAMPERS, default=None, help="break the bundle in one specific way")
    args = parser.parse_args()
    path = build(args.output, tamper=args.tamper)
    print(f"DEMO bundle written to {path} (tamper={args.tamper or 'none'})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
