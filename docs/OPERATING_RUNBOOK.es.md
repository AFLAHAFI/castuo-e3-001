# Runbook operativo E3-001

## Alcance

E3-001 valida únicamente el comportamiento S-001A declarado: fallo, captura de evidencia, recuperación y replay determinista sobre una fixture y un commit congelados. No demuestra producción, operación de campo, certificación, tracción comercial, adopción de clientes ni vendor exit. Un resultado local nunca equivale a verificación independiente.

## 1. Preparar el checkout y congelar el paquete

El operador del runner externo debe trabajar sobre un checkout limpio y debe ser distinto del autor de la implementación y del autor del paquete. Fija el commit exacto y una referencia inmutable de rollback:

```bash
export REPO=/ruta/al/checkout/external-runner
export SOURCE_COMMIT=<40-caracteres-hexadecimales-en-minúsculas>
export BUNDLE=/ruta/al/bundle-e3-001
mkdir -p "$BUNDLE"
cd "$REPO"
git checkout --detach "$SOURCE_COMMIT"
git status --short
```

El `manifest.json` debe contener, como mínimo:

```json
{
  "scenario_id": "S-001A",
  "protocol_id": "E3-001-S001A-FOREIGN-REPLAY",
  "source_commit": "<40-lowercase-hex>",
  "fixture_path": "fixture.json",
  "fixture_hash": "sha256:<64-lowercase-hex>",
  "result_hash": "sha256:<64-lowercase-hex>",
  "evidence_hash": "sha256:<64-lowercase-hex>",
  "rollback_ref": "<immutable-tag-or-commit>",
  "external_runner": true,
  "foreign_replay": true,
  "production_claim": false,
  "commercial_claim": false
}
```

La fixture, el resultado y el envelope deben hashearse después de congelar sus contenidos. Cualquier mutación posterior invalida el paquete.

## 2. Ejecutar el foreign replay offline

El runner debe usar red deshabilitada por harness, una identidad que no sea `LOCAL`, `CANDIDATE` o el runner de CI del autor, y una fixture fija:

```bash
python3 scripts/run_s001a_foreign_replay.py \
  --fixture fixture.json \
  --output "$BUNDLE/foreign-replay-result.json" \
  --runner-id FOREIGN-RUNNER-<operator-id> \
  --source-commit "$SOURCE_COMMIT" \
  --stress-repetitions 3
```

El resultado esperado es `PASS_WITHIN_DECLARED_SCOPE`, con decisiones equivalentes, semántica de evidencia equivalente, recuperación completa, casos negativos y firewall de claims sin cambios. El resultado no puede reclamar producción.

## 3. Crear y firmar la attestation del runner

`runner-attestation.json` debe contener `attestation_id`, `runner_id`, `independent`, `source_commit`, `result_hash`, `public_key_b64` y `signature_b64`. El runner debe firmar el payload canónico con Ed25519. La clave privada debe permanecer en el runner o dispositivo de firma y nunca entrar en Git, logs, frontend o este bundle público.

Un ejemplo de generación de una clave efímera de prueba, sólo para validar el mecanismo y no para sustituir una identidad autorizada, es:

```bash
openssl genpkey -algorithm ED25519 -out /tmp/e3-runner-private.pem
openssl pkey -in /tmp/e3-runner-private.pem -pubout -out /tmp/e3-runner-public.pem
chmod 600 /tmp/e3-runner-private.pem
```

Para una ejecución real, la identidad y el dispositivo de firma deben estar aprobados por la gobernanza externa. La firma debe cubrir el JSON canónico exacto, no una representación reordenada posteriormente.

## 4. Crear las revisiones humanas firmadas

Al menos dos revisores independientes deben inspeccionar fixture, comandos, salida, casos negativos, recuperación, hashes, runtime y limitaciones. Cada entrada de `reviewers.json` debe declarar `independence: true`, `decision: APPROVE`, el mismo `source_commit`, el mismo `evidence_hash`, el mismo `replay_result_hash`, su clave pública y su firma Ed25519 sobre la entrada canónica.

No basta con producir dos firmas: la revisión debe ser sustantiva, trazable y realizada fuera del camino de autoría.

## 5. Crear y validar el Evidence Envelope

Usa el contrato siguiente como límite de claims:

```json
{
  "scenario_id": "S-001A",
  "replay_status": "PASS_WITHIN_DECLARED_SCOPE",
  "review_status": "REVIEW_PENDING",
  "claim_boundary": "EXTERNAL_REPLAY_ONLY",
  "assurance": { "oneD": true, "oneR": true, "oneV": false, "oneA": false },
  "promotion": "BLOCKED"
}
```

Calcula los hashes y completa `manifest.json` después de cerrar el envelope. Ejecuta el validador desde el mismo repositorio del protocolo:

```bash
cd /ruta/al/e3-001-external-verification
python3 scripts/validate_external_evidence_bundle.py "$BUNDLE" \
  --min-reviewers 2 \
  --output "$BUNDLE/external-evidence-validation.json"
```

La salida válida debe terminar con código 0 y `status: VERIFIED_FOR_G2`. Si el validador devuelve `BLOCKED`, `NO_CLAIM` o cualquier finding, detén la cadena.

## 6. Evaluar G2 localmente

La evaluación G2 es de sólo lectura y no autoriza producción:

```bash
python3 scripts/evaluate_g2.py \
  "$BUNDLE/external-evidence-validation.json" \
  --output "$BUNDLE/g2-decision.json"
```

La salida sólo es elegible si `status: PASS`; debe conservar `oneA: false` y `promotion: BLOCKED`.

## 7. Probar localmente la publicación sin GitHub

La prueba local debe usar una clave de prueba o un dispositivo de firma controlado, nunca una clave de producción en el repositorio. El publicador consume sólo los JSON de validación y G2:

```bash
export CASTUO_SNAPSHOT_SIGNING_KEY_B64=<valor-protegido-en-la-sesión-local>
python3 scripts/publish_public_snapshot.py \
  --validation "$BUNDLE/external-evidence-validation.json" \
  --g2-decision "$BUNDLE/g2-decision.json" \
  --source-commit "$SOURCE_COMMIT" \
  --workflow-run-id LOCAL-SIMULATION \
  --output /tmp/status-snapshot.json \
  --require-signature
python3 scripts/validate_public_snapshot_firewall.py /tmp/status-snapshot.json
```

No uses `--require-signature` sin una clave de prueba disponible: el resultado correcto es fallo cerrado. El firewall debe rechazar `oneA=true`, `authority_verified=true`, `promotion=AUTHORIZED` y firmas ausentes o no base64.

Para reproducir los tests del repositorio:

```bash
python3 -m unittest discover -s tests -p 'test_*snapshot*.py' -v
```

La simulación local no publica en `main`, no activa staging y no convierte el resultado local en evidencia independiente.

## 8. Configurar el secreto de GitHub de forma segura

El secreto debe cargarse directamente en el environment protegido por el operador autorizado, no en el repositorio ni en el frontend:

```bash
gh secret set CASTUO_SNAPSHOT_SIGNING_KEY_B64 \
  --repo Traky12/castuo-e3-001 \
  --env public-snapshot \
  --body <base64-ed25519-private-key>
```

No pegues el valor en el chat, en un shell compartido, en un issue, en un log ni en un fichero versionado. Verifica sólo los metadatos:

```bash
gh secret list --repo Traky12/castuo-e3-001 --env public-snapshot
```

La salida debe mostrar el nombre del secreto, nunca su valor. Rota la clave si aparece en logs o en Git, revoca la anterior y registra el incidente sin copiar el material secreto.

## 9. Simular el workflow antes de GitHub

La simulación equivalente, sin publicar y sin usar `act`, es ejecutar en orden los mismos pasos del workflow:

```bash
python -m pip install --disable-pip-version-check cryptography
python3 scripts/validate_external_evidence_bundle.py "$BUNDLE" \
  --min-reviewers 2 \
  --output /tmp/external-evidence-validation.json
python3 scripts/evaluate_g2.py /tmp/external-evidence-validation.json \
  --output /tmp/g2-decision.json
python3 scripts/publish_public_snapshot.py \
  --validation /tmp/external-evidence-validation.json \
  --g2-decision /tmp/g2-decision.json \
  --source-commit "$SOURCE_COMMIT" \
  --workflow-run-id LOCAL-SIMULATION \
  --output /tmp/status-snapshot.json \
  --signing-key-b64 "$CASTUO_SNAPSHOT_SIGNING_KEY_B64" \
  --require-signature
python3 scripts/validate_public_snapshot_firewall.py /tmp/status-snapshot.json
```

`act` puede utilizarse como simulador opcional de GitHub Actions si está instalado, pero no debe recibir la clave real ni hacer push. El workflow actual requiere `workflow_dispatch`, `bundle_path`, `source_commit`, un environment protegido y permiso de escritura; por eso la reproducción manual de los comandos es el camino determinista y más seguro antes del dispatch.

## 10. Ejecutar el workflow real

Sólo después de que el bundle pase localmente y el secreto esté configurado:

```bash
gh workflow run public-snapshot.yml \
  --repo Traky12/castuo-e3-001 \
  -f bundle_path="$BUNDLE" \
  -f source_commit="$SOURCE_COMMIT"
gh run list --repo Traky12/castuo-e3-001 \
  --workflow public-snapshot.yml --limit 5
```

Aprueba el environment únicamente mediante el reviewer autorizado. El workflow valida el bundle, evalúa G2, firma el snapshot, ejecuta el firewall y sólo entonces hace commit a `main`. Cualquier fallo mantiene la ausencia del snapshot o deja la promoción bloqueada.

## 11. Verificar el primer snapshot

Tras una ejecución verde:

```bash
curl -fsS \
  https://raw.githubusercontent.com/Traky12/castuo-e3-001/main/public/status-snapshot.json \
  -o /tmp/status-snapshot-public.json
sha256sum /tmp/status-snapshot-public.json
python3 scripts/validate_public_snapshot_firewall.py /tmp/status-snapshot-public.json
```

Registra en el dossier el SHA-256 del archivo, el commit de publicación, el run ID, el `source_commit`, timestamp, URL y resultado del firewall. El snapshot puede estar firmado y mostrar G2 PASS, pero debe seguir declarando `oneA=false` y `promotion=BLOCKED`; la promoción requiere un AuthorityObject separado.
