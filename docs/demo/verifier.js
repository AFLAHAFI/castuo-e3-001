/*
 * e3.bundle.v1 verifier for the browser demo.
 * Mirrors scripts/e3bundle.py as released in v0.1.1. Equivalence with that CLI is
 * checked on every change by docs/demo/tests/conformance.mjs in CI.
 * Uses only WebCrypto (SHA-256, Ed25519). No network, no storage.
 */
(function (root) {
  'use strict';
  const enc = new TextEncoder();
  const FORMAT = 'e3.bundle.v1';
  const SIGNATURE_FORMAT = 'e3.signature.v1';
  const RESERVED = new Set(['manifest.json', 'signatures.json']);

  const toBytes = (x) => (typeof x === 'string' ? enc.encode(x) : x);

  // Python json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=True)
  function pyStr(s) {
    let out = '"';
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === '"') out += '\\"';
      else if (ch === '\\') out += '\\\\';
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (ch === '\b') out += '\\b';
      else if (ch === '\f') out += '\\f';
      else if (c < 0x20 || (c > 0x7e && c <= 0xffff)) out += '\\u' + c.toString(16).padStart(4, '0');
      else if (c > 0xffff) {
        const v = c - 0x10000;
        out += '\\u' + (0xd800 + (v >> 10)).toString(16) + '\\u' + (0xdc00 + (v & 0x3ff)).toString(16);
      } else out += ch;
    }
    return out + '"';
  }

  function canonical(v) {
    if (v === null) return 'null';
    if (v === true) return 'true';
    if (v === false) return 'false';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return pyStr(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => pyStr(k) + ':' + canonical(v[k])).join(',') + '}';
  }

  async function sha256(data) {
    const d = await crypto.subtle.digest('SHA-256', toBytes(data));
    return 'sha256:' + Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  }

  async function ed25519Supported() {
    if (!(root.crypto && root.crypto.subtle)) return false;
    try {
      await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
      return true;
    } catch (e) {
      return false;
    }
  }

  async function verifySignature(record) {
    try {
      const payload = Object.assign({}, record);
      delete payload.signature_b64;
      const key = await crypto.subtle.importKey('raw', b64ToBytes(record.public_key_b64), { name: 'Ed25519' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'Ed25519' }, key, b64ToBytes(record.signature_b64), enc.encode(canonical(payload)));
    } catch (e) {
      return false;
    }
  }

  function isSafePath(p) {
    if (typeof p !== 'string' || !p || p.includes('\\') || p.includes(':') || p.startsWith('/')) return false;
    return !p.split('/').some((part) => part === '..' || part === '.');
  }

  /**
   * files: { path: string | Uint8Array } — the bundle's data files (not manifest/signatures).
   * trusted: { signer_id: public_key_b64 } or null.
   * Returns { report, exitCode, phases }. report has the same fields and findings as the CLI JSON.
   */
  async function verifyBundle({ files, manifest, signatures, trusted, minSignatures }) {
    const findings = [];
    const phases = { integrity: [], signatures: [] };
    if (manifest.format !== FORMAT) findings.push(`unsupported format: '${manifest.format}' (expected ${FORMAT})`);
    const entries = Array.isArray(manifest.files) ? manifest.files : [];
    const declared = new Set();
    let verified = 0;
    for (const entry of entries) {
      const path = entry && entry.path;
      if (!isSafePath(path) || RESERVED.has(path)) { findings.push(`unsafe path: ${path}`); continue; }
      if (declared.has(path)) { findings.push(`duplicate path: ${path}`); continue; }
      declared.add(path);
      if (!(path in files)) {
        findings.push(`missing file: ${path}`);
        phases.integrity.push({ path, declared: entry.sha256, actual: null, state: 'missing' });
        continue;
      }
      const actual = await sha256(files[path]);
      if (actual === entry.sha256) verified++;
      else findings.push(`hash mismatch: ${path}`);
      phases.integrity.push({ path, declared: entry.sha256, actual, state: actual === entry.sha256 ? 'ok' : 'changed' });
    }
    for (const path of Object.keys(files).sort()) {
      if (!declared.has(path)) {
        findings.push(`undeclared file: ${path}`);
        phases.integrity.push({ path, declared: null, actual: await sha256(files[path]), state: 'extra' });
      }
    }
    const canonicalManifest = canonical(manifest);
    const manifestHash = await sha256(canonicalManifest);
    const valid = new Set();
    const trustedSigners = new Set();
    for (let i = 0; i < signatures.length; i++) {
      const r = signatures[i];
      const prefix = `signatures[${i}]`;
      const row = { signer: r.signer_id, role: r.role, signatureOk: false, hashOk: false, counted: false, trusted: null };
      if (!r.signer_id) { findings.push(`${prefix}: signer_id is required`); phases.signatures.push(row); continue; }
      if (r.format !== SIGNATURE_FORMAT) { findings.push(`${prefix}: unsupported signature format`); phases.signatures.push(row); continue; }
      row.signatureOk = await verifySignature(r);
      row.hashOk = r.manifest_hash === manifestHash;
      if (!row.signatureOk) { findings.push(`${prefix}: invalid Ed25519 signature`); phases.signatures.push(row); continue; }
      if (!row.hashOk) { findings.push(`${prefix}: signed manifest_hash does not match the manifest`); phases.signatures.push(row); continue; }
      if (valid.has(r.signer_id)) { findings.push(`duplicate signer: ${r.signer_id}`); phases.signatures.push(row); continue; }
      valid.add(r.signer_id);
      row.counted = true;
      if (trusted) {
        row.trusted = trusted[r.signer_id] === r.public_key_b64;
        if (row.trusted) trustedSigners.add(r.signer_id);
        else findings.push(`${prefix}: key for ${r.signer_id} is not in the trusted key set`);
      }
      phases.signatures.push(row);
    }
    const counted = trusted ? trustedSigners.size : valid.size;
    if (counted < minSignatures) findings.push(`signature threshold not met: ${counted} < ${minSignatures}`);
    const status = findings.length ? 'FAILED' : 'VERIFIED';
    return {
      exitCode: status === 'VERIFIED' ? 0 : 1,
      canonicalManifest,
      phases,
      report: {
        bundle_id: manifest.bundle_id === undefined ? null : manifest.bundle_id,
        files_declared: entries.length,
        files_verified: verified,
        findings,
        format: FORMAT,
        manifest_hash: manifestHash,
        min_signatures: minSignatures,
        signatures_present: signatures.length,
        signatures_trusted: trusted ? trustedSigners.size : null,
        signatures_valid: valid.size,
        status,
        trust_mode: trusted ? 'pinned' : 'none',
      },
    };
  }

  /** Same manifest shape and ordering as `e3bundle manifest`. */
  async function createManifest(files, bundleId) {
    const out = [];
    for (const path of Object.keys(files).sort()) out.push({ path, sha256: await sha256(files[path]) });
    return { format: FORMAT, bundle_id: bundleId, files: out };
  }

  /** Same signature record as `e3bundle sign`. The private key never leaves the CryptoKey object. */
  async function signManifest(manifest, keyPair, signerId, role, publicKeyB64) {
    const payload = {
      format: SIGNATURE_FORMAT,
      manifest_hash: await sha256(canonical(manifest)),
      signer_id: signerId,
      role,
      signed_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      public_key_b64: publicKeyB64,
    };
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, keyPair.privateKey, enc.encode(canonical(payload))));
    return Object.assign({}, payload, { signature_b64: bytesToB64(sig) });
  }

  async function generateKey() {
    const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    const publicKeyB64 = bytesToB64(new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)));
    return { keyPair, publicKeyB64 };
  }

  const api = { canonical, sha256, verifyBundle, createManifest, signManifest, generateKey, ed25519Supported, isSafePath };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
