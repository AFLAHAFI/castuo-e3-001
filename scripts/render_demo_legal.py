#!/usr/bin/env python3
"""Render the e3bundle demo legal page from owner-managed deployment secrets.

Personal legal fields are deliberately excluded from repository source and Git history.
The resulting GitHub Pages artifact is public, so adding these secrets authorizes their
display on the public legal page; never print or log their values.
"""
from __future__ import annotations

import argparse
import html
import os
import re
from collections.abc import Mapping
from pathlib import Path

REQUIRED_FIELDS = (
    "DEMO_LEGAL_NIF",
    "DEMO_LEGAL_ADDRESS",
    "DEMO_LEGAL_EMAIL",
)

TOKENS = {
    "{{LEGAL_NIF}}": "DEMO_LEGAL_NIF",
    "{{LEGAL_ADDRESS}}": "DEMO_LEGAL_ADDRESS",
    "{{LEGAL_EMAIL}}": "DEMO_LEGAL_EMAIL",
    "{{LEGAL_EMAIL_HREF}}": "DEMO_LEGAL_EMAIL",
}
TOKEN_PATTERN = re.compile(r"\{\{LEGAL_[A-Z_]+\}\}")


def render(template: str, values: Mapping[str, str]) -> str:
    """Return rendered HTML, with every supplied field HTML-escaped and no logs."""
    clean: dict[str, str] = {}
    for name in REQUIRED_FIELDS:
        value = values.get(name, "")
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"missing required legal field: {name}")
        if any(ord(char) < 32 for char in value):
            raise ValueError(f"control characters are not allowed in: {name}")
        if "{{" in value or "}}" in value:
            raise ValueError(f"template delimiters are not allowed in: {name}")
        clean[name] = value.strip()

    if not re.fullmatch(r"""[^@\s<>"']+@[^@\s<>"']+""", clean["DEMO_LEGAL_EMAIL"]):
        raise ValueError("DEMO_LEGAL_EMAIL must be a valid email address")

    expected_tokens = set(TOKENS)
    absent = expected_tokens.difference(TOKEN_PATTERN.findall(template))
    if absent:
        raise ValueError("legal template is missing required markers")

    rendered = template
    for token, env_name in TOKENS.items():
        rendered = rendered.replace(token, html.escape(clean[env_name], quote=True))

    if TOKEN_PATTERN.search(rendered):
        raise ValueError("legal template contains unresolved markers")
    return rendered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="path to the legal HTML template")
    parser.add_argument("destination", type=Path, help="path to the rendered HTML output")
    args = parser.parse_args()

    values = {name: os.environ.get(name, "") for name in REQUIRED_FIELDS}
    rendered = render(args.source.read_text(encoding="utf-8"), values)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_text(rendered, encoding="utf-8", newline="\n")
    print("Legal template rendered successfully; values redacted.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
