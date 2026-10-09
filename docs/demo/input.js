/*
 * Input layer for the browser demo: turns the raw JSON texts of a bundle into the
 * objects verifier.js expects, following the input contract of the v0.1.1 CLI.
 * Unreadable or wrongly shaped manifest / trusted keys stop before any check
 * (status ERROR, exit 2, as `e3bundle verify` does). An unreadable or non-array
 * signatures.json is a finding (FAILED), not an error, as in the CLI.
 * verifier.js is not changed; equivalence is checked by tests/input-conformance.mjs.
 */
(function (root) {
  'use strict';

  function readJson(text, name) {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, finding: `cannot read ${name}: ${e.message}` };
    }
  }

  function inputError(finding) {
    return { error: { report: { status: 'ERROR', findings: [finding] }, exitCode: 2 } };
  }

  /**
   * manifestText, signaturesText: file contents (signaturesText null = no signatures.json).
   * trustedText: contents of the trusted keys file, or null when no keys are pinned.
   * Returns { error } or { input: { manifest, signatures, trusted }, findings }.
   */
  function parseVerifyInput({ manifestText, signaturesText, trustedText, trustedName }) {
    const keysName = trustedName || 'trusted-keys.json';
    let trusted = null;
    if (trustedText !== null && trustedText !== undefined) {
      const t = readJson(trustedText, keysName);
      if (!t.ok) return inputError(t.finding);
      const v = t.value;
      if (v === null || typeof v !== 'object' || Array.isArray(v) || !Object.values(v).every((x) => typeof x === 'string')) {
        return inputError('trusted keys must be a JSON object {signer_id: public_key_b64}');
      }
      trusted = v;
    }
    const m = readJson(manifestText, 'manifest.json');
    if (!m.ok) return inputError(m.finding);
    if (m.value === null || typeof m.value !== 'object' || Array.isArray(m.value)) {
      return inputError('manifest.json must be a JSON object');
    }
    const findings = [];
    let signatures = [];
    if (signaturesText !== null && signaturesText !== undefined) {
      const s = readJson(signaturesText, 'signatures.json');
      if (!s.ok) findings.push(s.finding);
      else if (!Array.isArray(s.value)) findings.push('signatures.json must be an array');
      else signatures = s.value;
    }
    return { input: { manifest: m.value, signatures, trusted }, findings };
  }

  /**
   * Adds input findings (unreadable signatures.json) to a verifyBundle() result in the
   * position the CLI reports them: after file findings, before signature findings.
   */
  function withInputFindings(result, findings) {
    if (!findings.length) return result;
    const all = result.report.findings;
    let at = all.findIndex((f) => f.startsWith('signatures[') || f.startsWith('duplicate signer') || f.startsWith('signature threshold'));
    if (at < 0) at = all.length;
    const merged = all.slice(0, at).concat(findings, all.slice(at));
    return Object.assign({}, result, { exitCode: 1, report: Object.assign({}, result.report, { findings: merged, status: 'FAILED' }) });
  }

  const api = { parseVerifyInput, withInputFindings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E3Input = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
