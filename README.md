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

**Release status (2026-10-10): no approved v0.1.2 or v0.1.3 release is available.** The v0.1.2 files on `main` are an unpublished candidate; the `v0.1.2` Git tag does not exist. Do not install or pin `@v0.1.2`, and do not use the current `main` candidate for security-sensitive verification while release review is pending. The last earlier tag is v0.1.1, but it is not represented as a fix for the pending release review. The hosted publication gate remains closed.

Python 3.11 or newer. The unit/CLI suite is intended for CI on Ubuntu, macOS and Windows with Python 3.11–3.13; that matrix must be green on the exact release commit before publication. PyPI availability is not claimed. For source inspection only, clone the repository and run `python scripts/e3bundle.py --help`; source checkout use is not a release or a production recommendation.

## Try it in your browser

Verify the signed example bundles without installing anything: **[open the browser demo](https://traky12.github.io/castuo-e3-001/)**.

The demo uses the real `v0.1.1` example bundles and performs SHA-256 and Ed25519 verification locally with WebCrypto. You can tamper with the files in eight ways, create and sign your own bundle and verify it later with the CLI, or [verify a bundle folder from your device](https://traky12.github.io/castuo-e3-001/paquete.html) without uploading it (browser limits: 200 files, 50 MiB). On every change, CI checks that the demo gives the same result as the `v0.1.1` CLI (`docs/demo/tests/`) in Chromium, Firefox and WebKit. Data is synthetic; a successful verification does not certify that content is true.

## Run with Docker

**Container publication is currently not claimed.** Do not pull or rely on a `0.1.2` image as a published release: the v0.1.2 tag and the corresponding release were not found during the 2026-10-10 repository audit. Versioned container instructions and attestation checks will be restored only after the corrected, approved release has been tagged, published and verified.

## 30-second demo

![Terminal: the valid bundle verifies with exit code 0; the tampered bundle fails with hash mismatch: data/readings.csv and exit code 1](docs/assets/demo.svg)

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

For a human-readable summary, add `--format text`:

```console
$ e3bundle verify examples/bundles/valid --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json --format text
VERIFIED  example-001  files 2/2  signatures 2 trusted / 2 valid
$ e3bundle verify examples/bundles/tampered --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json --format text
FAILED  example-001  files 1/2  signatures 2 trusted / 2 valid
  - hash mismatch: data/readings.csv
```

JSON remains the default (`--format json`). `--format` changes stdout only:
`--output reports/verification.json` still writes the full JSON verification
report, including limitations, even with `--format text`. Exit codes are
unchanged. Input errors print `ERROR` and its findings in the selected format;
as before, they do not write an output file. Without `--trusted-keys`, the text
summary says `trust not checked` rather than implying signer identity was verified.

`--format text` is available from v0.1.1; `v0.1.0` supports JSON output only.

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

The composite Action is present in this repository, but the current main-branch candidate is **not a released version**. Do not pin the former v0.1.2 candidate SHA as a published release reference. Wait for the security review, corrected version tag, published artifacts and passing release checks before adopting a versioned Action example. Any consuming workflow should use a full 40-character commit SHA and provide an explicit trusted-key set with a positive signature threshold.

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

- PyPI package (`pip install e3bundle`) once the `e3.bundle.v1` format is stable enough.
- Detached signature export and key rotation guidance.
- Optional RFC 3161 timestamping.

Changes are recorded in [CHANGELOG.md](CHANGELOG.md). Contributions, bug reports and *reproduction reports* are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). The [public adoption roadmap](docs/PUBLIC_ADOPTION_PLAN.md) records tester-first milestones and community work.

## Community

Start in 10 minutes, improve the project in an hour, or become an independent E3-001 reviewer: see the contribution levels in [CONTRIBUTING.md](CONTRIBUTING.md). Questions: [SUPPORT.md](SUPPORT.md). Decisions and AI-assisted development: [GOVERNANCE.md](GOVERNANCE.md). Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Thanks to everyone in [CONTRIBUTORS.md](CONTRIBUTORS.md).

### What we need now

Targets for Phase 1 of the [public adoption plan](docs/PUBLIC_ADOPTION_PLAN.md), not achievements. Counts as of 2026-10-10, each checkable from the linked source:

| Target | Now | Source |
|---|---|---|
| Independent reproductions (CLI path) | 0 / 5 | [#30](https://github.com/Traky12/castuo-e3-001/issues/30), label [`tester-report`](https://github.com/Traky12/castuo-e3-001/labels/tester-report) |
| Merged pull requests from external contributors | 1 / 3 | [CONTRIBUTORS.md](CONTRIBUTORS.md) |
| Signed independent E3-001 reviews | 0 / 2 | [PROTOCOL.md](PROTOCOL.md) |
| Known uses of the GitHub Action outside this repository | 0 / 2 | open a [Discussion](https://github.com/Traky12/castuo-e3-001/discussions) to report one |

Scoped tasks: [`good first issue`](https://github.com/Traky12/castuo-e3-001/labels/good%20first%20issue) · [`help wanted`](https://github.com/Traky12/castuo-e3-001/labels/help%20wanted) · [`documentation`](https://github.com/Traky12/castuo-e3-001/labels/documentation) · [`testing`](https://github.com/Traky12/castuo-e3-001/labels/testing).

Every change goes through a pull request with public review and automated tests; changes without context, a test or a reason are not merged. An accepted contribution or a successful reproduction is not a validation, certification or institutional endorsement of the project.

---

## E3-001 protocol

`e3bundle` is also the public tooling of the CASTÚO-SYSTEM E3-001 public protocol for controlled independent reproduction. Controlled-review material may be provided under defined review conditions; the private core stays outside the public scope, and a successful reproduction does not validate, certify or promote it. Castuo-system remains the private canonical authority for current technical state and promotion decisions.

**Current state:** external replay pending · signed review 0/2 · promotion `BLOCKED`. The replay harness is not published here, so a clean clone reproduces the verifiers and example bundles, not the complete S-001A replay.

Full protocol, authority boundary, synthetic S-001A demo and history: [docs/E3-001.md](docs/E3-001.md) · [PROTOCOL.md](PROTOCOL.md) · [STATUS.md](STATUS.md).

## License

MIT — see [LICENSE](LICENSE).
