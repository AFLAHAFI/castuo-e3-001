#!/usr/bin/env python3
"""Fail-closed preflight for the E3-001 public snapshot dispatch."""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

REQUIRED_FILES = (
    "manifest.json",
    "foreign-replay-result.json",
    "evidence-envelope.json",
    "runner-attestation.json",
    "reviewers.json",
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--require-signing-secret", action="store_true")
    args = parser.parse_args()

    findings: list[str] = []
    bundle = args.bundle.resolve()
    source_commit = args.source_commit
    if not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        findings.append("source_commit must be exactly 40 lowercase hexadecimal characters")
    if not bundle.is_dir():
        findings.append("bundle directory does not exist")
    else:
        for filename in REQUIRED_FILES:
            if not (bundle / filename).is_file():
                findings.append(f"missing required bundle artifact: {filename}")
        manifest_path = bundle / "manifest.json"
        if manifest_path.is_file():
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                findings.append("manifest.json is not valid JSON")
            else:
                if manifest.get("source_commit") != source_commit:
                    findings.append("manifest.source_commit does not match --source-commit")
                if manifest.get("external_runner") is not True:
                    findings.append("manifest.external_runner must be true")
                if manifest.get("foreign_replay") is not True:
                    findings.append("manifest.foreign_replay must be true")
                if manifest.get("production_claim") is not False:
                    findings.append("manifest.production_claim must be false")
                if manifest.get("commercial_claim") is not False:
                    findings.append("manifest.commercial_claim must be false")
    secret_present = bool(os.environ.get("CASTUO_SNAPSHOT_SIGNING_KEY_B64"))
    if args.require_signing_secret and not secret_present:
        findings.append("CASTUO_SNAPSHOT_SIGNING_KEY_B64 is not present in this execution environment")

    result = {
        "status": "READY" if not findings else "BLOCKED",
        "bundle": str(bundle),
        "source_commit": source_commit,
        "signing_secret_present": secret_present,
        "required_artifacts": list(REQUIRED_FILES),
        "findings": findings,
        "claim_boundary": "EXTERNAL_REPLAY_ONLY" if not findings else "NO_CLAIM",
        "promotion": "BLOCKED",
        "oneA": False,
    }
    rendered = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
