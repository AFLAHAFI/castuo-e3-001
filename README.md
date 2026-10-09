# e3bundle — verify evidence bundles offline

[![Tests](https://github.com/Traky12/castuo-e3-001/actions/workflows/tests.yml/badge.svg)](https://github.com/Traky12/castuo-e3-001/actions/workflows/tests.yml)
![Python 3.11–3.13](https://img.shields.io/badge/python-3.11%E2%80%933.13-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Status: alpha](https://img.shields.io/badge/status-alpha-orange)

**Detect any change to a folder of evidence files, and check who signed it, without a server.**

`e3bundle` records the SHA-256 of every file in a directory, lets one or more people sign that manifest with Ed25519, and verifies the result offline: changed, missing or added files and forged or stale signatures are reported in a machine-readable JSON report with a clear exit code.

It is part of the E3-001 public protocol of CASTÚO-SYSTEM, but it works on any directory and needs nothing from CASTÚO.

## Why

Test reports, datasets, audit exports and lab results are often shared as plain folders or zips. Months later, nobody can easily show that the files are the ones that were reviewed, or who approved them. Hosted signing services solve this, but add accounts, network access and a third party. `e3bundle` keeps it to one Python file, one dependency (`cryptography`) and plain JSON you can read.

## Install

```bash
python -m pip install "git+https://github.com/Traky12/castuo-e3-001@v0.1.0"
e3bundle --help
```

Python 3.11 or newer. Latest release: [v0.1.0](https://github.com/Traky12/castuo-e3-001/releases/tag/v0.1.0) (alpha). Not yet published on PyPI. From a clone you can also run `python scripts/e3bundle.py`.

## 30-second demo

The repository ships two signed example bundles: [`valid`](examples/bundles/valid) and [`tampered`](examples/bundles/tampered), which differs by one temperature value in `data/readings.csv`.

```console
$ e3bundle verify examples/bundles/valid --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json
{ ... "files_verified": 2, "signatures_trusted": 2, "status": "VERIFIED", "findings": [] ... }
$ echo $?
0

$ e3bundle verify examples/bundles/tampered --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json
{ ... "files_verified": 1, "status": "FAILED", "findings": ["hash mismatch: data/readings.csv"] ... }
$ echo $?
1
```

Both commands run in CI on every change, so this output is checked, not illustrative.

For a human-readable summary, use `--format text` (available from the current
source checkout; not included in v0.1.0):

```console
$ python scripts/e3bundle.py verify examples/bundles/tampered --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json --format text
FAILED  example-001  files 1/2  signatures 2 trusted / 2 valid
  - hash mismatch: data/readings.csv
```

JSON remains the default (`--format json`). `--format` changes stdout only:
`--output reports/verification.json` still writes the full JSON verification
report, including limitations, even with `--format text`. Exit codes are
unchanged. Input errors print `ERROR` and its findings in the selected format;
as before, they do not write an output file. Without `--trusted-keys`, the text
summary says `trust not checked` rather than implying signer identity was verified.

## Use it on your own files

```bash
e3bundle keygen   --private-key ~/keys/alice.key --signer-id alice        # once per signer
e3bundle manifest my-bundle --bundle-id my-bundle-001                     # hash every file
e3bundle sign     my-bundle --private-key ~/keys/alice.key --signer-id alice --role reviewer
e3bundle verify   my-bundle --min-signatures 1 --trusted-keys trusted.json
```

`trusted.json` maps signer ids to public keys, for example `{"alice": "<public_key_b64 from ~/keys/alice.pub.json>"}`. Keep private keys outside the bundle and outside any repository.

| Exit code | Meaning |
|---|---|
| `0` | `VERIFIED` — files unchanged, nothing undeclared, signature threshold met |
| `1` | `FAILED` — see `findings` |
| `2` | `ERROR` — unreadable manifest or invalid input |

What `verify` detects: modified, missing and undeclared files; path traversal and symlinks; signatures that are forged, made over an older manifest, duplicated, or (with `--trusted-keys`) made with a key you did not pin.

## Use it in GitHub Actions

```yaml
- uses: Traky12/castuo-e3-001@<full-commit-sha>   # pin to a commit SHA
  with:
    bundle: evidence/release-42
    min-signatures: "2"
    trusted-keys: .github/trusted-keys.json
```

The step writes the JSON report (`report-path`, default `e3bundle-report.json`), adds the findings to the job summary and fails when verification does not pass. Set `fail-on-error: "false"` to keep the job going and branch on the `status` output (`VERIFIED`, `FAILED` or `ERROR`) instead; GitHub does not expose outputs of a failed step.

## Limits

A `VERIFIED` result means the declared files are unchanged and enough valid signatures cover this exact manifest. It does not mean:

- that the content is true or correct;
- who signed, unless you pin keys with `--trusted-keys`;
- that signers are independent of each other or of the author;
- when something was signed (`signed_at` is self-declared, there is no timestamp authority);
- that keys were not compromised or have not been revoked (there is no revocation list);
- it is not a certification, regulatory compliance assessment or production authorization.

The bundle format `e3.bundle.v1` is **experimental** and may change before `1.0`.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). The tool never reads private keys during `verify`, makes no network calls and does not modify the bundle.

## Roadmap (proposed, not committed)

- PyPI package.
- Detached signature export and key rotation guidance.
- Optional RFC 3161 timestamping.

Changes are recorded in [CHANGELOG.md](CHANGELOG.md). Contributions, bug reports and *reproduction reports* are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). The [public adoption roadmap](docs/PUBLIC_ADOPTION_PLAN.md) records tester-first milestones and community work.

---

## E3-001: the CASTÚO external verification protocol

This repository is also the public protocol for independently replaying and reviewing the CASTÚO S-001A vertical slice. The procedure and acceptance criteria are in [PROTOCOL.md](PROTOCOL.md). It is not a production certification, commercial proof, maturity claim or authorization service.

> **A local candidate never counts as independent verification.**

**Current state** (detail in [STATUS.md](STATUS.md)): external replay pending · signed human review pending (0/2) · G2 review required · staging handoff blocked · promotion `BLOCKED`.

### Authority and Promotion Boundary

E3-001 is a bounded public protocol for controlled independent reproduction.

A successful reproduction may provide evidence within the declared scope. It does not independently validate, certify or promote the private core.

Castuo-system remains the private canonical authority for current technical state and promotion decisions.

castuo-evolution may contain historical or prepared governance material, but it is not a promotion authority, synchronized source of truth or validation gate for E3-001.

The public protocol is intended to contain enough information to reproduce the declared bounded claim without exposing non-public implementation, credentials, sensitive IP or private operational material. Controlled-review material may be provided under defined review conditions where appropriate.

### Verification sequence

```text
freeze package → independent runner executes replay → runner attestation signs result hash
→ two independent humans sign review entries → external bundle validator passes
→ G2 evaluator passes → evidence handed to Castuo-system for a staging-rls and promotion decision
```

The first unmet predicate stops the sequence. `oneA` remains false and `promotion` remains `BLOCKED` throughout. A passing G2 evaluation is evidence within the declared scope, not a promotion decision.

```bash
python scripts/validate_external_evidence_bundle.py <bundle> --min-reviewers 2 --output external-evidence-validation.json
python scripts/evaluate_g2.py external-evidence-validation.json --output g2-decision.json
```

The S-001A validator requires a frozen manifest, fixture, replay result, evidence envelope, runner attestation and signed reviewer quorum.

### Try the S-001A validator (synthetic demo)

```bash
python -m pip install -r requirements.txt
python examples/make_demo_bundle.py demo/ok
python scripts/validate_external_evidence_bundle.py demo/ok --output demo/ok-validation.json        # exit 0
python examples/make_demo_bundle.py demo/bad --tamper result
python scripts/validate_external_evidence_bundle.py demo/bad --output demo/bad-validation.json      # exit 1
```

`--tamper` modes: `result`, `fixture`, `attestation-signature`, `reviewer-signature`, `reviewer-quorum`, `reviewer-duplicate`, `local-runner`, `production-claim`, `missing-envelope`.

> **The demo bundle is not evidence.** Its keys are generated in memory and discarded, its runner and reviewers are fictional `DEMO-*` identities, and it contains no S-001A replay. The validator reports `DEMO_VALIDATED`, sets `g2_eligible: false`, and the G2 evaluator must return `BLOCKED`. A passing demo shows only that structural checks work; it says nothing about the independence or identity of a runner or reviewer, the truth of a claim, or CASTÚO-SYSTEM.

### Architectural identity

- **Architectural name:** `castuo-replay-protocol` · **Role:** controlled external replay and independent-review protocol · **Status:** `PENDING`
- **Boundary:** reproduction protocol within declared scope; not a certification, promotion or runtime authority.
- **Quality profile:** [`.castuo/repository-profile.yaml`](.castuo/repository-profile.yaml)
- **Chain of custody:** `castuo-evidence` (frozen fixture and replay artifacts) → this repository (public protocol, validators, read-only G2 evaluator) → `Castuo-system` *(private; canonical authority for implementation, staging-rls and promotion)*.

### Repository contents

| Path | Purpose |
|---|---|
| `scripts/e3bundle.py` · `action.yml` · `pyproject.toml` | Generic bundle tool, GitHub Action and packaging |
| `examples/` | Signed example bundles and the S-001A demo generator |
| `PROTOCOL.md` · `STATUS.md` | S-001A procedure, acceptance criteria and current public state |
| `schemas/` · `templates/` | Portable manifest contract and redacted templates (no keys or secrets) |
| `scripts/validate_external_evidence_bundle.py` · `scripts/evaluate_g2.py` | S-001A validator and read-only G2 evaluator |

### Related surfaces and history

- [Public profile and claim boundary](https://github.com/Traky12/Traky12) · `Castuo-system` *(private)*: canonical technical authority · `castuo-evolution` *(private)*: evolution and governance workspace, not an authority.
- Historical records for their declared snapshot date only, not current state: [ecosystem integration record of 2026-08-22](docs/CASTUO_ECOSYSTEM_INTEGRATION_2026-08-22.md) and [deep audit of 2026-08-22](docs/CASTUO_DEEP_AUDIT_2026-08-22.md). They do not claim production readiness, certification, field validation or independent review.

## License

MIT — see [LICENSE](LICENSE).
