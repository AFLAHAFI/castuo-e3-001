# E3-001 External Verification Protocol

E3-001 is the public, evidence-scoped protocol for independently replaying and reviewing the CASTÚO S-001A vertical slice. This repository is a protocol and verification surface. It is not a production certification, commercial proof, maturity claim or authorization service.

> **A local candidate never counts as independent verification.**

The protocol freezes the fixture, source commit, commands, expected decisions, hashes, runner attestation, human review and G2 handoff as separate, inspectable artifacts.

## e3bundle — verify evidence bundles offline

`scripts/e3bundle.py` is a small, dependency-light command-line tool (Python 3.11+, `cryptography`) that works on any directory of files, not only S-001A:

- **manifest** — record the SHA-256 of every file in a bundle;
- **sign** — append Ed25519 signatures over the canonical manifest;
- **verify** — check, offline and read-only, that no file was changed, removed or added and that enough valid signatures are present, optionally only from pinned public keys.

```bash
python -m pip install -r requirements.txt

python scripts/e3bundle.py keygen --private-key ~/keys/alice.key --signer-id alice
python scripts/e3bundle.py manifest my-bundle --bundle-id my-bundle-001
python scripts/e3bundle.py sign my-bundle --private-key ~/keys/alice.key --signer-id alice --role reviewer

echo '{"alice": "<public_key_b64 from ~/keys/alice.pub.json>"}' > trusted.json
python scripts/e3bundle.py verify my-bundle --min-signatures 1 --trusted-keys trusted.json
```

`verify` prints a JSON report and exits `0` (verified), `1` (verification failed, findings listed) or `2` (unreadable input). Keep private keys outside the bundle and outside any repository.

**Scope.** A `VERIFIED` result means the declared files are unchanged and the required signatures are valid over this exact manifest. It does not prove that the content is true. Without `--trusted-keys` it does not establish who signed, and it never establishes signer independence. It is not a certification, compliance assessment or production authorization.

The format is `e3.bundle.v1` and is **experimental**: it may change before `v1.0`. See [CHANGELOG.md](CHANGELOG.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Architectural identity

- **Architectural name:** `castuo-replay-protocol`
- **Role:** Controlled external replay and independent-review protocol.
- **Boundary:** Reproduction protocol within declared scope; not a certification, promotion or runtime authority.
- **Status:** `PENDING`
- **Quality profile:** [`.castuo/repository-profile.yaml`](.castuo/repository-profile.yaml)

## Chain of custody

```text
castuo-evidence
  → frozen fixture and replay artifacts
castuo-e3-001 (this repository)
  → public protocol, external bundle validator and read-only G2 evaluator
Castuo-system (private)
  → canonical authority: bounded implementation, protected staging-rls
    and promotion decisions
CASTÚO Field Signal Ledger
  → public status and claim boundary
```

## Verification sequence

```text
freeze package
→ independent runner executes replay
→ runner attestation signs result hash
→ two independent humans sign review entries
→ external bundle validator passes
→ G2 evaluator passes
→ evidence handed to the canonical authority (Castuo-system) for a
  staging-rls and promotion decision
```

The first unmet predicate stops the sequence. `oneA` remains false and `promotion` remains `BLOCKED` throughout this protocol. A passing G2 evaluation is evidence within the declared scope, not a promotion decision.

## Authority and Promotion Boundary

E3-001 is a bounded public protocol for controlled independent reproduction.

A successful reproduction may provide evidence within the declared scope. It does not independently validate, certify or promote the private core.

Castuo-system remains the private canonical authority for current technical state and promotion decisions.

castuo-evolution may contain historical or prepared governance material, but it is not a promotion authority, synchronized source of truth or validation gate for E3-001.

The public protocol is intended to contain enough information to reproduce the declared bounded claim without exposing non-public implementation, credentials, sensitive IP or private operational material. Controlled-review material may be provided under defined review conditions where appropriate.

## Repository contents

| Path | Purpose |
|---|---|
| `PROTOCOL.md` | Operational procedure and acceptance criteria |
| `schemas/e3-manifest.schema.json` | Portable manifest contract |
| `templates/` | Redacted public templates with no keys or secrets |
| `scripts/validate_external_evidence_bundle.py` | Hash, provenance, attestation and quorum validator |
| `scripts/evaluate_g2.py` | Read-only G2 evaluator |
| `STATUS.md` | Current public state and non-claims |

## Quick verification

```bash
python3 scripts/validate_external_evidence_bundle.py <bundle> \
  --min-reviewers 2 \
  --output external-evidence-validation.json

python3 scripts/evaluate_g2.py \
  external-evidence-validation.json \
  --output g2-decision.json
```

## Try the validator (synthetic demo)

Requires Python 3.11+.

```bash
python -m pip install -r requirements.txt

# Build a valid synthetic bundle and validate it (exit code 0)
python examples/make_demo_bundle.py demo/ok
python scripts/validate_external_evidence_bundle.py demo/ok --output demo/ok-validation.json

# Build a tampered bundle and watch it fail (exit code 1, findings listed)
python examples/make_demo_bundle.py demo/bad --tamper result
python scripts/validate_external_evidence_bundle.py demo/bad --output demo/bad-validation.json
```

Available `--tamper` modes: `result`, `fixture`, `attestation-signature`, `reviewer-signature`, `reviewer-quorum`, `reviewer-duplicate`, `local-runner`, `production-claim`, `missing-envelope`.

> **The demo bundle is not evidence.** Its keys are generated in memory and discarded, its runner and reviewers are fictional `DEMO-*` identities, and it contains no S-001A replay. The validator will report `VERIFIED_FOR_G2` for it because it checks hashes, signatures and declared predicates — not who signed. A passing demo shows that the validator works; it says nothing about CASTÚO-SYSTEM.

Run the test suite with `python -m pytest tests` (or `python -m unittest discover tests`).

The validator requires the bundle to contain a frozen manifest, fixture, replay result, evidence envelope, runner attestation and signed reviewer quorum. Private keys never belong in this repository.

## Current state

```yaml
external_replay: EXTERNAL_VERIFICATION_PENDING
independent_review: HUMAN_SIGNATURE_PENDING
G2: REVIEW_REQUIRED
staging_handoff: BLOCKED
oneR: false
oneV: false
oneA: false
promotion: BLOCKED
```

## Related CASTÚO surfaces

- `Castuo-system` *(private)*: canonical technical authority
- [Public profile and claim boundary](https://github.com/Traky12/Traky12)
- `castuo-evolution` *(private)*: evolution and governance workspace; not an authority
- `castuo-live-status-dashboard` *(private)*: status dashboard; not public evidence

## License

The protocol text and templates are published for independent verification and review. See `LICENSE` for the repository license.

## CASTÚO evidence-scoped integration

Historical integration records, such as the [ecosystem integration record of 2026-08-22](docs/CASTUO_ECOSYSTEM_INTEGRATION_2026-08-22.md), may provide traceability for their declared snapshot date. They do not define the current public authority model, current technical state, promotion state or evidence boundary.

Current authority and evidence boundaries are defined by the current README and the repositories explicitly identified as canonical public surfaces.

## CASTÚO Deep Audit — 2026-08-22

This repository received the second evidence-scoped ecosystem audit. The local audit record is [CASTUO_DEEP_AUDIT_2026-08-22.md](docs/CASTUO_DEEP_AUDIT_2026-08-22.md). This link records traceability only; it does not claim production readiness, certification, field validation or independent review.
