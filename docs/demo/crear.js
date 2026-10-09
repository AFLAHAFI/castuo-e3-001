/* Phase 2: keygen → manifest → sign → verify in the browser, producing a bundle the CLI also verifies. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const st = { key: null, pub: '', manifest: null, manifestHash: '', signatures: [], signedHash: '', verified: false };

  function files() { return { 'datos.csv': $('f1').value, 'informe.md': $('f2').value }; }
  function signerId() { return ($('signer').value || 'yo').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'yo'; }

  function refresh() {
    const steps = [['1', 'Clave', !!st.key], ['2', 'Ficheros', true], ['3', 'Manifiesto', !!st.manifest], ['4', 'Firma', st.signatures.length > 0], ['5', 'Verificación', st.verified]];
    const p = $('progress'); p.replaceChildren();
    for (const [n, label, done] of steps) { const li = document.createElement('li'); li.textContent = n + ' · ' + label; if (done) li.className = 'done'; p.append(li); }
    $('sign').disabled = !(st.key && st.manifest);
    $('verify').disabled = st.signatures.length === 0;
    $('cpM').disabled = !st.manifest; $('cpS').disabled = st.signatures.length === 0; $('cpT').disabled = !st.key;
    $('signHint').textContent = !st.key ? 'Primero genera tu clave (paso 1).' : !st.manifest ? 'Primero crea el manifiesto (paso 3).'
      : (st.signatures.length && st.signedHash !== st.manifestHash) ? 'Has rehecho el manifiesto después de firmar: la firma ya no corresponde. Verifica para verlo, o firma de nuevo.'
      : 'Firmas la huella canónica del manifiesto.';
    $('editNote').textContent = st.signatures.length ? 'Si cambias un fichero ahora, el paquete ya no coincide con lo que firmaste: verifica y lo verás.' : 'Puedes escribir lo que quieras; usa solo datos de prueba.';
  }

  async function copy(btn, text) {
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copiado'; } catch (e) { btn.textContent = 'No se pudo copiar'; }
    setTimeout(() => { btn.textContent = label; }, 1600);
  }

  async function start() {
    if (!(window.crypto && window.crypto.subtle) || !(await E3.ed25519Supported())) {
      $('unsupported').hidden = false;
      ['keygen', 'mk'].forEach((id) => { $(id).disabled = true; });
      refresh();
      return;
    }
    $('keygen').addEventListener('click', async () => {
      const k = await E3.generateKey();
      st.key = k.keyPair; st.pub = k.publicKeyB64; st.signatures = []; st.verified = false;
      $('pub').textContent = st.pub; $('keyBox').hidden = false; $('keygen').textContent = 'Generar otra clave';
      $('sigs').hidden = true; $('resBox').hidden = true; refresh();
    });
    $('mk').addEventListener('click', async () => {
      st.manifest = await E3.createManifest(files(), 'mi-paquete-001');
      st.manifestHash = await E3.sha256(E3.canonical(st.manifest));
      st.verified = false;
      $('man').textContent = JSON.stringify(st.manifest, null, 2); $('mh').textContent = st.manifestHash; $('manBox').hidden = false;
      $('resBox').hidden = true; refresh();
    });
    $('sign').addEventListener('click', async () => {
      st.signatures = [await E3.signManifest(st.manifest, st.key, signerId(), 'reviewer', st.pub)];
      st.signedHash = st.manifestHash; st.verified = false;
      $('sigs').textContent = JSON.stringify(st.signatures, null, 2); $('sigs').hidden = false; $('resBox').hidden = true; refresh();
    });
    $('verify').addEventListener('click', async () => {
      const sid = st.signatures[0].signer_id;
      const r = await E3.verifyBundle({ files: files(), manifest: st.manifest, signatures: st.signatures, trusted: { [sid]: st.pub }, minSignatures: 1 });
      st.verified = r.report.status === 'VERIFIED';
      $('status').textContent = r.report.status; $('status').className = 'status ' + r.report.status; $('exit').textContent = 'exit ' + r.exitCode;
      const f = $('findings'); f.replaceChildren();
      const add = (cls, text) => { const li = document.createElement('li'); li.className = cls; li.textContent = text; f.append(li); };
      if (!r.report.findings.length) add('none', 'Sin hallazgos. Ahora cambia una letra en un fichero y vuelve a verificar.');
      r.report.findings.forEach((x) => add('bad', '- ' + x));
      $('resBox').hidden = false; refresh();
    });
    ['f1', 'f2'].forEach((id) => $(id).addEventListener('input', () => { st.verified = false; refresh(); }));
    $('cpM').addEventListener('click', () => copy($('cpM'), JSON.stringify(st.manifest, null, 2) + '\n'));
    $('cpS').addEventListener('click', () => copy($('cpS'), JSON.stringify(st.signatures, null, 2) + '\n'));
    $('cpT').addEventListener('click', () => {
      const sid = st.signatures.length ? st.signatures[0].signer_id : signerId();
      copy($('cpT'), JSON.stringify({ [sid]: st.pub }) + '\n');
    });
    refresh();
  }
  start();
})();
