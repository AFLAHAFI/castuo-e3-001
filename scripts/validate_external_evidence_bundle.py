#!/usr/bin/env python3
"""Validate an externally replayed and human-reviewed S-001A evidence bundle.

The validator is intentionally read-only. It verifies portable hashes, a signed
runner attestation and signed independent reviewers. It never writes oneV/oneA
into repository state and never authorizes production.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def verify_signature(record: dict[str, Any]) -> bool:
    try:
        public_key = base64.b64decode(record["public_key_b64"], validate=True)
        signature = base64.b64decode(record["signature_b64"], validate=True)
        payload = {key: value for key, value in record.items() if key != "signature_b64"}
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, canonical(payload))
        return True
    except (KeyError, ValueError, TypeError, InvalidSignature):
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("package", type=Path)
    parser.add_argument("--min-reviewers", type=int, default=2)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    package = args.package
    findings: list[str] = []
    required = {
        "manifest": package / "manifest.json",
        "result": package / "foreign-replay-result.json",
        "envelope": package / "evidence-envelope.json",
        "attestation": package / "runner-attestation.json",
        "reviewers": package / "reviewers.json",
    }
    for name, path in required.items():
        if not path.is_file():
            findings.append(f"missing {name}: {path.name}")

    objects: dict[str, Any] = {}
    if not findings:
        try:
            for name, path in required.items():
                objects[name] = load(path)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            findings.append(f"unreadable evidence bundle: {exc}")

    manifest = objects.get("manifest", {})
    result = objects.get("result", {})
    envelope = objects.get("envelope", {})
    attestation = objects.get("attestation", {})
    reviewers = objects.get("reviewers", [])

    if not isinstance(manifest, dict):
        findings.append("manifest must be an object")
        manifest = {}
    if not isinstance(result, dict):
        findings.append("foreign-replay-result must be an object")
        result = {}
    if not isinstance(envelope, dict):
        findings.append("evidence-envelope must be an object")
        envelope = {}

    if manifest.get("scenario_id") != "S-001A":
        findings.append("manifest scenario_id must be S-001A")
    if manifest.get("protocol_id") != "E3-001-S001A-FOREIGN-REPLAY":
        findings.append("manifest protocol_id must be E3-001-S001A-FOREIGN-REPLAY")
    if manifest.get("foreign_replay") is not True:
        findings.append("manifest foreign_replay must be true")
    if manifest.get("external_runner") is not True:
        findings.append("manifest external_runner must be true")
    if manifest.get("production_claim") is not False or manifest.get("commercial_claim") is not False:
        findings.append("manifest production and commercial claims must be false")
    source_commit = manifest.get("source_commit")
    if not isinstance(source_commit, str) or not COMMIT_RE.fullmatch(source_commit):
        findings.append("manifest source_commit must be a 40-character lowercase commit")
    if not manifest.get("rollback_ref"):
        findings.append("manifest rollback_ref is required")

    expected_result_hash = digest(required["result"]) if required["result"].is_file() else None
    expected_envelope_hash = digest(required["envelope"]) if required["envelope"].is_file() else None
    fixture_path = package / manifest.get("fixture_path", "fixture.json")
    expected_fixture_hash = digest(fixture_path) if fixture_path.is_file() else None
    for label, value in (("result_hash", expected_result_hash), ("fixture_hash", expected_fixture_hash)):
        declared = manifest.get(label)
        if not isinstance(declared, str) or not SHA256_RE.fullmatch(declared):
            findings.append(f"manifest {label} must be a lowercase SHA-256 value")
        elif value and declared != value:
            findings.append(f"manifest {label} does not match the artifact")

    runner = result.get("runner", {}) if isinstance(result, dict) else {}
    replay = result.get("replay", {}) if isinstance(result, dict) else {}
    if result.get("status") != "PASS_WITHIN_DECLARED_SCOPE":
        findings.append("foreign replay result must be PASS_WITHIN_DECLARED_SCOPE")
    if runner.get("source_commit") != source_commit:
        findings.append("runner source_commit does not match manifest")
    if not runner.get("runner_id") or str(runner["runner_id"]).startswith(("github-actions-candidate-", "LOCAL-", "local-")):
        findings.append("runner_id must identify an external runner, not local or candidate CI")
    if runner.get("network") != "DISABLED_BY_HARNESS":
        findings.append("runner network must be DISABLED_BY_HARNESS")
    if replay.get("equivalent_decision") is not True or replay.get("equivalent_evidence_semantics") is not True:
        findings.append("replay equivalence must be true")
    if replay.get("oneR_candidate") is not True or replay.get("oneV") is not False or replay.get("oneA") is not False:
        findings.append("replay claim firewall is invalid")
    if replay.get("promotion") != "BLOCKED":
        findings.append("replay promotion must remain BLOCKED")

    assurance = envelope.get("assurance", {})
    if envelope.get("scenario_id") != "S-001A":
        findings.append("envelope scenario_id must be S-001A")
    if envelope.get("promotion", "BLOCKED") != "BLOCKED":
        findings.append("envelope promotion must remain BLOCKED")
    if envelope.get("claim_boundary") in {None, "", "PRODUCTION", "COMMERCIAL"}:
        findings.append("envelope claim_boundary must be explicit and non-production")
    if not isinstance(assurance, dict) or assurance.get("oneD") is not True or assurance.get("oneR") is not True or assurance.get("oneV") is not False or assurance.get("oneA") is not False:
        findings.append("envelope assurance must be oneD=true, oneR=true, oneV=false, oneA=false")
    if expected_envelope_hash and manifest.get("evidence_hash") != expected_envelope_hash:
        findings.append("manifest evidence_hash does not match evidence-envelope")

    if not isinstance(attestation, dict) or attestation.get("independent") is not True:
        findings.append("runner attestation must declare independent=true")
    else:
        if attestation.get("runner_id") != runner.get("runner_id"):
            findings.append("runner attestation runner_id does not match result")
        if attestation.get("source_commit") != source_commit:
            findings.append("runner attestation source_commit does not match manifest")
        if attestation.get("result_hash") != expected_result_hash:
            findings.append("runner attestation result_hash does not match result")
        if not verify_signature(attestation):
            findings.append("runner attestation Ed25519 signature is invalid")

    if not isinstance(reviewers, list):
        findings.append("reviewers.json must be an array")
        reviewers = []
    identities: set[str] = set()
    for index, reviewer in enumerate(reviewers):
        prefix = f"reviewers[{index}]"
        if not isinstance(reviewer, dict):
            findings.append(f"{prefix} must be an object")
            continue
        identity = reviewer.get("reviewer_id")
        if not isinstance(identity, str) or not identity:
            findings.append(f"{prefix}.reviewer_id is required")
        elif identity in identities:
            findings.append(f"duplicate reviewer identity: {identity}")
        else:
            identities.add(identity)
        if reviewer.get("independence") is not True:
            findings.append(f"{prefix}.independence must be true")
        if reviewer.get("decision") != "APPROVE":
            findings.append(f"{prefix}.decision must be APPROVE")
        if reviewer.get("source_commit") != source_commit:
            findings.append(f"{prefix}.source_commit does not match manifest")
        if reviewer.get("evidence_hash") != expected_envelope_hash:
            findings.append(f"{prefix}.evidence_hash does not match envelope")
        if reviewer.get("replay_result_hash") != expected_result_hash:
            findings.append(f"{prefix}.replay_result_hash does not match result")
        if not verify_signature(reviewer):
            findings.append(f"{prefix}.signature is invalid")
    if len(identities) < args.min_reviewers:
        findings.append(f"independent reviewer quorum not met: {len(identities)} < {args.min_reviewers}")

    # The synthetic demo exercises validation logic but is never external
    # evidence. Detect several explicit demo markers so a passing synthetic
    # bundle cannot be promoted to VERIFIED_FOR_G2 by changing one field.
    demo_only = (
        envelope.get("claim_boundary") == "DEMO_ONLY"
        or str(runner.get("runner_id", "")).startswith("DEMO-")
        or (
            isinstance(attestation, dict)
            and str(attestation.get("attestation_id", "")).startswith("DEMO-")
        )
        or (
            isinstance(reviewers, list)
            and any(
                isinstance(reviewer, dict)
                and str(reviewer.get("reviewer_id", "")).startswith("DEMO-")
                for reviewer in reviewers
            )
        )
    )
    verified_for_g2 = not findings and not demo_only
    status = (
        "DEMO_VALIDATED"
        if demo_only and not findings
        else "VERIFIED_FOR_G2"
        if verified_for_g2
        else "BLOCKED"
    )
    output = {
        "scenario_id": "S-001A",
        "mode": "DEMO_ONLY" if demo_only else "EXTERNAL_EVIDENCE",
        "g2_eligible": verified_for_g2,
        "status": status,
        "foreign_replay_verified": verified_for_g2,
        "human_review_verified": verified_for_g2,
        "oneR": verified_for_g2,
        "oneV": verified_for_g2,
        "oneA": False,
        "promotion": "BLOCKED",
        "claim_boundary": (
            "DEMO_ONLY"
            if demo_only and not findings
            else "EXTERNAL_REPLAY_AND_SIGNED_REVIEW_ONLY"
            if verified_for_g2
            else "NO_CLAIM"
        ),
        "findings": findings,
    }
    output_path = args.output or package / "external-evidence-validation.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
