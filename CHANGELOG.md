# Changelog

All notable changes to this repository are documented here. Versions follow [Semantic Versioning](https://semver.org/); before `1.0` the bundle format and command-line interface may change.

## [Unreleased]

### Added
- `scripts/e3bundle.py`: generic offline bundle tool (`keygen`, `manifest`, `sign`, `verify`) for format `e3.bundle.v1` (experimental). Detects modified, missing and undeclared files, unsafe paths, symlinks, forged or stale signatures and duplicate signers; supports pinned trusted keys and a signature threshold.
- `examples/make_demo_bundle.py`: synthetic S-001A demo bundle with in-memory keys and nine `--tamper` modes.
- `requirements.txt` declaring the `cryptography` dependency.
- Unit tests for both validators and a Linux CI workflow (Python 3.11–3.13) that also runs the README quickstarts.

### Changed
- `PROTOCOL.md` states that `scripts/run_s001a_foreign_replay.py` is not published in this repository.
