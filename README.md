# E3-001 External Verification Protocol

E3-001 is the public, evidence-scoped protocol for independently replaying and reviewing the CASTÚO S-001A vertical slice. This repository is a protocol and verification surface. It is not a production certification, commercial proof, maturity claim or authorization service.

> **A local candidate never counts as independent verification.**

The protocol freezes the fixture, source commit, commands, expected decisions, hashes, runner attestation, human review and G2 handoff as separate, inspectable artifacts.

## Chain of custody

```text
castuo-evidence
  → frozen fixture and replay artifacts
castuo-evolution
  → validator, signed review quorum and G2 gate
Castuo-system
  → bounded implementation and protected staging-rls
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
→ protected staging-rls handoff
```

The first unmet predicate stops the sequence. `oneA` remains false and `promotion` remains `BLOCKED` throughout this protocol.

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

- [Governance control plane](https://github.com/Traky12/castuo-evolution)
- [Core system](https://github.com/Traky12/Castuo-system)
- [Public evidence profile](https://github.com/Traky12/Traky12)
- [Public status dashboard](https://github.com/Traky12/castuo-live-status-dashboard)

## License

The protocol text and templates are published for independent verification and review. See `LICENSE` for the repository license.

## CASTÚO evidence-scoped integration

See the [ecosystem integration record](docs/CASTUO_ECOSYSTEM_INTEGRATION_2026-08-22.md) for the current capability, evidence, security and promotion boundary.
