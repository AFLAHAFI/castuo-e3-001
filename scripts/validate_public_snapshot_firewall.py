#!/usr/bin/env python3
"""Fail-closed CI gate for the public E3 snapshot projection."""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    findings: list[str] = []
    try:
        snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"BLOCKED: unreadable snapshot: {exc}")
        return 1

    assurance = snapshot.get("assurance", {})
    verification = snapshot.get("public_verification", {})
    if snapshot.get("promotion") != "BLOCKED": findings.append("promotion must remain BLOCKED")
    if snapshot.get("authority_verified") is not False: findings.append("authority_verified must remain false")
    if assurance.get("oneA") is not False: findings.append("assurance.oneA must remain false")
    if verification.get("algorithm") != "Ed25519": findings.append("public Ed25519 verification is required")
    for field in ("public_key_b64", "signature_b64"):
        try: base64.b64decode(verification[field], validate=True)
        except (KeyError, ValueError, TypeError): findings.append(f"public_verification.{field} must be valid base64")
    if findings:
        print(json.dumps({"status": "BLOCKED", "findings": findings}, indent=2))
        return 1
    print(json.dumps({"status": "PASS", "oneA": False, "promotion": "BLOCKED", "authority_verified": False}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
