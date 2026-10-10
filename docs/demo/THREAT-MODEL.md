# Browser demo: threat model

Scope: the static demo in `docs/demo/` served by GitHub Pages
(<https://traky12.github.io/castuo-e3-001/>). This draft targets the v0.1.2
candidate CLI source at commit `50b2dde7309f147d39fbb1ac7e7fc9cf00310e4c`. That source commit is not itself
a tag or published release. Production deployment remains gated on a public
v0.1.2 GitHub release, the matching PyPI distribution and the GHCR image.
The demo has no backend. Report vulnerabilities privately as described in
[SECURITY.md](../../SECURITY.md).

## Assets

| Asset | Where it lives |
|---|---|
| Ed25519 private key made on the create page | A `CryptoKey` created with `extractable: false` (`verifier.js`), held in page memory only |
| Text the visitor types (CSV, files, signer id) | Page memory only |
| Files of a local bundle chosen on `paquete.html` | Read with `File.arrayBuffer()` into page memory only |
| Verification reports | Page memory; copied or downloaded only after a visitor action |
| Correctness of the verdict | `verifier.js` + `input.js`, checked against the pinned candidate CLI source in CI |

## Threats and mitigations

| Threat | Mitigation | How it is tested |
|---|---|---|
| Visitor data or keys sent elsewhere | No backend, analytics or third-party resources; CSP `connect-src 'self'`; private keys are never serialised | UI suite checks requests are same-origin GETs without bodies and that no request leaves the page while scenarios run, files are edited, keys are made, or bundles are signed and verified |
| Script injection through displayed data | Results are written with `textContent`; no `innerHTML`, `eval` or inline scripts; restrictive CSP | UI suite tests inline script/style blocking and CSP violations |
| Unreadable input shown as a verdict | `input.js` applies the CLI input contract: malformed or wrongly shaped manifest/trusted keys produce `ERROR`, exit 2, with no cryptographic phase shown | `tests/input-conformance.mjs` compares statuses, exit codes and findings against candidate CLI source, including malformed JSON and unsafe manifest paths |
| Browser verdict drifting from the CLI | Browser/CLI conformance and UI jobs must pass; production deploy additionally requires the public release, PyPI version and GHCR image | `tests/conformance.mjs`, `tests/input-conformance.mjs`, Playwright jobs and the publication gate in `pages.yml` |
| Hostile local folder (traversal, ambiguous names, huge or numerous files) | `importer.js` plans imports from names/sizes before reading bytes: ≤200 files, ≤10 MiB each, ≤50 MiB total, paths ≤255 characters and ≤16 levels; rejects unsafe segments, separators, control characters, empty segments and case-colliding names. If a path is rejected, no bundle is verified. No ZIP; file contents use prototype-free maps | `tests/importer.mjs` and the UI suite |
| Imported keys treated as trusted | Imported public keys start unchecked; only explicitly pinned keys count, and the selected subset can be downloaded for CLI reproduction | UI suite checks unchecked keys and threshold failure when too few trusted keys are selected |
| Local verdict differing from the CLI | Same input order as the CLI (keys first, then manifest, then signatures); strict UTF-8 decode with BOM preserved | UI suite compares local folders with the pinned candidate CLI source by status, exit code and findings |
| Reading VERIFIED as certification or identity | Limitations are stated alongside the result; without pinned keys the UI says trust was not checked | Content review and unsupported-claims check in `pages.yml` |

## Residual risks and limits

- **Headers.** GitHub Pages does not let this repository set HTTP headers. The
  CSP is a meta tag; `frame-ancestors`, HSTS settings and other header-only
  protections are not claimed.
- **Memory.** “Reiniciar sesión” drops page references to keys, inputs and
  reports. The browser frees memory when it decides; physical erasure is not
  guaranteed. Closing the tab also discards them.
- **The visitor's environment.** Browser extensions, a compromised device or a
  modified copy of the page are out of the page's control.
- **Engines.** CI runs Chromium, Firefox and WebKit as shipped by Playwright on
  Linux. WebKit there is not Safari; Safari, Edge and mobile browsers need manual
  checks recorded by whoever runs them.
- **Known difference from the CLI.** Numeric JSON values such as `1.0` or
  exponent notation can be serialised differently by JavaScript and Python,
  changing the canonical manifest hash. Path validation in this candidate is
  intended to match the CLI for empty segments (`a//b`, `a/`), dot/parent
  segments, absolute paths, backslashes, colons and NUL; this claim is subject
  to passing the CI conformance tests before promotion.
- **Local folders.** The browser follows symbolic links and does not report
  them; the CLI rejects symlinks. Whether hidden files are included depends on
  the browser. Keys files over 1 MiB are not read (use the CLI).
- **Synthetic data.** Results on this page prove only the supported verification
  logic. They are not an attestation, do not validate CASTÚO-SYSTEM and do not
  count as an E3-001 independent review.
