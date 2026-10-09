# Example bundles

Synthetic, ready-to-verify examples for `e3bundle` (format `e3.bundle.v1`).

| Path | What it shows |
|---|---|
| `valid/` | Two files, a manifest and two Ed25519 signatures (`example-runner`, `example-reviewer`). Verifies. |
| `tampered/` | Identical, except one temperature in `data/readings.csv` was changed after signing. Fails. |
| `trusted-keys.json` | The two pinned public keys used to sign both bundles. |

```bash
e3bundle verify examples/bundles/valid    --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json
e3bundle verify examples/bundles/tampered --min-signatures 2 --trusted-keys examples/bundles/trusted-keys.json
```

The signing keys were discarded after generation. `python examples/make_example_bundles.py` regenerates all three with new keys.
