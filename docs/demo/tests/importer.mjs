// Unit tests for docs/demo/importer.js: path rules, limits and decoding of local imports.
// Usage: node docs/demo/tests/importer.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const I = createRequire(import.meta.url)('../importer.js');
const { LIMITS } = I;
let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}: ${e.message}`); }
}
const f = (rel, size = 10) => ({ fullPath: 'pkg/' + rel, size });

check('accepts a normal bundle', () => {
  const p = I.planImport([f('manifest.json'), f('signatures.json'), f('data/readings.csv'), f('report.md')]);
  assert.equal(p.ok, true); assert.equal(p.root, 'pkg'); assert.equal(p.accepted.length, 4);
});
for (const [rel, why] of [
  ['a/../b', '..'], ['a/./b', '.'], ['a\\b', '\\'], ['c:x', ':'], ['a//b', 'segmento vacío'], ['bad\u0001name', 'control'],
  ['x'.repeat(LIMITS.maxPathLength + 1), 'caracteres'], [Array(LIMITS.maxDepth + 1).fill('d').join('/'), 'niveles'],
]) {
  check(`rejects ${JSON.stringify(rel.slice(0, 30))} and verifies nothing`, () => {
    const p = I.planImport([f('manifest.json'), f(rel)]);
    assert.equal(p.ok, false);
    assert.equal(p.rejected.length, 1);
    assert.match(p.rejected[0].reason, new RegExp(why.replace(/[.\\]/g, (c) => '\\' + c)));
  });
}
check('rejects names that differ only in case', () => {
  const p = I.planImport([f('manifest.json'), f('Data.csv'), f('data.csv')]);
  assert.equal(p.ok, false); assert.match(p.rejected[0].reason, /ambigua/);
});
check('rejects a file over the per-file limit', () => {
  const p = I.planImport([f('manifest.json'), f('big.bin', LIMITS.maxFileBytes + 1)]);
  assert.equal(p.ok, false); assert.match(p.rejected[0].reason, /MiB/);
});
check('rejects when the total is over the limit even if each file fits', () => {
  const n = Math.ceil(LIMITS.maxTotalBytes / LIMITS.maxFileBytes) + 1;
  const entries = [f('manifest.json')].concat(Array.from({ length: n }, (_, i) => f(`part${i}.bin`, LIMITS.maxFileBytes)));
  const p = I.planImport(entries);
  assert.equal(p.ok, false); assert.equal(p.rejected.length, 0); assert.match(p.problem, /ocupa/);
});
check('rejects more than the maximum number of files before looking at them', () => {
  const p = I.planImport(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => f(`f${i}`)));
  assert.equal(p.ok, false); assert.match(p.problem, /ficheros/);
});
check('rejects files from more than one folder', () => {
  const p = I.planImport([{ fullPath: 'a/manifest.json', size: 1 }, { fullPath: 'b/x', size: 1 }]);
  assert.equal(p.ok, false); assert.match(p.problem, /única carpeta/);
});
check('rejects an empty selection', () => { assert.equal(I.planImport([]).ok, false); });
check('decodes UTF-8 and keeps a BOM so JSON.parse rejects it like json.loads', () => {
  const enc = new TextEncoder();
  assert.equal(I.decodeText(enc.encode('{"a":"ñ"}'), 'm').text, '{"a":"ñ"}');
  const withBom = I.decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('{}')]), 'm').text;
  assert.throws(() => JSON.parse(withBom));
  assert.match(I.decodeText(new Uint8Array([0xff, 0xfe]), 'manifest.json').finding, /cannot read manifest.json/);
});

console.log(failures ? `\n${failures} importer failure(s)` : '\nall importer checks pass');
process.exit(failures ? 1 : 0);
