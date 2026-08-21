#!/usr/bin/env python3
"""Evaluate the binary G2 evidence gate without authorizing promotion."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("validation", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    findings: list[str] = []
    try:
        payload = json.loads(args.validation.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        findings.append(f"unreadable external validation: {exc}")
        payload = {}
    if payload.get("status") != "VERIFIED_FOR_G2":
        findings.append("external evidence is not VERIFIED_FOR_G2")
    if payload.get("foreign_replay_verified") is not True:
        findings.append("foreign replay verification is missing")
    if payload.get("human_review_verified") is not True:
        findings.append("signed human review is missing")
    if payload.get("oneR") is not True or payload.get("oneV") is not True:
        findings.append("oneR and oneV must be verified before G2")
    if payload.get("oneA") is not False:
        findings.append("oneA must remain false at G2")
    if payload.get("promotion") != "BLOCKED":
        findings.append("promotion must remain BLOCKED at G2")
    result = {
        "gate": "G2",
        "status": "PASS" if not findings else "BLOCKED",
        "staging_handoff_eligible": not findings,
        "promotion": "BLOCKED",
        "oneA": False,
        "findings": findings,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
