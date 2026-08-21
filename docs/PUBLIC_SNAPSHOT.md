# Public verified snapshot

The public snapshot is an optional, read-only projection of `validate_external_evidence_bundle.py` and `evaluate_g2.py`. It is not an authority object and it never authorizes production. The generated contract retains `oneA: false` and `promotion: BLOCKED` even when G2 passes.

## Execution boundary

The workflow `.github/workflows/public-snapshot.yml` runs on a protected GitHub environment named `public-snapshot`. The evidence bundle must be supplied by an external operator. The runner validates the bundle, evaluates G2, and only then calls `scripts/publish_public_snapshot.py`.

The private Ed25519 key is read from the protected `CASTUO_SNAPSHOT_SIGNING_KEY_B64` secret. It is not committed, printed, sent to the dashboard, or embedded in the generated JSON. The snapshot contains only the public key, key identifier, payload digest and signature.

## Required operator configuration

An administrator must create the protected environment and add the signing secret outside the repository. Reviewers should require the workflow run to be approved before it can write `public/status-snapshot.json` to `main`.

```bash
gh secret set CASTUO_SNAPSHOT_SIGNING_KEY_B64 \
  --repo Traky12/castuo-e3-001 \
  --env public-snapshot \
  --body <base64-ed25519-private-key>
```

The key must be generated and stored by the approved external operator or signing device. Do not paste it into a browser form or commit it to the repository.

## Dashboard contract

The dashboard reads:

```text
https://raw.githubusercontent.com/Traky12/castuo-e3-001/main/public/status-snapshot.json
```

It rejects the artifact unless the JSON schema is valid, the canonical unsigned payload digest matches `signed_payload_sha256`, and the Ed25519 signature verifies with the embedded public key. A missing artifact, invalid signature or unsupported browser crypto implementation falls back to the local declared snapshot and keeps promotion blocked.

## Non-claims

A signed public snapshot proves that the configured runner signed the declared projection. It does not, by itself, prove that the runner was independent, that the evidence was substantively inspected, that staging is production, or that an AuthorityObject exists. The E3 validator and G2 evaluator remain the source of the evidence decision; the dashboard is a read-only surface.

## Current operator handoff

As of the latest verification, the `public-snapshot` environment exists with protected-branch policy and a required reviewer rule for `Traky12` with self-review prevention. The environment has no configured `CASTUO_SNAPSHOT_SIGNING_KEY_B64` secret, and `public/status-snapshot.json` is intentionally absent. The public snapshot workflow therefore cannot be run successfully yet. This is the expected fail-closed state, not a workflow failure.

To close the external gate, an authorized operator must add the secret through GitHub environment secrets, supply a real externally generated E3-001 bundle, and dispatch `E3-001 public verified snapshot` with the exact frozen source commit. The workflow then validates the bundle, evaluates G2, runs the public claim firewall, and writes the signed snapshot only if all checks pass. A successful run still keeps `oneA=false` and `promotion=BLOCKED`.
