/* Phase 1: verify the released example bundle in the browser. Same scenarios as tests/conformance.mjs. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const BASE = 'bundles/';
  const SCENARIOS = [
    ['original', 'Original'], ['tampered', 'Cambiar una temperatura'], ['extra', 'Añadir un fichero'], ['missing', 'Borrar report.md'],
    ['forged', 'Falsificar una firma'], ['manifest', 'Editar el manifiesto'], ['nopin', 'Sin claves fijadas'], ['untrusted', 'Una clave sin fijar'],
  ];
  const data = { manifest: null, signatures: null, trusted: null, files: {}, tamperedCsv: null };
  let scenario = 'original';
  let edited = false;
  let lastReport = null;

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  async function load() {
    const get = async (p, kind) => {
      const res = await fetch(BASE + p, { cache: 'no-store' });
      if (!res.ok) throw new Error(p + ' ' + res.status);
      return kind === 'json' ? res.json() : new Uint8Array(await res.arrayBuffer());
    };
    data.manifest = await get('valid/manifest.json', 'json');
    data.signatures = await get('valid/signatures.json', 'json');
    data.trusted = await get('trusted-keys.json', 'json');
    for (const e of data.manifest.files) data.files[e.path] = await get('valid/' + e.path);
    data.tamperedCsv = await get('tampered/data/readings.csv');
  }

  function input(name, csvBytes) {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const files = Object.assign({}, data.files, { 'data/readings.csv': csvBytes });
    let manifest = data.manifest; let signatures = data.signatures; let trusted = data.trusted;
    if (name === 'extra') files['notes.txt'] = enc.encode('added after signing\n');
    if (name === 'missing') delete files['report.md'];
    if (name === 'forged') { signatures = clone(signatures); signatures[1].role = 'auditor'; }
    if (name === 'manifest') manifest = Object.assign(clone(manifest), { bundle_id: 'example-002' });
    if (name === 'nopin') trusted = null;
    if (name === 'untrusted') trusted = { 'example-runner': data.trusted['example-runner'] };
    return { files, manifest, signatures, trusted, minSignatures: 2 };
  }

  function cliCommand(trusted) {
    return 'e3bundle verify examples/bundles/valid --min-signatures 2' + (trusted ? ' --trusted-keys examples/bundles/trusted-keys.json' : '');
  }

  function setPill(id, kind, text) { const p = $(id); p.className = 'pill' + (kind ? ' ' + kind : ''); p.textContent = text; }

  async function run() {
    const csvBytes = enc.encode($('csv').value);
    const inp = input(edited ? 'original' : scenario, csvBytes);
    const t0 = performance.now();
    const r = await E3.verifyBundle(inp);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    lastReport = r.report;
    const rep = r.report;

    $('status').textContent = rep.status; $('status').className = 'status ' + rep.status;
    $('exit').textContent = 'exit ' + r.exitCode;
    $('timing').textContent = `Calculado en tu navegador en ${ms} ms · ${rep.files_verified}/${rep.files_declared} ficheros · ${rep.signatures_valid} firmas válidas`;
    const f = $('findings'); f.replaceChildren();
    if (!rep.findings.length) f.append(el('li', { class: 'none' }, 'Sin hallazgos: ficheros sin cambios, nada sin declarar, umbral de firmas cumplido.'));
    for (const x of rep.findings) f.append(el('li', { class: 'bad' }, '- ' + x));
    $('provCli').textContent = cliCommand(inp.trusted);
    $('cli').textContent = cliCommand(inp.trusted) + ' --format text';
    $('provBundle').textContent = edited || scenario !== 'original' ? 'examples/bundles/valid @ v0.1.1, modificado en esta página' : 'examples/bundles/valid @ v0.1.1';

    const tb = $('integrity'); tb.replaceChildren();
    const label = { ok: ['coincide', 'ok'], changed: ['no coincide', 'bad'], missing: ['falta', 'bad'], extra: ['no declarado', 'bad'] };
    for (const row of r.phases.integrity) {
      const tr = el('tr');
      tr.append(el('td', { class: 'mono' }, row.path), el('td', { class: 'hash' }, row.declared || '(no declarado)'),
        el('td', { class: 'hash' + (row.state === 'ok' ? '' : ' bad') }, row.actual || '(no está)'));
      const td = el('td'); td.append(el('span', { class: 'pill ' + label[row.state][1] }, label[row.state][0])); tr.append(td);
      tb.append(tr);
    }
    setPill('p1', r.phases.integrity.every((x) => x.state === 'ok') ? 'ok' : 'bad', r.phases.integrity.every((x) => x.state === 'ok') ? 'correcto' : 'fallo detectado');

    $('canon').textContent = r.canonicalManifest; $('mhash').textContent = rep.manifest_hash;
    const signedHash = data.signatures[0].manifest_hash;
    setPill('p2', rep.manifest_hash === signedHash ? 'ok' : 'warn', rep.manifest_hash === signedHash ? 'igual que la firmada' : 'huella distinta');

    const sg = $('sigs'); sg.replaceChildren();
    for (const s of r.phases.signatures) {
      const good = s.signatureOk && s.hashOk;
      const card = el('div', { class: 'sig' + (good ? '' : ' bad') });
      const head = el('div', { style: 'display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap' });
      head.append(el('span', { class: 'mono' }, s.signer), el('span', { class: 'hint' }, 'rol: ' + s.role));
      const l1 = el('span', {}, 'Firma criptográfica: '); l1.append(el('span', { class: s.signatureOk ? 'yes' : 'no' }, s.signatureOk ? 'válida' : 'inválida'));
      const l2 = el('span', {}, 'Firmó este manifiesto: '); l2.append(el('span', { class: s.hashOk ? 'yes' : 'no' }, s.hashOk ? 'sí' : 'no, firmó otra versión'));
      card.append(head, l1, l2); sg.append(card);
    }
    setPill('p3', r.phases.signatures.every((s) => s.signatureOk && s.hashOk) ? 'ok' : 'bad', r.phases.signatures.every((s) => s.signatureOk && s.hashOk) ? 'correcto' : 'fallo detectado');

    const tl = $('trust'); tl.replaceChildren();
    $('trustExplain').textContent = inp.trusted
      ? 'Con --trusted-keys solo cuentan las firmas hechas con las claves públicas que tú has fijado.'
      : 'Sin --trusted-keys, una firma válida solo prueba que alguien con esa clave firmó; no dice quién. Por eso el resultado puede ser VERIFIED con la confianza sin comprobar.';
    for (const s of r.phases.signatures) {
      const li = el('li', { style: 'display:flex;gap:10px;flex-wrap:wrap' });
      let cls = 'maybe'; let text = 'confianza no comprobada (sin claves fijadas)';
      if (inp.trusted && !s.counted) { cls = 'no'; text = 'no cuenta: la firma no es válida para este manifiesto'; }
      else if (inp.trusted) { cls = s.trusted ? 'yes' : 'no'; text = s.trusted ? 'clave fijada: cuenta' : 'clave no fijada: no cuenta'; }
      li.append(el('span', { class: 'mono', style: 'min-width:160px' }, s.signer), el('span', { class: cls }, text)); tl.append(li);
    }
    const trustOk = inp.trusted && r.phases.signatures.every((s) => s.trusted);
    setPill('p4', !inp.trusted ? 'warn' : (trustOk ? 'ok' : 'bad'), !inp.trusted ? 'no comprobada' : (trustOk ? 'correcto' : 'fallo detectado'));

    $('report').textContent = JSON.stringify(rep, Object.keys(rep).sort(), 2);
    const original = dec.decode(data.files['data/readings.csv']);
    $('csvNote').textContent = edited ? 'Has editado el fichero: el resultado de arriba usa tu versión.' : ($('csv').value === original ? 'Contenido idéntico al firmado en v0.1.1.' : 'Este contenido es distinto del que se firmó.');
  }

  function renderScenarios() {
    const box = $('scenarios'); box.replaceChildren();
    for (const [id, text] of SCENARIOS) {
      const b = el('button', { type: 'button', class: 'chip-btn', 'aria-pressed': String(id === scenario && !edited) }, text);
      b.addEventListener('click', () => {
        scenario = id; edited = false;
        $('csv').value = dec.decode(id === 'tampered' ? data.tamperedCsv : data.files['data/readings.csv']);
        renderScenarios(); run();
      });
      box.append(b);
    }
  }

  async function start() {
    if (!(window.crypto && window.crypto.subtle)) { $('unsupported').hidden = false; return; }
    if (!(await E3.ed25519Supported())) $('unsupported').hidden = false;
    try { await load(); } catch (e) { $('loadError').hidden = false; return; }
    $('csv').value = dec.decode(data.files['data/readings.csv']);
    $('csv').addEventListener('input', () => { edited = true; renderScenarios(); $('csvNote').textContent = 'Has editado el fichero. Pulsa «Verificar ahora».'; });
    $('run').addEventListener('click', run);
    $('copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(lastReport, Object.keys(lastReport).sort(), 2)); $('copy').textContent = 'Copiado'; }
      catch (e) { $('copy').textContent = 'Selecciona y copia el texto'; }
    });
    renderScenarios();
    run();
  }
  start();
})();
