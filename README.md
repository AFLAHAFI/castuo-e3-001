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
python -m pip install "git+https://github.com/Traky12/castuo-e3-001@v0.1.1"
e3bundle --help
```

Python 3.11 or newer. The unit/CLI suite is tested in CI on Ubuntu, macOS and Windows with Python 3.11–3.13; the composite Action and clean-wheel packaging job run on Ubuntu. Other OS/Python combinations are not currently part of the automated matrix. Latest release: [v0.1.1](https://github.com/Traky12/castuo-e3-001/releases/tag/v0.1.1) (alpha). Not yet published on PyPI. From a clone you can also run `python scripts/e3bundle.py`.

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

**Release compatibility:** `--format text` is present in the current source for the next release candidate; it is **not available in the immutable `v0.1.0` tag**. The `v0.1.1` release has not been published yet. Users installing `@v0.1.0` should use JSON mode; do not treat this main-branch example as proof that the released tag supports text output.

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
- uses: Traky12/castuo-e3-001@d68f0d788e8f991bfc3670353cc4912ece7456cb # v0.1.0 alpha (exact release commit)
  with:
    bundle: evidence/release-42
    min-signatures: "2"
    trusted-keys: .github/trusted-keys.json
```

For supply-chain safety, use the full commit SHA shown on the [release page](https://github.com/Traky12/castuo-e3-001/releases), not a moving tag. The SHA above is the verified commit behind the existing `v0.1.0` alpha tag; do not reference `v0.1.1` until a matching tag/release exists.

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

---

## E3-001 protocol

`e3bundle` is also the public tooling of the CASTÚO-SYSTEM E3-001 public protocol for controlled independent reproduction. Controlled-review material may be provided under defined review conditions; the private core stays outside the public scope, and a successful reproduction does not validate, certify or promote it. Castuo-system remains the private canonical authority for current technical state and promotion decisions.

**Current state:** external replay pending · signed review 0/2 · promotion `BLOCKED`. The replay harness is not published here, so a clean clone reproduces the verifiers and example bundles, not the complete S-001A replay.

Full protocol, authority boundary, synthetic S-001A demo and history: [docs/E3-001.md](docs/E3-001.md) · [PROTOCOL.md](PROTOCOL.md) · [STATUS.md](STATUS.md).

## License

MIT — see [LICENSE](LICENSE).
