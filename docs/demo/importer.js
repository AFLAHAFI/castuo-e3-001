/*
 * Local bundle import for the browser demo: decides, before reading any byte, whether a
 * folder chosen by the visitor can be verified safely in this tab. Pure functions only;
 * the page (paquete.js) does the reading. Checked by tests/importer.mjs and the UI suite.
 *
 * Rule: if any entry is rejected, nothing is verified. Dropping a file silently could
 * turn the CLI's FAILED (undeclared file) into a browser VERIFIED.
 */
(function (root) {
  'use strict';

  // Browser demo limits, stricter than the CLI to protect the tab. Over a limit: use the CLI.
  const LIMITS = Object.freeze({
    maxFiles: 200,
    maxFileBytes: 10 * 1024 * 1024,
    maxTotalBytes: 50 * 1024 * 1024,
    maxPathLength: 255,
    maxDepth: 16,
  });

  /** Returns why a relative path is not acceptable, or null. */
  function pathProblem(rel) {
    if (typeof rel !== 'string' || rel.length === 0) return 'ruta vacía';
    if (rel.length > LIMITS.maxPathLength) return `ruta de más de ${LIMITS.maxPathLength} caracteres`;
    if (/[\u0000-\u001f\u007f]/.test(rel)) return 'carácter de control en la ruta';
    if (rel.includes('\\') || rel.includes(':')) return 'la ruta contiene \\ o :';
    if (rel.startsWith('/')) return 'ruta absoluta';
    const parts = rel.split('/');
    if (parts.length > LIMITS.maxDepth) return `más de ${LIMITS.maxDepth} niveles de carpetas`;
    if (parts.some((p) => p === '')) return 'segmento vacío en la ruta';
    if (parts.some((p) => p === '.' || p === '..')) return 'la ruta contiene . o ..';
    return null;
  }

  /**
   * entries: [{ fullPath, size }] where fullPath is the browser's webkitRelativePath
   * ("chosen-folder/sub/file"). Returns { ok, root, accepted: [{path, size, index}],
   * rejected: [{path, reason}], problem } — ok is false when anything is rejected or a
   * limit is exceeded; nothing should be read then.
   */
  function planImport(entries) {
    const accepted = [];
    const rejected = [];
    if (!Array.isArray(entries) || entries.length === 0) {
      return { ok: false, root: null, accepted, rejected, problem: 'La carpeta está vacía.' };
    }
    if (entries.length > LIMITS.maxFiles) {
      return { ok: false, root: null, accepted, rejected, problem: `La carpeta tiene ${entries.length} ficheros; el máximo en el navegador es ${LIMITS.maxFiles}.` };
    }
    const roots = new Set(entries.map((e) => String(e.fullPath || '').split('/')[0]));
    if (roots.size !== 1) {
      return { ok: false, root: null, accepted, rejected, problem: 'Los ficheros no vienen de una única carpeta.' };
    }
    const [rootName] = roots;
    const seen = new Map();
    let total = 0;
    entries.forEach((e, index) => {
      const full = String(e.fullPath || '');
      const rel = full.slice(rootName.length + 1);
      const problem = full.startsWith(rootName + '/') ? pathProblem(rel) : 'fuera de la carpeta elegida';
      const size = Number(e.size);
      if (problem) { rejected.push({ path: rel || full, reason: problem }); return; }
      if (!Number.isFinite(size) || size < 0) { rejected.push({ path: rel, reason: 'tamaño desconocido' }); return; }
      if (size > LIMITS.maxFileBytes) { rejected.push({ path: rel, reason: `más de ${LIMITS.maxFileBytes / 1048576} MiB` }); return; }
      const folded = rel.toLowerCase();
      if (seen.has(folded)) { rejected.push({ path: rel, reason: `ambigua: coincide con ${seen.get(folded)} salvo mayúsculas` }); return; }
      seen.set(folded, rel);
      total += size;
      accepted.push({ path: rel, size, index });
    });
    if (rejected.length) {
      return { ok: false, root: rootName, accepted, rejected, problem: 'Hay ficheros que la demo no puede tratar con seguridad; no se ha verificado nada.' };
    }
    if (total > LIMITS.maxTotalBytes) {
      return { ok: false, root: rootName, accepted, rejected, problem: `La carpeta ocupa ${(total / 1048576).toFixed(1)} MiB; el máximo en el navegador es ${LIMITS.maxTotalBytes / 1048576} MiB.` };
    }
    return { ok: true, root: rootName, accepted, rejected, problem: null };
  }

  /**
   * Decodes a JSON file as the CLI reads it (Path.read_text(encoding="utf-8")): invalid UTF-8
   * is unreadable, and a byte-order mark is kept, so JSON.parse rejects it like json.loads.
   * Returns { text } or { finding }.
   */
  function decodeText(bytes, name) {
    try {
      return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
    } catch (e) {
      return { finding: `cannot read ${name}: invalid UTF-8` };
    }
  }

  const api = { LIMITS, pathProblem, planImport, decodeText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E3Import = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
