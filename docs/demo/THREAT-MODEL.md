# Browser demo: threat model

Scope: the static demo in `docs/demo/` served by GitHub Pages
(<https://traky12.github.io/castuo-e3-001/>). It verifies the `v0.1.1` example
bundles and creates bundles in the browser. It has no backend. Vulnerabilities
in the demo or the tool: report privately as described in [SECURITY.md](../../SECURITY.md).

## Assets

| Asset | Where it lives |
|---|---|
| Ed25519 private key made on the create page | A `CryptoKey` created with `extractable: false` (`verifier.js`), held in page memory only |
| Text the visitor types (CSV, files, signer id) | Page memory only |
| Verification reports | Page memory; copied only when the visitor presses a copy button |
| Correctness of the verdict | `verifier.js` + `input.js`, kept equivalent to the `v0.1.1` CLI |

## Threats and mitigations

| Threat | Mitigation | How it is tested |
|---|---|---|
| Visitor data or keys sent elsewhere | No backend, no analytics, no third-party resources; CSP `connect-src 'self'`; keys never serialised (only the public key is shown) | UI suite: every request is a same-origin GET without a body, and none happens while scenarios run, files are edited, keys are made or bundles are signed and verified |
| Script injection through displayed data | Results are written with `textContent`; no `innerHTML`, `eval` or inline script; CSP `script-src 'self'`, `style-src 'self'`, `default-src 'none'` | UI suite: an injected inline script does not run and an injected inline style does not apply; the real controls raise no CSP violation |
| Unreadable input shown as a verdict | `input.js` applies the CLI's input contract: unreadable or wrongly shaped manifest / trusted keys → `ERROR`, exit 2, no cryptographic phase shown | `tests/input-conformance.mjs` (9 malformed inputs vs the CLI from the tag) and UI cases with corrupted served files |
| Browser verdict drifting from the CLI | `verifier.js` unchanged; deploy is blocked unless conformance and UI jobs pass | `tests/conformance.mjs` (8 scenarios + interop), `pages.yml` |
| Reading VERIFIED as certification or identity | Limits stated next to the result; "trust not checked" without pinned keys | Content review; claims grep in `pages.yml` |

## Residual risks and limits

- **Headers.** GitHub Pages does not let this repository set HTTP headers. The
  CSP is a `<meta>` tag; `frame-ancestors`, HSTS settings and other header-only
  protections are not claimed.
- **Memory.** "Reiniciar sesión" drops the page's references to keys, inputs and
  reports. The browser frees memory when it decides; physical erasure is not
  guaranteed. Closing the tab also discards them.
- **The visitor's environment.** Browser extensions, a compromised device or a
  modified copy of the page are out of the page's control.
- **Engines.** CI runs Chromium, Firefox and WebKit as shipped by Playwright on
  Linux. WebKit there is not Safari; Safari, Edge and mobile browsers need manual
  checks, recorded by whoever runs them.
- **Known differences from the CLI.** Two remain, both on unusual manifests:
  numbers written with a fraction or exponent (`1.0`, `1e5`) are re-serialised
  differently by JavaScript and Python, so the manifest hash differs; and paths
  with `.` segments (`a/./b`) are rejected as unsafe by the browser but
  normalised by the CLI. The browser is stricter in the second case. Every other
  malformed-content case in `tests/input-conformance.mjs` (23 cases) matches.
- **Synthetic data.** Results on this page prove the verification logic only.
  They are not an attestation, do not validate CASTÚO-SYSTEM and do not count as
  E3-001 independent review.
