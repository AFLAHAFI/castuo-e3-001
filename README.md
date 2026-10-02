# E3-001 External Verification Protocol

E3-001 is the public, evidence-scoped protocol for independently replaying and reviewing the CASTÚO S-001A vertical slice. This repository is a protocol and verification surface. It is not a production certification, commercial proof, maturity claim or authorization service.

> **A local candidate never counts as independent verification.**

The protocol freezes the fixture, source commit, commands, expected decisions, hashes, runner attestation, human review and G2 handoff as separate, inspectable artifacts.

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
