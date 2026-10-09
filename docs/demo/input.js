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
  /** The CLI reads --trusted-keys before anything else. Returns { error } or { trusted }. */
  function parseTrusted(trustedText, trustedName) {
    if (trustedText === null || trustedText === undefined) return { trusted: null };
    const t = readJson(trustedText, trustedName || 'trusted-keys.json');
    if (!t.ok) return inputError(t.finding);
    const v = t.value;
    if (v === null || typeof v !== 'object' || Array.isArray(v) || !Object.values(v).every((x) => typeof x === 'string')) {
      return inputError('trusted keys must be a JSON object {signer_id: public_key_b64}');
    }
    return { trusted: v };
  }

  function parseVerifyInput({ manifestText, signaturesText, trustedText, trustedName }) {
    const pt = parseTrusted(trustedText, trustedName);
    if (pt.error) return pt;
    const trusted = pt.trusted;
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

  // The CLI adds this text to every JSON report; browser reports carry it too.
  const LIMITATIONS = 'Checks integrity of declared files and validity of signatures over the manifest only. ' +
    'Does not prove the content is true, signer identity without pinned keys, signer independence, ' +
    'certification, compliance or production authorization.';

  /** The report as `e3bundle verify --output` writes it: limitations added, sorted keys, two-space indent. */
  function reportJson(report) {
    const full = Object.assign({}, report, { limitations: LIMITATIONS });
    return JSON.stringify(full, Object.keys(full).sort(), 2);
  }

  /** Saves text as a file through a local blob: URL; nothing is uploaded. */
  function saveText(doc, text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = doc.createElement('a');
    a.href = url; a.download = filename;
    doc.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const api = { parseVerifyInput, parseTrusted, withInputFindings, LIMITATIONS, reportJson, saveText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E3Input = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
