#!/usr/bin/env python3
"""Documentation regression gate for the E3-001 public surface.

Checks README.md and the 2026-08-22 historical integration records for
authority-boundary regressions: private repository links, local paths,
forbidden vocabulary, castuo-evolution presented as an authority, unqualified
public claims and historical records presented as current state.

This is a regression control, not a status authority. Claim terms are matched
per sentence and a sentence that carries a negation ("not", "does not",
"never", "pending" ...) is treated as a non-claim, so explanatory negative
wording passes while affirmative wording fails.

Usage:
    python3 scripts/validate_public_snapshot.py [--root .]
    python3 scripts/validate_public_snapshot.py --self-test
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

README = "README.md"
HISTORICAL = (
    "docs/CASTUO_ECOSYSTEM_INTEGRATION_2026-08-22.md",
    "docs/CASTUO_DEEP_AUDIT_2026-08-22.md",
    "docs/governance/CASTUO-ECOSYSTEM-SYNC-2026-08-22.md",
)
HISTORICAL_HEADER = "Historical integration record — 2026-08-22"

# Public Traky12 repositories that may be linked from this public surface.
PUBLIC_REPOS = {
    "traky12",
    "castuo-evidence",
    "castuo-e3-001",
    "cast-o",
    "castuo-agro-edge",
    "castuo-offline-field-operations",
}

# Always forbidden, whatever the sentence says.
FORBIDDEN_TOKENS = (
    (r"control[ -]plane", "control plane"),
    (r"\bSSOT\b", "SSOT"),
    (r"/manus-storage/", "/manus-storage/"),
    (r"scratchpad", "scratchpad"),
    (r"/home/", "/home/"),
    (r"/Users/", "/Users/"),
    (r"\b[A-Za-z]:\\", "local Windows path"),
    (r"github\.com/Traky12/Castuo-system", "link to private Castuo-system"),
)

# Literal authority assertions about castuo-evolution: always forbidden.
EVOLUTION_LITERALS = (
    "castuo-evolution is the authority",
    "castuo-evolution as authority",
    "castuo-evolution as promotion authority",
    "castuo-evolution as validation authority",
    "castuo-evolution as gate g2",
    "castuo-evolution como autoridad",
    "castuo-evolution for governance",
)
EVOLUTION_ROLE = re.compile(
    r"authority|autoridad|source of truth|fuente de verdad|\bSSOT\b|\bgate\b|\bG2\b",
    re.IGNORECASE,
)

# Claim terms (EN/ES): forbidden only in sentences without a negation.
CLAIM_TERMS = re.compile(
    r"production[- ]validated|validated in production|producci[oó]n validada"
    r"|independently validated|independent validation completed"
    r"|validaci[oó]n independiente completada"
    r"|certif\w*|certificad\w*"
    r"|real pilot|piloto real"
    r"|\bcustomers?\b|\bclientes?\b"
    r"|\brevenue\b|\bingresos\b"
    r"|commercial traction|customer traction|tracci[oó]n comercial",
    re.IGNORECASE,
)
NEGATION = re.compile(
    r"\b(not|no|never|nor|without|non|cannot|isn't|doesn't|pending|"
    r"NOT_CLAIMED|NO_CLAIM|sin|ni|nunca|pendiente)\b|\bno se\b",
    re.IGNORECASE,
)

CANONICAL_AUTHORITY = re.compile(
    r"Castuo-system\W[^.\n]*\b(remains|is)\b[^.\n]*\bcanonical\b[^.\n]*\bauthority\b",
    re.IGNORECASE,
)
DELIMITATION = (
    (re.compile(r"public protocol", re.IGNORECASE), "public protocol"),
    (re.compile(r"controlled[- ]review material", re.IGNORECASE), "controlled-review material"),
    (re.compile(r"private core", re.IGNORECASE), "private core"),
)

HISTORICAL_AS_CURRENT = (
    (r"\bthe current (canonical|ecosystem|integration)\b", "historical state written as current"),
    (r"\bcurrent canonical\b", "historical state written as current"),
    (r"\bsynchronized (core )?checkpoint\b", "historical checkpoint written as current"),
    (r"\bremains \[", "historical link written as current"),
)
GITHUB_URL = re.compile(r"github\.com/Traky12/([A-Za-z0-9_.-]+)", re.IGNORECASE)
FULL_SHA = re.compile(r"\b[0-9a-f]{40}\b")
REL_LINK = re.compile(r"\]\((?!https?://|mailto:|#)([^)\s#]+)")


def sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+|\n", text) if s.strip()]


def common_findings(text: str) -> list[str]:
    findings = []
    for pattern, label in FORBIDDEN_TOKENS:
        if re.search(pattern, text, re.IGNORECASE):
            findings.append(f"forbidden: {label}")
    for match in GITHUB_URL.finditer(text):
        if match.group(1).lower() not in PUBLIC_REPOS:
            findings.append(f"link to non-public repository: {match.group(1)}")
    lowered = text.lower()
    for literal in EVOLUTION_LITERALS:
        if literal in lowered:
            findings.append(f"castuo-evolution authority assertion: '{literal}'")
    for sentence in sentences(text):
        if "castuo-evolution" in sentence.lower() and EVOLUTION_ROLE.search(sentence) and not NEGATION.search(sentence):
            findings.append(f"castuo-evolution presented with an authority role: {sentence.strip()[:120]}")
    return findings


def check_readme(text: str, root: Path | None = None) -> list[str]:
    findings = common_findings(text)
    for sentence in sentences(text):
        term = CLAIM_TERMS.search(sentence)
        if term and not NEGATION.search(sentence):
            findings.append(f"unqualified claim '{term.group(0)}': {sentence.strip()[:120]}")
    if not CANONICAL_AUTHORITY.search(text):
        findings.append("missing: Castuo-system as private canonical authority")
    for pattern, label in DELIMITATION:
        if not pattern.search(text):
            findings.append(f"missing delimitation: {label}")
    if root is not None:
        for target in REL_LINK.findall(text):
            if not (root / target).exists():
                findings.append(f"broken relative link: {target}")
    return findings


def check_historical(text: str) -> list[str]:
    findings = common_findings(text)
    if HISTORICAL_HEADER not in text:
        findings.append(f"missing header: {HISTORICAL_HEADER}")
    if FULL_SHA.search(text):
        findings.append("full commit SHA exposed")
    body = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith(">"))
    for pattern, label in HISTORICAL_AS_CURRENT:
        if re.search(pattern, body, re.IGNORECASE):
            findings.append(label)
    return findings


def run(root: Path) -> dict[str, list[str]]:
    results: dict[str, list[str]] = {}
    try:
        results[README] = check_readme((root / README).read_text(encoding="utf-8"), root)
    except OSError as exc:
        results[README] = [f"unreadable: {exc}"]
    for name in HISTORICAL:
        try:
            results[name] = check_historical((root / name).read_text(encoding="utf-8"))
        except OSError as exc:
            results[name] = [f"unreadable: {exc}"]
    return results


def self_test() -> int:
    good_readme = (
        "E3-001 is a bounded public protocol. Controlled-review material may be provided. "
        "It does not validate the private core.\n"
        "Castuo-system remains the private canonical authority for current technical state.\n"
        "castuo-evolution is not a canonical authority.\n"
        "It is not a production certification.\n"
    )
    header = f"> **{HISTORICAL_HEADER}**\n>\n> Not current state.\n"
    cases = [
        ("readme ok", check_readme(good_readme), False),
        ("negated evolution", check_readme(good_readme + "castuo-evolution is not an authority, SSOT-free.\n"), True),
        ("evolution authority", check_readme(good_readme + "castuo-evolution is the authority and governance layer.\n"), True),
        ("control plane", check_readme(good_readme + "Traky12 is the public control plane.\n"), True),
        ("private link", check_readme(good_readme + "[x](https://github.com/Traky12/Castuo-system/pull/1)\n"), True),
        ("other private repo", check_readme(good_readme + "[x](https://github.com/Traky12/goldfish)\n"), True),
        ("public link", check_readme(good_readme + "[x](https://github.com/Traky12/castuo-evidence)\n"), False),
        ("claim", check_readme(good_readme + "The platform is certified and has paying customers.\n"), True),
        ("negated claim", check_readme(good_readme + "This does not claim certification or customers.\n"), False),
        ("missing authority", check_readme(good_readme.replace("remains the private canonical", "is a")), True),
        ("missing delimitation", check_readme(good_readme.replace("private core", "core")), True),
        ("local path", check_readme(good_readme + "See C:\\Users\\x\n"), True),
        ("historical ok", check_historical(header + "At the time of this snapshot the root was private.\n"), False),
        ("historical no header", check_historical("At the time of this snapshot.\n"), True),
        ("historical sha", check_historical(header + "checkpoint " + "a" * 40 + "\n"), True),
        ("historical as current", check_historical(header + "The current canonical root is X.\n"), True),
        ("historical private url", check_historical(header + "https://github.com/Traky12/Castuo-system\n"), True),
    ]
    failures = [name for name, findings, expect_fail in cases if bool(findings) != expect_fail]
    print(json.dumps({"self_test": "FAIL" if failures else "PASS", "cases": len(cases), "failures": failures}, indent=2))
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    results = run(args.root)
    authority_ok = not results[README]
    historical_ok = not any(results[name] for name in HISTORICAL)
    print("Authority boundary check: " + ("PASS — validated current public surfaces." if authority_ok else "BLOCKED"))
    print("Historical document check: " + ("PASS — validated historical headers and no private references." if historical_ok else "BLOCKED"))
    blocked = {name: findings for name, findings in results.items() if findings}
    if blocked:
        print(json.dumps({"status": "BLOCKED", "findings": blocked}, indent=2, ensure_ascii=False))
        return 1
    print(json.dumps({"status": "PASS", "checked": sorted(results)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
