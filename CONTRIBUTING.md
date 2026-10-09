# Contributing

Thank you for helping improve E3-001. You do not need to be a cryptography expert to start: the most useful contribution is to **check it yourself** and tell us what happened.

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Questions go to [SUPPORT.md](SUPPORT.md); how decisions are made is in [GOVERNANCE.md](GOVERNANCE.md).

## Choose a level

### Level 1 — Try it (about 10 minutes)

Python 3.11 or newer.

```bash
git clone https://github.com/Traky12/castuo-e3-001.git
cd castuo-e3-001
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install .
e3bundle verify examples/bundles/valid    --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json
e3bundle verify examples/bundles/tampered --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json
```

Expected: the first prints `"status": "VERIFIED"` and exits `0`; the second prints `"status": "FAILED"` with `hash mismatch: data/readings.csv` and exits `1`. Add `--format text` for a human-readable summary.

Then report what happened in [issue #30](https://github.com/Traky12/castuo-e3-001/issues/30) or with the *Reproduction report* form: operating system, Python version, commands, full output, and what worked, failed or confused you. Failures are as valuable as successes.

### Level 2 — Improve the project (1–2 hours)

Pick a scoped task labelled [`good first issue`](https://github.com/Traky12/castuo-e3-001/labels/good%20first%20issue) or [`help wanted`](https://github.com/Traky12/castuo-e3-001/labels/help%20wanted). Each one states its goal, the files involved and how it will be accepted. Documentation, tests, accessibility and translation count as much as code.

### Level 3 — Independent E3-001 review (formal process)

Two reviewers who are not authors of the implementation or the package are needed (current state: 0 of 2 signed reviews). The procedure is in [PROTOCOL.md](PROTOCOL.md): clean offline environment, your own runner identity, an Ed25519-signed attestation whose private key never leaves your machine, and a substantive review of fixture, commands, output, negative cases, recovery, hashes and limits.

The full S-001A foreign replay needs the replay harness (`scripts/run_s001a_foreign_replay.py`), which is not published in this repository. Until it is, a clean clone reproduces the verifiers and example bundles, not the complete replay scenario. If you want to review, open a [Discussion](https://github.com/Traky12/castuo-e3-001/discussions) and the maintainer will explain how controlled-review material is shared.

### Security

Never report a vulnerability in a public issue. Use [Security → Report a vulnerability](https://github.com/Traky12/castuo-e3-001/security/advisories/new) as described in [SECURITY.md](SECURITY.md).

## Development setup

```bash
python -m pip install -e . pytest
python -m pytest tests -v
```

Tests run on Linux in CI (Python 3.11, 3.12 and 3.13); that run is the reference result. Tests that need symlinks are skipped where the platform does not allow them.

The S-001A validator's synthetic demo is expected to report `DEMO_VALIDATED`, never `VERIFIED_FOR_G2`, and the G2 evaluator must block it. That is an intentional assurance boundary, not a failing test.

## Pull requests

- One purpose per pull request; add a focused test for every behaviour change and negative cases for security-sensitive code (tests first is preferred).
- Explain what changes, why, and how you validated it. Fill in the pull request template.
- Keep claims bounded. Passing tests or a synthetic bundle is not independent validation, certification, production readiness or evidence that a real-world claim is true.
- Do not add dependencies without explaining the need and their maintenance and licence posture.
- Keep CI permissions minimal and pin third-party GitHub Actions to commit SHAs.
- Preserve the promotion firewall: `oneA: false` and `promotion: BLOCKED`; this repository does not grant promotion.
- Use only synthetic or public data. Never include private keys, tokens or credentials.
- Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `ci:`, `refactor:`, `test:`. Do not bypass hooks or checks.

## AI-assisted contributions

AI tools may be used to draft code, tests and documentation. The rules are the same as for any contribution:

- You are responsible for every line you submit and must be able to explain it.
- Behaviour changes need tests that you ran; paste the command and result in the pull request.
- Say in the pull request description if a substantial part was AI-generated.
- Generated text must not add claims (certification, validation, adoption, performance) that the repository does not evidence.

The maintainer reviews and approves every merge; no AI tool merges or approves changes. Linux CI on the latest commit of the pull request is the reference check.

## Recognition

Accepted contributions are listed in [CONTRIBUTORS.md](CONTRIBUTORS.md) and in the release notes. Independent E3-001 reviewers are recorded in the review evidence when their signed review is accepted.
