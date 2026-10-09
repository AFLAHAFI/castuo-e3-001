/*
 * Verify a bundle folder chosen by the visitor. Order of work: plan the import from names
 * and sizes only (importer.js), read the accepted files in this tab, parse JSON with the
 * CLI's input contract (input.js), verify with verifier.js. Nothing is sent anywhere.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEYS_MAX_BYTES = 1024 * 1024;
  const st = { files: [], plan: null, keysName: null, keysText: null, keysObj: null, keysProblem: null, report: null };

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function minSignatures() {
    const raw = $('min').value.trim();
    if (!/^\d{1,4}$/.test(raw) || Number(raw) > 1000) return null;
    return Number(raw);
  }

  function refresh() {
    const min = minSignatures();
    $('minError').textContent = min === null ? 'Escribe un número entero entre 0 y 1000.' : '';
    $('min').setAttribute('aria-invalid', String(min === null));
    $('verify').disabled = !(st.plan && st.plan.ok) || min === null;
    const pinned = $('trustPinned').checked;
    $('keyList').querySelectorAll('input[type=checkbox]').forEach((c) => { c.disabled = !pinned; });
    $('downloadKeys').disabled = !(pinned && st.keysObj && checkedKeys().length);
  }

  function checkedKeys() {
    return Array.from($('keyList').querySelectorAll('input[type=checkbox]:checked')).map((c) => c.value);
  }

  function renderPlan() {
    const list = $('plan'); list.replaceChildren();
    const p = st.plan;
    if (!p) { $('planProblem').textContent = ''; return; }
    $('planProblem').textContent = p.ok
      ? `Carpeta «${p.root}»: ${p.accepted.length} ficheros dentro de los límites. Pulsa «Verificar paquete».`
      : p.problem;
    $('planProblem').className = 'plan-problem' + (p.ok ? '' : ' bad');
    for (const r of p.rejected) {
      const li = el('li', { class: 'rejected' });
      li.append(el('span', { class: 'pill bad' }, 'rechazado'), el('span', { class: 'mono' }, r.path), el('span', { class: 'hint' }, r.reason));
      list.append(li);
    }
    for (const a of p.accepted.slice(0, 50)) {
      const li = el('li');
      li.append(el('span', { class: 'pill ok' }, 'aceptado'), el('span', { class: 'mono' }, a.path), el('span', { class: 'hint' }, a.size + ' bytes'));
      list.append(li);
    }
    if (p.accepted.length > 50) list.append(el('li', { class: 'hint' }, `… y ${p.accepted.length - 50} más`));
  }

  function onFolder() {
    st.files = Array.from($('folder').files || []);
    st.plan = E3Import.planImport(st.files.map((f) => ({ fullPath: f.webkitRelativePath || f.name, size: f.size })));
    $('resBox').hidden = true; $('progress').value = 0;
    $('progressText').textContent = st.plan.ok ? 'Listo para leer los ficheros.' : 'No se leerá ningún fichero.';
    renderPlan(); refresh();
  }

  async function onKeys() {
    const file = ($('keys').files || [])[0];
    st.keysName = null; st.keysText = null; st.keysObj = null; st.keysProblem = null; st.keysTooBig = false;
    $('keyList').replaceChildren(); $('keysNote').textContent = '';
    if (file) {
      st.keysName = file.name;
      if (file.size > KEYS_MAX_BYTES) {
        st.keysProblem = 'El fichero de claves supera 1 MiB, el límite de la demo; no se ha leído. Fíjalas con el CLI.';
        st.keysTooBig = true;
      } else {
        const d = E3Import.decodeText(new Uint8Array(await file.arrayBuffer()), file.name);
        if (d.finding) st.keysProblem = d.finding;
        else {
          st.keysText = d.text;
          let v = null;
          try { v = JSON.parse(d.text); } catch (e) { v = null; }
          if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string')) st.keysObj = v;
          else st.keysProblem = 'No es un objeto {"firmante": "clave_b64"}. Si fijas claves con él, el resultado será ERROR, como en el CLI.';
        }
      }
      $('keysNote').textContent = st.keysProblem || `${Object.keys(st.keysObj).length} claves en ${file.name}. Ninguna está fijada hasta que la marques.`;
      if (st.keysObj) {
        for (const [signer, key] of Object.entries(st.keysObj)) {
          const id = 'k-' + Array.from(signer).map((c) => c.codePointAt(0).toString(16)).join('-');
          const li = el('li');
          const box = el('input', { type: 'checkbox', id, value: signer });
          box.addEventListener('change', refresh);
          const label = el('label', { for: id });
          label.append(el('span', { class: 'mono' }, signer), document.createTextNode(' · '), el('span', { class: 'mono hint' }, key.slice(0, 16) + '…'));
          li.append(box, label); $('keyList').append(li);
        }
      }
    }
    refresh();
  }

  // What --trusted-keys receives: nothing, the selected subset, or the file as-is when it is unreadable.
  function trustedInput() {
    if (!$('trustPinned').checked) return { text: null };
    if (st.keysTooBig) return { blocked: st.keysProblem };
    if (st.keysProblem && st.keysName && st.keysText === null) return { finding: st.keysProblem };
    if (st.keysObj) {
      const subset = {};
      for (const s of checkedKeys()) subset[s] = st.keysObj[s];
      return { text: JSON.stringify(subset), subset: true };
    }
    if (st.keysText !== null) return { text: st.keysText };
    return { text: '{}', subset: true };
  }

  function cliCommand(min, trusted) {
    let cmd = `e3bundle verify ${st.plan.root} --min-signatures ${min}`;
    if (trusted.text !== null && trusted.text !== undefined) cmd += trusted.subset ? ' --trusted-keys trusted-keys-marcadas.json' : ` --trusted-keys ${st.keysName}`;
    return cmd + ' --format text';
  }

  function show(report, exitCode, min, trusted) {
    st.report = report;
    $('status').textContent = report.status; $('status').className = 'status ' + report.status;
    $('exit').textContent = 'exit ' + exitCode;
    const f = $('findings'); f.replaceChildren();
    if (!report.findings.length) f.append(el('li', { class: 'none' }, 'Ninguno.'));
    for (const x of report.findings) f.append(el('li', { class: 'bad' }, '- ' + x));
    const sum = $('summary'); sum.replaceChildren();
    if (report.status === 'ERROR') {
      sum.append(el('li', { class: 'warn' }, 'entrada no válida: no se ha comprobado nada'));
      $('meaning').textContent = 'El paquete o el fichero de claves no se pudo leer como espera e3bundle. No hay resultado criptográfico. El CLI daría el mismo ERROR (exit 2).';
    } else {
      sum.append(el('li', { class: report.files_verified === report.files_declared ? 'ok' : 'bad' }, `${report.files_verified}/${report.files_declared} ficheros declarados íntegros`));
      sum.append(el('li', { class: report.signatures_valid === report.signatures_present ? 'ok' : 'bad' }, `${report.signatures_valid}/${report.signatures_present} firmas válidas`));
      if (report.trust_mode === 'pinned') sum.append(el('li', { class: report.signatures_trusted >= min ? 'ok' : 'bad' }, `${report.signatures_trusted} firmas con claves que has fijado`));
      else sum.append(el('li', { class: 'warn' }, 'sin claves fijadas: confianza no comprobada'));
      $('meaning').textContent = report.status === 'VERIFIED'
        ? (report.trust_mode === 'pinned'
          ? 'Los ficheros coinciden con el manifiesto firmado y las firmas de las claves que fijaste alcanzan el umbral. No dice que el contenido sea verdadero.'
          : 'Los ficheros están íntegros y hay firmas válidas suficientes, pero sin claves fijadas no sabes quién firmó.')
        : 'Al menos una comprobación no se cumple: mira los hallazgos. No trates este paquete como íntegro.';
    }
    $('cli').textContent = cliCommand(min, trusted);
    $('resBox').hidden = false;
  }

  async function verify() {
    const min = minSignatures();
    if (!st.plan || !st.plan.ok || min === null) return;
    $('verify').disabled = true;
    const trusted = trustedInput();
    try {
      if (trusted.blocked) { $('progressText').textContent = trusted.blocked; return; }
      if (trusted.finding) { show({ status: 'ERROR', findings: [trusted.finding] }, 2, min, trusted); return; }
      // Keys are read first, as the CLI does: a bad key file wins over a bad manifest.
      const pt = E3Input.parseTrusted(trusted.text, st.keysName || undefined);
      if (pt.error) { show(pt.error.report, pt.error.exitCode, min, trusted); return; }
      // No prototype: a file named __proto__ or constructor is just a file.
      const bytes = Object.create(null);
      const total = st.plan.accepted.reduce((n, a) => n + a.size, 0) || 1;
      let done = 0;
      for (const a of st.plan.accepted) {
        bytes[a.path] = new Uint8Array(await st.files[a.index].arrayBuffer());
        done += a.size;
        $('progress').value = Math.round((done / total) * 100);
        $('progressText').textContent = `Leídos ${st.plan.accepted.indexOf(a) + 1} de ${st.plan.accepted.length} ficheros en esta pestaña.`;
      }
      if (!('manifest.json' in bytes)) { show({ status: 'ERROR', findings: ['cannot read manifest.json: file not found'] }, 2, min, trusted); return; }
      const m = E3Import.decodeText(bytes['manifest.json'], 'manifest.json');
      const findings = [];
      let signaturesText = null;
      if ('signatures.json' in bytes) {
        const s = E3Import.decodeText(bytes['signatures.json'], 'signatures.json');
        if (s.finding) findings.push(s.finding); else signaturesText = s.text;
      }
      if (m.finding) { show({ status: 'ERROR', findings: [m.finding] }, 2, min, trusted); return; }
      const parsed = E3Input.parseVerifyInput({ manifestText: m.text, signaturesText, trustedText: trusted.text, trustedName: st.keysName || undefined });
      if (parsed.error) { show(parsed.error.report, parsed.error.exitCode, min, trusted); return; }
      const files = Object.create(null);
      for (const [p, b] of Object.entries(bytes)) if (p !== 'manifest.json' && p !== 'signatures.json') files[p] = b;
      const r = E3Input.withInputFindings(
        await E3.verifyBundle({ files, manifest: parsed.input.manifest, signatures: parsed.input.signatures, trusted: parsed.input.trusted, minSignatures: min }),
        findings.concat(parsed.findings));
      $('progressText').textContent = 'Verificación terminada en tu navegador.';
      show(r.report, r.exitCode, min, trusted);
    } finally {
      refresh();
    }
  }

  function reset() {
    $('folder').value = ''; $('keys').value = '';
    Object.assign(st, { files: [], plan: null, keysName: null, keysText: null, keysObj: null, keysProblem: null, report: null });
    $('plan').replaceChildren(); $('planProblem').textContent = ''; $('keyList').replaceChildren(); $('keysNote').textContent = '';
    $('trustNone').checked = true; $('min').value = '1';
    $('progress').value = 0; $('progressText').textContent = 'Elige una carpeta para empezar.';
    $('resBox').hidden = true; $('findings').replaceChildren(); $('summary').replaceChildren();
    refresh();
  }

  async function start() {
    if (!(window.crypto && window.crypto.subtle) || !(await E3.ed25519Supported())) $('unsupported').hidden = false;
    $('folder').addEventListener('change', onFolder);
    $('keys').addEventListener('change', onKeys);
    $('trustNone').addEventListener('change', refresh);
    $('trustPinned').addEventListener('change', refresh);
    $('min').addEventListener('input', refresh);
    $('verify').addEventListener('click', verify);
    $('reset').addEventListener('click', reset);
    $('download').addEventListener('click', () => { if (st.report) E3Input.saveText(document, E3Input.reportJson(st.report) + '\n', 'e3bundle-report.json'); });
    $('downloadKeys').addEventListener('click', () => {
      const subset = {};
      for (const s of checkedKeys()) subset[s] = st.keysObj[s];
      E3Input.saveText(document, JSON.stringify(subset, null, 2) + '\n', 'trusted-keys-marcadas.json');
    });
    refresh();
  }
  start();
})();
