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
  const HELP = {
    original: 'Original: el paquete firmado en v0.1.1, sin cambios. Debe verificarse correctamente.',
    tampered: 'Cambiar una temperatura: un valor de data/readings.csv cambia después de firmar. El hash del fichero deja de coincidir.',
    extra: 'Añadir un fichero: aparece notes.txt, que el manifiesto firmado no declara.',
    missing: 'Borrar report.md: falta un fichero que el manifiesto firmado sí declara.',
    forged: 'Falsificar una firma: se cambia el rol dentro de una firma. La firma deja de ser válida.',
    manifest: 'Editar el manifiesto: cambia el bundle_id. Cambia la huella canónica y las dos firmas dejan de cubrirlo.',
    nopin: 'Sin claves fijadas: las firmas pueden ser válidas, pero no sabes quién firmó. La confianza queda sin comprobar.',
    untrusted: 'Una clave sin fijar: solo fijas la clave de example-runner. La firma del revisor es válida pero no cuenta y no se alcanza el umbral de 2.',
  };
  const EDITED_HELP = 'Has editado data/readings.csv a mano: se verifica tu versión contra el manifiesto firmado original.';

  function meaningOf(finding) {
    let m;
    if ((m = finding.match(/^hash mismatch: (.+)$/))) return `${m[1]} ha cambiado: su contenido actual no coincide con el declarado en el manifiesto firmado.`;
    if ((m = finding.match(/^missing file: (.+)$/))) return `${m[1]} está declarado en el manifiesto firmado, pero no está en el paquete.`;
    if ((m = finding.match(/^undeclared file: (.+)$/))) return `${m[1]} está en el paquete, pero el manifiesto firmado no lo declara: se añadió después de firmar.`;
    if (/invalid Ed25519 signature$/.test(finding)) return 'Una firma no corresponde a los datos firmados: se modificó o no la hizo esa clave.';
    if (/signed manifest_hash does not match/.test(finding)) return 'Una firma es válida, pero cubre otra versión del manifiesto, no esta.';
    if ((m = finding.match(/key for (.+) is not in the trusted key set$/))) return `La firma de ${m[1]} es válida, pero su clave no está entre las que fijaste: no cuenta como confiable.`;
    if ((m = finding.match(/^signature threshold not met: (\d+) < (\d+)$/))) return `Solo ${m[1]} firma(s) cuentan y la política exige ${m[2]} (--min-signatures).`;
    return 'El paquete no cumple una de las comprobaciones; consulta el informe JSON.';
  }

  const data = { manifest: null, signatures: null, trusted: null, files: {}, tamperedCsv: null, inputFindings: [], inputError: null };
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
      return kind === 'text' ? res.text() : new Uint8Array(await res.arrayBuffer());
    };
    // JSON goes through the input layer: an unreadable manifest or key file is ERROR (exit 2), as in the CLI.
    const parsed = E3Input.parseVerifyInput({
      manifestText: await get('valid/manifest.json', 'text'),
      signaturesText: await get('valid/signatures.json', 'text'),
      trustedText: await get('trusted-keys.json', 'text'),
    });
    if (parsed.error) { data.inputError = parsed.error; return; }
    data.manifest = parsed.input.manifest; data.signatures = parsed.input.signatures; data.trusted = parsed.input.trusted;
    data.inputFindings = parsed.findings;
    const entries = Array.isArray(data.manifest.files) ? data.manifest.files : [];
    for (const e of entries) if (e && E3.isSafePath(e.path)) data.files[e.path] = await get('valid/' + e.path);
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
    const r = E3Input.withInputFindings(await E3.verifyBundle(inp), data.inputFindings);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    lastReport = r.report;
    const rep = r.report;

    $('status').textContent = rep.status; $('status').className = 'status ' + rep.status;
    $('exit').textContent = 'exit ' + r.exitCode;
    $('timing').textContent = `Calculado en tu navegador en ${ms} ms.`;
    const f = $('findings'); f.replaceChildren();
    if (!rep.findings.length) f.append(el('li', { class: 'none' }, 'Ninguno.'));
    for (const x of rep.findings) f.append(el('li', { class: 'bad' }, '- ' + x));

    const sum = $('summary'); sum.replaceChildren();
    sum.append(el('li', { class: rep.files_verified === rep.files_declared ? 'ok' : 'bad' }, `${rep.files_verified}/${rep.files_declared} ficheros declarados íntegros`));
    const undeclared = rep.findings.filter((x) => x.startsWith('undeclared file')).length;
    if (undeclared) sum.append(el('li', { class: 'bad' }, `${undeclared} fichero(s) sin declarar en el manifiesto`));
    sum.append(el('li', { class: rep.signatures_valid === rep.signatures_present ? 'ok' : 'bad' }, `${rep.signatures_valid}/${rep.signatures_present} firmas válidas`));
    if (rep.trust_mode === 'pinned') sum.append(el('li', { class: rep.signatures_trusted === rep.signatures_present ? 'ok' : 'bad' }, `${rep.signatures_trusted}/${rep.signatures_present} firmas con claves fijadas`));
    else sum.append(el('li', { class: 'warn' }, 'sin claves fijadas: confianza no comprobada'));
    const counted = rep.trust_mode === 'pinned' ? rep.signatures_trusted : rep.signatures_valid;
    sum.append(el('li', { class: counted >= rep.min_signatures ? 'ok' : 'bad' }, `umbral ${counted >= rep.min_signatures ? 'cumplido' : 'no cumplido'}: mínimo ${rep.min_signatures} firmas`));

    const mean = $('meaning'); mean.replaceChildren();
    const next = $('next'); next.replaceChildren();
    if (rep.status === 'VERIFIED' && rep.trust_mode === 'pinned') {
      mean.append(el('li', {}, 'Los ficheros coinciden con el manifiesto firmado y las firmas de las claves que fijaste alcanzan el umbral. No dice que el contenido sea verdadero.'));
      next.append(document.createTextNode('Ejecuta la misma verificación en tu terminal con e3bundle v0.1.1 y compara: '));
      next.append(el('a', { href: '#local' }, 'pruébalo en tu equipo'), document.createTextNode('.'));
    } else if (rep.status === 'VERIFIED') {
      mean.append(el('li', {}, 'Los ficheros están íntegros y hay firmas válidas suficientes, pero sin claves fijadas no sabes quién firmó: cualquiera puede generar una clave y firmar.'));
      next.append(document.createTextNode('Fija las claves públicas que esperas con --trusted-keys antes de confiar en este resultado.'));
    } else {
      for (const text of new Set(rep.findings.map(meaningOf))) mean.append(el('li', {}, text));
      next.append(document.createTextNode('Revisa el fichero, el manifiesto o el origen del paquete. No trates esta evidencia como íntegra.'));
    }
    $('scenarioHelp').textContent = edited ? EDITED_HELP : HELP[scenario];
    $('provCli').textContent = cliCommand(inp.trusted);
    $('cli').textContent = cliCommand(inp.trusted) + ' --format text';
    $('provBundle').textContent = edited || scenario !== 'original' ? 'examples/bundles/valid @ v0.1.1, modificado en esta página' : 'examples/bundles/valid @ v0.1.1';

    const tb = $('integrity'); tb.replaceChildren();
    const label = { ok: ['coincide', 'ok'], changed: ['no coincide', 'bad'], missing: ['falta', 'bad'], extra: ['no declarado', 'bad'], invalid: ['hash declarado no válido', 'bad'] };
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
      const head = el('div', { class: 'sig-head' });
      head.append(el('span', { class: 'mono' }, s.signer), el('span', { class: 'hint' }, 'rol: ' + s.role));
      const l1 = el('span', {}, 'Firma criptográfica: '); l1.append(el('span', { class: s.signatureOk ? 'yes' : 'no' }, s.signatureOk ? 'válida' : 'inválida'));
      const l2 = el('span', {}, 'Firmó este manifiesto: '); l2.append(el('span', { class: s.hashOk ? 'yes' : 'no' }, s.hashOk ? 'sí' : 'no, firmó otra versión'));
      const l3 = el('span', {}, 'Clave fijada por ti: ');
      if (!inp.trusted) l3.append(el('span', { class: 'maybe' }, 'no comprobado (sin claves fijadas)'));
      else if (!s.counted) l3.append(el('span', { class: 'no' }, 'no aplica: la firma no es válida'));
      else l3.append(el('span', { class: s.trusted ? 'yes' : 'no' }, s.trusted ? 'sí' : 'no'));
      const counts = inp.trusted ? s.trusted === true : s.counted;
      const l4 = el('span', {}, 'Cuenta para el umbral: '); l4.append(el('span', { class: counts ? 'yes' : 'no' }, counts ? 'sí' : 'no'));
      card.append(head, l1, l2, l3, l4); sg.append(card);
    }
    $('threshold').textContent = `Cuentan ${counted} de ${rep.min_signatures} exigidas (--min-signatures ${rep.min_signatures}): ` +
      (inp.trusted ? 'solo firmas válidas hechas con una clave que has fijado.' : 'firmas válidas; sin claves fijadas no se comprueba quién firmó.');
    setPill('p3', r.phases.signatures.every((s) => s.signatureOk && s.hashOk) ? 'ok' : 'bad', r.phases.signatures.every((s) => s.signatureOk && s.hashOk) ? 'correcto' : 'fallo detectado');

    const tl = $('trust'); tl.replaceChildren();
    $('trustExplain').textContent = inp.trusted
      ? 'Con --trusted-keys solo cuentan las firmas hechas con las claves públicas que tú has fijado.'
      : 'Sin --trusted-keys, una firma válida solo prueba que alguien con esa clave firmó; no dice quién. Por eso el resultado puede ser VERIFIED con la confianza sin comprobar.';
    for (const s of r.phases.signatures) {
      const li = el('li', { class: 'trust-item' });
      let cls = 'maybe'; let text = 'confianza no comprobada (sin claves fijadas)';
      if (inp.trusted && !s.counted) { cls = 'no'; text = 'no cuenta: la firma no es válida para este manifiesto'; }
      else if (inp.trusted) { cls = s.trusted ? 'yes' : 'no'; text = s.trusted ? 'clave fijada: cuenta' : 'clave no fijada: no cuenta'; }
      li.append(el('span', { class: 'mono signer-col' }, s.signer), el('span', { class: cls }, text)); tl.append(li);
    }
    const trustOk = inp.trusted && r.phases.signatures.every((s) => s.trusted);
    setPill('p4', !inp.trusted ? 'warn' : (trustOk ? 'ok' : 'bad'), !inp.trusted ? 'no comprobada' : (trustOk ? 'correcto' : 'fallo detectado'));

    lastReport = rep;
    $('report').textContent = reportText();
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

  const reportText = () => E3Input.reportJson(lastReport);

  // Guided shows the result and its explanation; advanced adds the verifier's exact data.
  let mode = location.hash === '#avanzado' ? 'advanced' : 'guided';
  function applyMode() {
    const advanced = mode === 'advanced';
    $('modeGuided').setAttribute('aria-pressed', String(!advanced));
    $('modeAdvanced').setAttribute('aria-pressed', String(advanced));
    $('phases').hidden = !advanced || !!data.inputError;
    history.replaceState(null, '', advanced ? '#avanzado' : location.pathname + location.search);
  }

  // The report is built in the page and saved through a local blob: URL; nothing is uploaded.
  function downloadReport() {
    E3Input.saveText(document, reportText() + '\n', 'e3bundle-report.json');
  }

  // Input could not be read: no cryptographic check ran, so no phase is shown and nothing can be VERIFIED.
  function renderInputError(err) {
    lastReport = err.report;
    $('status').textContent = 'ERROR'; $('status').className = 'status ERROR';
    $('exit').textContent = 'exit ' + err.exitCode;
    $('timing').textContent = 'La verificación no ha empezado.';
    const f = $('findings'); f.replaceChildren();
    for (const x of err.report.findings) f.append(el('li', { class: 'bad' }, '- ' + x));
    const sum = $('summary'); sum.replaceChildren(el('li', { class: 'warn' }, 'entrada no válida: no se ha comprobado nada'));
    $('meaning').replaceChildren(el('li', {}, 'El paquete no se ha podido leer como e3.bundle.v1, así que no hay resultado criptográfico: ni íntegro ni manipulado.'));
    $('next').textContent = 'Comprueba que manifest.json y el fichero de claves son JSON válidos y tienen la forma esperada. Con el CLI obtendrías el mismo ERROR (exit 2).';
    $('phases').hidden = true;
    $('scenarioHelp').textContent = 'No se pueden ejecutar escenarios sin un paquete legible.';
    $('report').textContent = reportText();
    ['run', 'csv', 'modeGuided', 'modeAdvanced'].forEach((id) => { $(id).disabled = true; });
    $('scenarios').replaceChildren();
  }

  function reset() {
    scenario = 'original'; edited = false; lastReport = null;
    $('csv').value = dec.decode(data.files['data/readings.csv']);
    $('copy').textContent = 'Copiar JSON';
    renderScenarios();
    run();
  }

  async function start() {
    if (!(window.crypto && window.crypto.subtle)) { $('unsupported').hidden = false; return; }
    if (!(await E3.ed25519Supported())) $('unsupported').hidden = false;
    try { await load(); } catch (e) { $('loadError').hidden = false; return; }
    $('modeGuided').addEventListener('click', () => { mode = 'guided'; applyMode(); });
    $('modeAdvanced').addEventListener('click', () => { mode = 'advanced'; applyMode(); });
    if (data.inputError) { renderInputError(data.inputError); applyMode(); return; }
    applyMode();
    $('reset').addEventListener('click', reset);
    $('download').addEventListener('click', downloadReport);
    $('csv').value = dec.decode(data.files['data/readings.csv']);
    $('csv').addEventListener('input', () => { edited = true; renderScenarios(); $('scenarioHelp').textContent = EDITED_HELP; $('csvNote').textContent = 'Has editado el fichero. Pulsa «Verificar ahora».'; });
    $('run').addEventListener('click', run);
    $('copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(reportText()); $('copy').textContent = 'Copiado'; }
      catch (e) { $('copy').textContent = 'Selecciona y copia el texto'; }
    });
    renderScenarios();
    run();
  }
  start();
})();
