// Input conformance: malformed inputs (unreadable JSON, and well-formed JSON with malformed
// content) must get the same status, exit code and findings in the browser
// (input.js + verifier.js) as in the released CLI.
// Kept separate from conformance.mjs, whose eight scenarios are unchanged.
//
// Usage: node docs/demo/tests/input-conformance.mjs <bundles-dir> <python> <e3bundle.py>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const E3 = require('../verifier.js');
const E3Input = require('../input.js');
const [bundles, python, cli] = process.argv.slice(2);
if (!bundles || !python || !cli) {
  console.error('usage: input-conformance.mjs <bundles-dir> <python> <e3bundle.py>');
  process.exit(2);
}

const validDir = path.join(bundles, 'valid');
const manifestText = fs.readFileSync(path.join(validDir, 'manifest.json'), 'utf-8');
const signaturesText = fs.readFileSync(path.join(validDir, 'signatures.json'), 'utf-8');
const trustedText = fs.readFileSync(path.join(bundles, 'trusted-keys.json'), 'utf-8');
const files = {};
for (const e of JSON.parse(manifestText).files) files[e.path] = new Uint8Array(fs.readFileSync(path.join(validDir, e.path)));

const cases = {
  'manifest not JSON': { manifest: '{"format": "e3.bundle.v1",' },
  'manifest is an array': { manifest: '[]' },
  'manifest is null': { manifest: 'null' },
  'trusted keys not JSON': { trusted: '{oops' },
  'trusted keys is an array': { trusted: '["a"]' },
  'trusted key not a string': { trusted: '{"example-runner": 1}' },
  'signatures not JSON': { signatures: '[{' },
  'signatures is an object': { signatures: '{}' },
  'no signatures.json': { signatures: null },
};

// Well-formed JSON with malformed content (issue #55): the verifier itself must report
// exactly what the CLI reports.
const M = JSON.parse(manifestText);
const S = JSON.parse(signaturesText);
const withManifest = (patch) => JSON.stringify(Object.assign(JSON.parse(manifestText), patch));
const withSig = (fn) => { const s = JSON.parse(signaturesText); fn(s); return JSON.stringify(s); };
Object.assign(cases, {
  'files is an object': { manifest: withManifest({ files: {} }) },
  'sha256 not 64 hex': { manifest: withManifest({ files: [{ ...M.files[0], sha256: 'sha256:XYZ' }, M.files[1]] }) },
  'sha256 uppercase': { manifest: withManifest({ files: [{ ...M.files[0], sha256: M.files[0].sha256.toUpperCase() }, M.files[1]] }) },
  'format missing': { manifest: JSON.stringify((({ format, ...rest }) => rest)(M)) },
  'format other': { manifest: withManifest({ format: "e3.bundle.v2" }) },
  'file entry not an object': { manifest: withManifest({ files: ['data/readings.csv', M.files[1]] }) },
  'file entry without path': { manifest: withManifest({ files: [{ sha256: M.files[0].sha256 }, M.files[1]] }) },
  'path named constructor': { manifest: withManifest({ files: [...M.files, { path: 'constructor', sha256: M.files[0].sha256 }] }) },
  'signature is null': { signatures: withSig((s) => { s[1] = null; }) },
  'signature is an array': { signatures: withSig((s) => { s[1] = []; }) },
  'signer_id is a number': { signatures: withSig((s) => { s[1].signer_id = 5; }) },
  'signature base64 with newline': { signatures: withSig((s) => { s[0].signature_b64 = s[0].signature_b64.slice(0, 20) + '\n' + s[0].signature_b64.slice(20); }) },
  'public key base64 unpadded': { signatures: withSig((s) => { s[0].public_key_b64 = s[0].public_key_b64.replace(/=+$/, ''); }) },
  'duplicate signature': { signatures: JSON.stringify([S[0], S[0], S[1]]) },
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e3input-'));
// Python's and JavaScript's JSON parse errors are worded differently; compare up to the file name.
const norm = (f) => (f.startsWith('cannot read ') ? f.slice(0, f.indexOf(':')) : f);
let failures = 0;

for (const [name, c] of Object.entries(cases)) {
  const m = c.manifest ?? manifestText;
  const s = 'signatures' in c ? c.signatures : signaturesText;
  const t = c.trusted ?? trustedText;
  const dir = path.join(tmp, name.replace(/\W+/g, '-'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  for (const [p, bytes] of Object.entries(files)) fs.writeFileSync(path.join(dir, p), bytes);
  fs.writeFileSync(path.join(dir, 'manifest.json'), m);
  if (s !== null) fs.writeFileSync(path.join(dir, 'signatures.json'), s);
  const keys = path.join(tmp, name.replace(/\W+/g, '-') + '-trusted-keys.json');
  fs.writeFileSync(keys, t);

  let out; let code = 0;
  try { out = execFileSync(python, [cli, 'verify', dir, '--min-signatures', '2', '--trusted-keys', keys], { encoding: 'utf-8' }); }
  catch (e) { out = e.stdout; code = e.status; }
  const py = JSON.parse(out);

  const parsed = E3Input.parseVerifyInput({ manifestText: m, signaturesText: s, trustedText: t, trustedName: path.basename(keys) });
  let js;
  if (parsed.error) js = parsed.error;
  else js = E3Input.withInputFindings(await E3.verifyBundle({ files, ...parsed.input, minSignatures: 2 }), parsed.findings);

  const diffs = [];
  if (js.report.status !== py.status) diffs.push(`status ${js.report.status} != ${py.status}`);
  if (js.exitCode !== code) diffs.push(`exit ${js.exitCode} != ${code}`);
  const a = js.report.findings.map(norm); const b = py.findings.map(norm);
  if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`findings ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  console.log(`${diffs.length ? 'FAIL' : 'ok  '} ${name.padEnd(26)} ${js.report.status} exit ${js.exitCode}${diffs.length ? '  ' + diffs.join('; ') : ''}`);
  if (diffs.length) failures++;
}

console.log(failures ? `\n${failures} input conformance failure(s)` : '\nall malformed inputs match the CLI');
process.exit(failures ? 1 : 0);
