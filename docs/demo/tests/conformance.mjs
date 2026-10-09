// Conformance: the browser verifier (docs/demo/verifier.js) must give the same result as
// the released CLI for every demo scenario, and bundles it creates must verify with the CLI.
//
// Usage: node docs/demo/tests/conformance.mjs <bundles-dir> <python> <e3bundle.py>
//   <bundles-dir>  examples/bundles as released (valid/, tampered/, trusted-keys.json)
//   <e3bundle.py>  the CLI source of the same release (e.g. extracted from tag v0.1.1)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const E3 = require('../verifier.js');
const [bundles, python, cli] = process.argv.slice(2);
if (!bundles || !python || !cli) {
  console.error('usage: conformance.mjs <bundles-dir> <python> <e3bundle.py>');
  process.exit(2);
}

const validDir = path.join(bundles, 'valid');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));
const manifest = readJson(path.join(validDir, 'manifest.json'));
const signatures = readJson(path.join(validDir, 'signatures.json'));
const trusted = readJson(path.join(bundles, 'trusted-keys.json'));
const baseFiles = {};
for (const e of manifest.files) baseFiles[e.path] = new Uint8Array(fs.readFileSync(path.join(validDir, e.path)));
const tamperedCsv = new Uint8Array(fs.readFileSync(path.join(bundles, 'tampered', 'data', 'readings.csv')));

const clone = (x) => JSON.parse(JSON.stringify(x));
// The same eight scenarios the demo offers.
const scenarios = {
  original: {},
  tampered: { files: { ...baseFiles, 'data/readings.csv': tamperedCsv } },
  extra: { files: { ...baseFiles, 'notes.txt': new TextEncoder().encode('added after signing\n') } },
  missing: { files: Object.fromEntries(Object.entries(baseFiles).filter(([p]) => p !== 'report.md')) },
  forged: { signatures: (() => { const s = clone(signatures); s[1].role = 'auditor'; return s; })() },
  manifest: { manifest: { ...clone(manifest), bundle_id: 'example-002' } },
  nopin: { trusted: null },
  untrusted: { trusted: { 'example-runner': trusted['example-runner'] } },
};

function writeBundle(dir, files, m, s) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [p, bytes] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), bytes);
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'signatures.json'), JSON.stringify(s, null, 2) + '\n');
}

function runCli(dir, t, min) {
  const args = [cli, 'verify', dir, '--min-signatures', String(min)];
  if (t) {
    const tk = path.join(dir, '..', path.basename(dir) + '-trusted.json');
    fs.writeFileSync(tk, JSON.stringify(t));
    args.push('--trusted-keys', tk);
  }
  let out; let code = 0;
  try { out = execFileSync(python, args, { encoding: 'utf-8' }); } catch (e) { out = e.stdout; code = e.status; }
  return { report: JSON.parse(out), code };
}

const FIELDS = ['status', 'findings', 'files_declared', 'files_verified', 'signatures_present', 'signatures_valid', 'signatures_trusted', 'trust_mode', 'manifest_hash'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e3demo-'));
let failures = 0;

for (const [name, over] of Object.entries(scenarios)) {
  const input = {
    files: over.files || baseFiles,
    manifest: over.manifest || manifest,
    signatures: over.signatures || signatures,
    trusted: 'trusted' in over ? over.trusted : trusted,
    minSignatures: 2,
  };
  const js = await E3.verifyBundle(input);
  const dir = path.join(tmp, name);
  writeBundle(dir, input.files, input.manifest, input.signatures);
  const py = runCli(dir, input.trusted, 2);
  const diffs = FIELDS.filter((f) => JSON.stringify(js.report[f]) !== JSON.stringify(py.report[f]));
  if (js.exitCode !== py.code) diffs.push(`exit ${js.exitCode} != ${py.code}`);
  console.log(`${diffs.length ? 'FAIL' : 'ok  '} ${name.padEnd(10)} ${js.report.status} exit ${js.exitCode} ${JSON.stringify(js.report.findings)}${diffs.length ? '  differs: ' + diffs.join(', ') : ''}`);
  if (diffs.length) failures++;
}

// Interop: a bundle created and signed by the browser code must verify with the CLI.
const own = { 'datos.csv': new TextEncoder().encode('lote,humedad\nA-01,64\n'), 'informe.md': new TextEncoder().encode('# Informe\n\nPrueba con ñ, ü y €.\n') };
const { keyPair, publicKeyB64 } = await E3.generateKey();
const ownManifest = await E3.createManifest(own, 'navegador-001');
const ownSig = await E3.signManifest(ownManifest, keyPair, 'yo', 'reviewer', publicKeyB64);
const ownDir = path.join(tmp, 'browser-made');
writeBundle(ownDir, own, ownManifest, [ownSig]);
const made = runCli(ownDir, { yo: publicKeyB64 }, 1);
console.log(`${made.report.status === 'VERIFIED' && made.code === 0 ? 'ok  ' : 'FAIL'} browser-made bundle verified by CLI: ${made.report.status} exit ${made.code}`);
if (made.report.status !== 'VERIFIED' || made.code !== 0) failures++;
fs.writeFileSync(path.join(ownDir, 'datos.csv'), 'lote,humedad\nA-01,99\n');
const broken = runCli(ownDir, { yo: publicKeyB64 }, 1);
const brokenOk = broken.code === 1 && broken.report.findings.includes('hash mismatch: datos.csv');
console.log(`${brokenOk ? 'ok  ' : 'FAIL'} edited after signing rejected by CLI: ${broken.report.status} exit ${broken.code}`);
if (!brokenOk) failures++;

console.log(failures ? `\n${failures} conformance failure(s)` : '\nall scenarios match the CLI');
process.exit(failures ? 1 : 0);
