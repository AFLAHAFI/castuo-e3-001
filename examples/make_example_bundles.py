#!/usr/bin/env python3
"""Regenerate examples/bundles/{valid,tampered} and trusted-keys.json.

Signing keys live in a temporary directory and are deleted when the script
ends, so the committed examples can be verified but never re-signed. All
content is synthetic. Running this script replaces the committed examples
with freshly signed ones.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parents[1]
CLI = ROOT / "scripts" / "e3bundle.py"
OUT = ROOT / "examples" / "bundles"
SIGNERS = (("example-runner", "runner"), ("example-reviewer", "reviewer"))
READINGS = (
    b"timestamp,zone,temperature_c,humidity_pct\n"
    b"2026-01-01T08:00:00Z,zone1,18.4,71\n"
    b"2026-01-01T09:00:00Z,zone1,19.1,68\n"
    b"2026-01-01T10:00:00Z,zone1,20.3,64\n"
)
REPORT = (
    b"# Synthetic example report\n\n"
    b"Three hourly readings from a fictional zone. This file exists only to demonstrate e3bundle.\n"
)


def e3bundle(*args: object) -> None:
    subprocess.run([sys.executable, str(CLI), *map(str, args)], check=True, stdout=subprocess.DEVNULL)


def main() -> int:
    valid, tampered = OUT / "valid", OUT / "tampered"
    for path in (valid, tampered):
        shutil.rmtree(path, ignore_errors=True)
    (valid / "data").mkdir(parents=True)
    # Bytes, not text: the signed hashes must not depend on platform line endings.
    (valid / "data" / "readings.csv").write_bytes(READINGS)
    (valid / "report.md").write_bytes(REPORT)
    e3bundle("manifest", valid, "--bundle-id", "example-001")

    trusted = {}
    with tempfile.TemporaryDirectory() as keys:
        for signer, role in SIGNERS:
            key = Path(keys) / f"{signer}.key"
            e3bundle("keygen", "--private-key", key, "--signer-id", signer)
            e3bundle("sign", valid, "--private-key", key, "--signer-id", signer, "--role", role)
            trusted[signer] = json.loads(key.with_suffix(".pub.json").read_text(encoding="utf-8"))["public_key_b64"]
    (OUT / "trusted-keys.json").write_bytes((json.dumps(trusted, indent=2, sort_keys=True) + "\n").encode("utf-8"))

    shutil.copytree(valid, tampered)
    (tampered / "data" / "readings.csv").write_bytes(READINGS.replace(b"20.3", b"23.0"))
    print(f"examples written to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
