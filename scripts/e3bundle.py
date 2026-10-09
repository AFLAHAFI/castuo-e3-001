#!/usr/bin/env python3
"""Create, sign and verify portable evidence bundles offline (format e3.bundle.v1).

A bundle is a directory with a ``manifest.json`` that lists every file and its
SHA-256, plus an optional ``signatures.json`` with Ed25519 signatures over the
canonical manifest. Verification is read-only and needs no network.

What a VERIFIED result means: every declared file is present and unchanged,
no undeclared file was added (unless --allow-extra), and the required number
of signatures are cryptographically valid over this exact manifest. When
--trusted-keys is given, only signatures from those pinned keys count.

What it does not mean: that the content is true, that a signer is who they
claim to be (without pinned keys), that signers are independent, or any
certification, compliance or production authorization.

Exit codes: 0 verified, 1 verification failed, 2 unreadable input or usage error.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

FORMAT = "e3.bundle.v1"
SIGNATURE_FORMAT = "e3.signature.v1"
MANIFEST = "manifest.json"
SIGNATURES = "signatures.json"
RESERVED = {MANIFEST, SIGNATURES}
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
LIMITATIONS = (
    "Checks integrity of declared files and validity of signatures over the manifest only. "
    "Does not prove the content is true, signer identity without pinned keys, signer independence, "
    "certification, compliance or production authorization."
)


class InputError(Exception):
    """Unreadable or malformed input; maps to exit code 2."""


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def file_digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            sha.update(chunk)
    return "sha256:" + sha.hexdigest()


def manifest_hash(manifest: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(canonical(manifest)).hexdigest()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InputError(f"cannot read {path.name}: {exc}") from exc


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def is_safe_relpath(value: Any) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        return False
    # Reject path aliases such as "./file", "a//b" and "a/./b". These can
    # otherwise name the same filesystem object under different manifest paths.
    if any(part in ("", ".", "..") for part in value.split("/")):
        return False
    posix = PurePosixPath(value)
    return posix.as_posix() == value and bool(posix.parts) and not posix.is_absolute() and ".." not in posix.parts


def has_symlink(bundle: Path, relpath: str) -> bool:
    current = bundle
    for part in PurePosixPath(relpath).parts:
        current = current / part
        if current.is_symlink():
            return True
    return False


def bundle_files(bundle: Path) -> list[str]:
    found = []
    for path in sorted(bundle.rglob("*")):
        relpath = path.relative_to(bundle).as_posix()
        if relpath in RESERVED:
            continue
        if path.is_symlink():
            raise InputError(f"symlinks are not allowed in a bundle: {relpath}")
        if path.is_file():
            found.append(relpath)
    return found


def load_private_key(path: Path) -> Ed25519PrivateKey:
    try:
        raw = base64.b64decode(path.read_text(encoding="utf-8").strip(), validate=True)
        return Ed25519PrivateKey.from_private_bytes(raw)
    except (OSError, ValueError) as exc:
        raise InputError(f"cannot load private key {path.name}: {exc}") from exc


def public_b64(key: Ed25519PrivateKey) -> str:
    raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def verify_signature(record: dict[str, Any]) -> bool:
    try:
        public_key = base64.b64decode(record["public_key_b64"], validate=True)
        signature = base64.b64decode(record["signature_b64"], validate=True)
        payload = {key: value for key, value in record.items() if key != "signature_b64"}
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, canonical(payload))
        return True
    except (KeyError, ValueError, TypeError, InvalidSignature):
        return False


def cmd_keygen(args: argparse.Namespace) -> int:
    if args.private_key.exists():
        raise InputError(f"refusing to overwrite existing key: {args.private_key}")
    key = Ed25519PrivateKey.generate()
    raw = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    descriptor = os.open(args.private_key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(base64.b64encode(raw).decode() + "\n")
    public_path = args.private_key.with_suffix(".pub.json")
    write_json(public_path, {"signer_id": args.signer_id, "public_key_b64": public_b64(key)})
    print(f"private key: {args.private_key} (keep it out of bundles and repositories)")
    print(f"public key:  {public_path}")
    return 0


def cmd_manifest(args: argparse.Namespace) -> int:
    bundle = args.bundle
    if not bundle.is_dir():
        raise InputError(f"bundle directory not found: {bundle}")
    if (bundle / SIGNATURES).exists():
        raise InputError(f"{SIGNATURES} exists; rewriting the manifest would invalidate it. Remove it first.")
    files = [{"path": relpath, "sha256": file_digest(bundle / relpath)} for relpath in bundle_files(bundle)]
    write_json(bundle / MANIFEST, {"format": FORMAT, "bundle_id": args.bundle_id, "files": files})
    print(f"{MANIFEST}: {len(files)} files declared")
    return 0


def cmd_sign(args: argparse.Namespace) -> int:
    manifest = load_json(args.bundle / MANIFEST)
    if not isinstance(manifest, dict):
        raise InputError(f"{MANIFEST} must be a JSON object")
    key = load_private_key(args.private_key)
    path = args.bundle / SIGNATURES
    signatures = load_json(path) if path.exists() else []
    if not isinstance(signatures, list):
        raise InputError(f"{SIGNATURES} must be a JSON array")
    payload = {
        "format": SIGNATURE_FORMAT,
        "manifest_hash": manifest_hash(manifest),
        "signer_id": args.signer_id,
        "role": args.role,
        "signed_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "public_key_b64": public_b64(key),
    }
    payload["signature_b64"] = base64.b64encode(key.sign(canonical(payload))).decode()
    signatures.append(payload)
    write_json(path, signatures)
    print(f"{SIGNATURES}: signed by {args.signer_id} as {args.role}")
    return 0


def verify(bundle: Path, min_signatures: int, trusted: dict[str, str] | None, allow_extra: bool) -> dict[str, Any]:
    manifest = load_json(bundle / MANIFEST)
    if not isinstance(manifest, dict):
        raise InputError(f"{MANIFEST} must be a JSON object")
    findings: list[str] = []
    if manifest.get("format") != FORMAT:
        findings.append(f"unsupported format: {manifest.get('format')!r} (expected {FORMAT})")
    entries = manifest.get("files")
    if not isinstance(entries, list):
        findings.append("manifest files must be an array")
        entries = []

    declared: set[str] = set()
    verified = 0
    for index, entry in enumerate(entries):
        relpath = entry.get("path") if isinstance(entry, dict) else None
        expected = entry.get("sha256") if isinstance(entry, dict) else None
        if not is_safe_relpath(relpath) or relpath in RESERVED:
            findings.append(f"unsafe path: {relpath}")
            continue
        if relpath in declared:
            findings.append(f"duplicate path: {relpath}")
            continue
        declared.add(relpath)
        if not isinstance(expected, str) or not SHA256_RE.fullmatch(expected):
            findings.append(f"files[{index}].sha256 must be sha256:<64 lowercase hex>")
            continue
        if has_symlink(bundle, relpath):
            findings.append(f"symlink not allowed: {relpath}")
        elif not (bundle / relpath).is_file():
            findings.append(f"missing file: {relpath}")
        elif file_digest(bundle / relpath) != expected:
            findings.append(f"hash mismatch: {relpath}")
        else:
            verified += 1

    if not allow_extra:
        try:
            present = bundle_files(bundle)
        except InputError as exc:
            findings.append(str(exc))
            present = []
        findings.extend(f"undeclared file: {relpath}" for relpath in present if relpath not in declared)

    expected_hash = manifest_hash(manifest)
    signatures: Any = []
    if (bundle / SIGNATURES).exists():
        try:
            signatures = load_json(bundle / SIGNATURES)
        except InputError as exc:
            findings.append(str(exc))
        if not isinstance(signatures, list):
            findings.append(f"{SIGNATURES} must be an array")
            signatures = []
    valid_signers: set[str] = set()
    trusted_signers: set[str] = set()
    for index, record in enumerate(signatures):
        prefix = f"signatures[{index}]"
        if not isinstance(record, dict):
            findings.append(f"{prefix}: must be an object")
            continue
        signer = record.get("signer_id")
        if not isinstance(signer, str) or not signer:
            findings.append(f"{prefix}: signer_id is required")
            continue
        if record.get("format") != SIGNATURE_FORMAT:
            findings.append(f"{prefix}: unsupported signature format")
            continue
        if not verify_signature(record):
            findings.append(f"{prefix}: invalid Ed25519 signature")
            continue
        if record.get("manifest_hash") != expected_hash:
            findings.append(f"{prefix}: signed manifest_hash does not match the manifest")
            continue
        if signer in valid_signers:
            findings.append(f"duplicate signer: {signer}")
            continue
        valid_signers.add(signer)
        if trusted is not None:
            if trusted.get(signer) == record.get("public_key_b64"):
                trusted_signers.add(signer)
            else:
                findings.append(f"{prefix}: key for {signer} is not in the trusted key set")

    counted = len(trusted_signers) if trusted is not None else len(valid_signers)
    if counted < min_signatures:
        findings.append(f"signature threshold not met: {counted} < {min_signatures}")

    return {
        "format": FORMAT,
        "bundle_id": manifest.get("bundle_id"),
        "manifest_hash": expected_hash,
        "status": "VERIFIED" if not findings else "FAILED",
        "files_declared": len(entries),
        "files_verified": verified,
        "signatures_present": len(signatures),
        "signatures_valid": len(valid_signers),
        "signatures_trusted": len(trusted_signers) if trusted is not None else None,
        "trust_mode": "pinned" if trusted is not None else "none",
        "min_signatures": min_signatures,
        "findings": findings,
        "limitations": LIMITATIONS,
    }


def format_text_report(report: dict[str, Any]) -> str:
    summary = report["status"]
    if report["status"] != "ERROR":
        trusted = report["signatures_trusted"]
        trust = "trust not checked" if trusted is None else f"{trusted} trusted"
        summary += (
            f"  {report['bundle_id']}  files {report['files_verified']}/{report['files_declared']}"
            f"  signatures {trust} / {report['signatures_valid']} valid"
        )
    return "\n".join([summary, *[f"  - {finding}" for finding in report["findings"]]])


def cmd_verify(args: argparse.Namespace) -> int:
    if args.min_signatures < 0:
        raise InputError("--min-signatures must be >= 0")
    if args.output is not None:
        bundle_root = args.bundle.resolve()
        output_path = args.output.resolve()
        if output_path == bundle_root or bundle_root in output_path.parents:
            raise InputError("--output must be outside the bundle directory; verification must not modify the bundle")
    trusted = None
    if args.trusted_keys is not None:
        trusted = load_json(args.trusted_keys)
        if not isinstance(trusted, dict) or not all(isinstance(v, str) for v in trusted.values()):
            raise InputError("trusted keys must be a JSON object {signer_id: public_key_b64}")
    report = verify(args.bundle, args.min_signatures, trusted, args.allow_extra)
    text = json.dumps(report, indent=2, sort_keys=True)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(format_text_report(report) if args.format == "text" else text)
    return 0 if report["status"] == "VERIFIED" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="e3bundle", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    keygen = commands.add_parser("keygen", help="generate an Ed25519 signing key")
    keygen.add_argument("--private-key", type=Path, required=True, help="where to write the private key (never inside a bundle)")
    keygen.add_argument("--signer-id", required=True)
    keygen.set_defaults(handler=cmd_keygen)

    manifest = commands.add_parser("manifest", help="hash every file in a bundle into manifest.json")
    manifest.add_argument("bundle", type=Path)
    manifest.add_argument("--bundle-id", required=True)
    manifest.set_defaults(handler=cmd_manifest)

    sign = commands.add_parser("sign", help="append an Ed25519 signature over manifest.json")
    sign.add_argument("bundle", type=Path)
    sign.add_argument("--private-key", type=Path, required=True)
    sign.add_argument("--signer-id", required=True)
    sign.add_argument("--role", default="signer", help="free-text role, e.g. runner or reviewer")
    sign.set_defaults(handler=cmd_sign)

    check = commands.add_parser("verify", help="verify a bundle offline (read-only)")
    check.add_argument("bundle", type=Path)
    check.add_argument("--min-signatures", type=int, default=0)
    check.add_argument("--trusted-keys", type=Path, default=None, help="JSON {signer_id: public_key_b64}; only these keys count")
    check.add_argument("--allow-extra", action="store_true", help="do not fail on files absent from the manifest")
    check.add_argument("--output", type=Path, default=None, help="also write the JSON report to this path")
    check.add_argument("--format", choices=("json", "text"), default="json", help="stdout format (default: json); --output always writes JSON")
    check.set_defaults(handler=cmd_verify)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.handler(args)
    except InputError as exc:
        if args.command == "verify":
            report = {"status": "ERROR", "findings": [str(exc)], "limitations": LIMITATIONS}
            print(format_text_report(report) if args.format == "text" else json.dumps(report, indent=2, sort_keys=True))
        else:
            print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
