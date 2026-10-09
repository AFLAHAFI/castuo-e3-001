# Contributing

Thank you for helping improve E3-001. Bug reports, reproduction attempts and small, focused pull requests are welcome.

## Before you start

- Read the scope section in [README.md](README.md): this repository verifies declared integrity and signature predicates; it does not assess whether evidence content is true.
- Never commit private keys, tokens or real personal data. Test fixtures must be synthetic.

## Development setup

```bash
python -m pip install -r requirements.txt pytest
python -m pytest tests -v
```

Tests run on Linux in CI (Python 3.11, 3.12 and 3.13); that run is the reference result. Tests that need symlinks are skipped where the platform does not allow them.

## Pull requests

- One purpose per pull request; add a test for every behaviour change (tests first is preferred).
- Keep the claim boundary intact: wording must not imply certification, production readiness or independent validation that has not happened.
- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `test:`.
- Do not bypass hooks or checks.

## Reporting a reproduction

If you ran the demo or verified your own bundle, open an issue with the *Reproduction report* template. Reports of failures are as valuable as successes.

## Security

Do not open public issues for vulnerabilities; follow [SECURITY.md](SECURITY.md).
