# E3-001 operational protocol

## Scope

E3-001 verifies only the declared S-001A behavior: fault handling, evidence capture, recovery and deterministic replay within a frozen fixture and source commit. It does not prove production readiness, field operation, certification, commercial traction, customer adoption or vendor exit.

## 1. Freeze

The package owner records:

```yaml
scenario_id: S-001A
protocol_id: E3-001-S001A-FOREIGN-REPLAY
source_commit: <40-lowercase-hex>
fixture_path: fixture.json
rollback_ref: <immutable-tag-or-commit>
external_runner: true
foreign_replay: true
production_claim: false
commercial_claim: false
```

The manifest binds the SHA-256 of the fixture, replay result and evidence envelope. Any mutation after freeze invalidates the package.

## 2. Independent runner

The operator must not be the implementation author or the package author. The runner uses a clean checkout and an identity that is not a local fallback or GitHub candidate runner. The harness must be offline-only.

```bash
python3 scripts/run_s001a_foreign_replay.py \
  --fixture fixture.json \
  --output foreign-replay-result.json \
  --runner-id FOREIGN-RUNNER-<operator-id> \
  --source-commit <source-commit> \
  --stress-repetitions 3
```

The replay must show PASS_WITHIN_DECLARED_SCOPE, deterministic equivalent decisions and equivalent evidence semantics, recovery completion, negative behavior and an unchanged claim firewall.

## 3. Runner attestation

The runner creates `runner-attestation.json` and signs its canonical payload using Ed25519. The private key remains on the external runner or approved signing device and is never committed.

Required signed fields are `attestation_id`, `runner_id`, `independent`, `source_commit`, `result_hash`, `public_key_b64` and `signature_b64`.

## 4. Human review

At least two independent reviewers create `reviewers.json`. Each reviewer binds the same source commit, evidence hash and replay result hash, declares `independence: true`, decides `APPROVE` and signs their canonical entry with Ed25519.

A reviewer must inspect the fixture, commands, output, negative cases, recovery path, hashes, runtime and limitations. A signature without substantive inspection is not sufficient evidence.

## 5. Validation

```bash
python3 scripts/validate_external_evidence_bundle.py bundle \
  --min-reviewers 2 \
  --output external-evidence-validation.json
```

The command must return zero and report `VERIFIED_FOR_G2`. A successful report means the bundle is eligible for G2; it does not mutate repository state.

## 6. G2

```bash
python3 scripts/evaluate_g2.py \
  external-evidence-validation.json \
  --output g2-decision.json
```

G2 passes only when the external replay, signed human review, hashes, claim firewall and assurance predicates are all verified. The G2 output must retain `oneA: false` and `promotion: BLOCKED`.

## 7. Staging handoff

After G2 passes, an authorized operator may request the protected `staging-rls` workflow in `Castuo-system`. That environment must enforce reviewers, protected branches and secrets outside the repository. The RLS-001 integration job must run against an isolated real staging endpoint and publish JUnit and console artifacts.

A staging run is operational validation within its declared endpoint scope. It is not production authorization. Any missing environment, reviewer, endpoint, secret, artifact or rollback reference blocks the handoff.

## Acceptance table

| Predicate | Acceptance condition |
|---|---|
| Frozen source | Exact commit and rollback reference are recorded |
| Fixture integrity | SHA-256 matches the committed fixture |
| Replay | PASS_WITHIN_DECLARED_SCOPE with equivalent decisions and semantics |
| Independence | Runner identity and two human reviewers are external to the authoring path |
| Attestation | Ed25519 signature verifies over canonical payload |
| Review | Two distinct signed APPROVE entries with matching hashes |
| Claims | Production and commercial claims are false |
| G2 | Read-only evaluator returns PASS |
| Staging | Protected environment and real RLS-001 execution are available |
| Promotion | Remains BLOCKED until a separate AuthorityObject and decision |
