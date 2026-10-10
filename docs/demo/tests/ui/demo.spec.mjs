// UI suite for the browser demo. The cryptographic equivalence with the CLI is proven by
// conformance.mjs and input-conformance.mjs; this suite checks what a person sees and does,
// that nothing leaves the page, and that the CSP holds with the real controls.
import { test, expect } from '@playwright/test';

const SCENARIOS = [
  ['Original', 'VERIFIED', 0],
  ['Cambiar una temperatura', 'FAILED', 1],
  ['Añadir un fichero', 'FAILED', 1],
  ['Borrar report.md', 'FAILED', 1],
  ['Falsificar una firma', 'FAILED', 1],
  ['Editar el manifiesto', 'FAILED', 1],
  ['Sin claves fijadas', 'VERIFIED', 0],
  ['Una clave sin fijar', 'FAILED', 1],
];

// Records everything that could reveal a defect or a leak: JS errors, failed requests,
// CSP violations and every request the page makes.
async function watch(page) {
  const w = { errors: [], failed: [], requests: [] };
  page.on('pageerror', (e) => w.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') w.errors.push(m.text()); });
  page.on('requestfailed', (r) => w.failed.push(r.url()));
  page.on('request', (r) => w.requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return w;
}

async function openVerify(page) {
  await page.goto('index.html');
  await expect(page.locator('#status')).toHaveText('VERIFIED');
}

async function noViolations(page, w) {
  expect(w.errors, 'JavaScript errors').toEqual([]);
  expect(w.failed, 'failed requests').toEqual([]);
  expect(await page.evaluate(() => window.__csp), 'CSP violations').toEqual([]);
}

test.describe('verify page', () => {
  test('loads and verifies the released example', async ({ page }) => {
    const w = await watch(page);
    await openVerify(page);
    await expect(page.locator('#exit')).toHaveText('exit 0');
    // Guided is the default: the exact verifier data stays behind the advanced switch.
    await expect(page.locator('#phases')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Guiado', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await noViolations(page, w);
  });

  for (const [name, status, exit] of SCENARIOS) {
    test(`scenario: ${name}`, async ({ page }) => {
      const w = await watch(page);
      await openVerify(page);
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#status')).toHaveText(status);
      await expect(page.locator('#exit')).toHaveText(`exit ${exit}`);
      await noViolations(page, w);
    });
  }

  test('editing the CSV is detected', async ({ page }) => {
    await openVerify(page);
    await page.locator('#csv').fill('timestamp,zone,temperature_c,humidity_pct\n2026-01-01T08:00:00Z,zone1,99.9,71\n');
    await page.getByRole('button', { name: 'Verificar ahora' }).click();
    await expect(page.locator('#status')).toHaveText('FAILED');
    await expect(page.locator('#findings')).toContainText('hash mismatch: data/readings.csv');
  });

  test('reset restores the initial state', async ({ page }) => {
    await openVerify(page);
    const original = await page.locator('#csv').inputValue();
    await page.getByRole('button', { name: 'Falsificar una firma', exact: true }).click();
    await expect(page.locator('#status')).toHaveText('FAILED');
    await page.locator('#csv').fill('edited');
    await page.getByRole('button', { name: 'Reiniciar sesión' }).click();
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    await expect(page.locator('#csv')).toHaveValue(original);
    await expect(page.getByRole('button', { name: 'Original', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('unreadable input is ERROR, never VERIFIED', () => {
  const cases = [
    ['manifest.json is not JSON', '**/bundles/valid/manifest.json', '{"format":', 'cannot read manifest.json'],
    ['manifest.json is an array', '**/bundles/valid/manifest.json', '[]', 'manifest.json must be a JSON object'],
    ['trusted keys are not an object', '**/bundles/trusted-keys.json', '["x"]', 'trusted keys must be a JSON object'],
  ];
  for (const [name, glob, body, finding] of cases) {
    test(name, async ({ page }) => {
      await page.route(glob, (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
      await page.goto('index.html');
      await expect(page.locator('#status')).toHaveText('ERROR');
      await expect(page.locator('#exit')).toHaveText('exit 2');
      await expect(page.locator('#findings')).toContainText(finding);
      await expect(page.locator('#phases')).toBeHidden();
      await expect(page.getByRole('button', { name: 'Verificar ahora' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Avanzado', exact: true })).toBeDisabled();
      await expect(page.locator('#status')).not.toHaveText('VERIFIED');
    });
  }

  test('unreadable signatures.json is a FAILED finding, as in the CLI', async ({ page }) => {
    await page.route('**/bundles/valid/signatures.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[{' }));
    await page.goto('index.html');
    await expect(page.locator('#status')).toHaveText('FAILED');
    await expect(page.locator('#findings')).toContainText('cannot read signatures.json');
  });
});

test.describe('create page', () => {
  test('keygen, manifest, sign, verify; edit after signing fails; reset clears', async ({ page, browserName }) => {
    const w = await watch(page);
    await page.goto('crear.html');
    await page.getByRole('button', { name: 'Generar clave Ed25519' }).click();
    await expect(page.locator('#pub')).not.toBeEmpty();
    await page.getByRole('button', { name: /crear manifest\.json/ }).click();
    await expect(page.locator('#mh')).toContainText('sha256:');
    await page.getByRole('button', { name: 'Firmar con Ed25519' }).click();
    await expect(page.locator('#sigs')).toContainText('signature_b64');
    await page.getByRole('button', { name: 'Verificar ahora' }).click();
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    await page.locator('#f1').fill('lote,humedad_pct\nA-01,99\n');
    await page.getByRole('button', { name: 'Verificar ahora' }).click();
    await expect(page.locator('#status')).toHaveText('FAILED');
    await expect(page.locator('#findings')).toContainText('hash mismatch: datos.csv');

    await page.getByRole('button', { name: 'Reiniciar sesión' }).click();
    await expect(page.locator('#keyBox')).toBeHidden();
    await expect(page.locator('#pub')).toBeEmpty();
    await expect(page.locator('#resBox')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Firmar con Ed25519' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Verificar ahora' })).toBeDisabled();
    await expect(page.locator('#f1')).toHaveValue('lote,humedad_pct\nA-01,64\nA-02,61\n');
    await noViolations(page, w);
    test.info().annotations.push({ type: 'engine', description: browserName });
  });
});

test.describe('privacy: nothing leaves the page', () => {
  test('verify page: only same-origin GETs at load, none during interaction', async ({ page, baseURL }) => {
    const w = await watch(page);
    await openVerify(page);
    const atLoad = w.requests.length;
    for (const [name] of SCENARIOS) await page.getByRole('button', { name, exact: true }).click();
    await page.locator('#csv').fill('secret-user-data-123');
    await page.getByRole('button', { name: 'Verificar ahora' }).click();
    await expect(page.locator('#status')).toHaveText('FAILED');
    await page.getByRole('button', { name: 'Reiniciar sesión' }).click();
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    await page.getByRole('button', { name: 'Avanzado', exact: true }).click();
    await expect(page.locator('#phases')).toBeVisible();
    await page.getByRole('button', { name: 'Guiado', exact: true }).click();
    const origin = new URL(baseURL).origin;
    for (const r of w.requests) {
      expect(new URL(r.url).origin, r.url).toBe(origin);
      expect(r.method, r.url).toBe('GET');
      expect(r.body, r.url).toBeFalsy();
    }
    expect(w.requests.slice(atLoad).map((r) => r.url), 'requests during interaction').toEqual([]);
  });

  test('create page: no request during keygen, sign and verify', async ({ page, baseURL }) => {
    const w = await watch(page);
    await page.goto('crear.html');
    await expect(page.getByRole('button', { name: 'Generar clave Ed25519' })).toBeEnabled();
    const atLoad = w.requests.length;
    await page.locator('#f1').fill('secret-user-data-456');
    await page.getByRole('button', { name: 'Generar clave Ed25519' }).click();
    await page.getByRole('button', { name: /crear manifest\.json/ }).click();
    await page.getByRole('button', { name: 'Firmar con Ed25519' }).click();
    await page.getByRole('button', { name: 'Verificar ahora' }).click();
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    const origin = new URL(baseURL).origin;
    for (const r of w.requests) expect(new URL(r.url).origin, r.url).toBe(origin);
    expect(w.requests.slice(atLoad).map((r) => r.url), 'requests during interaction').toEqual([]);
  });
});

test.describe('content security policy', () => {
  for (const file of ['index.html', 'crear.html', 'paquete.html']) {
    test(`${file}: inline script and inline style are blocked`, async ({ page }) => {
      await watch(page);
      await page.goto(file);
      await page.evaluate(() => {
        const s = document.createElement('script'); s.textContent = 'window.__inline = true'; document.body.append(s);
        const d = document.createElement('div'); d.setAttribute('style', 'color: rgb(255, 0, 0)'); d.id = 'injected'; d.textContent = 'x'; document.body.append(d);
      });
      expect(await page.evaluate(() => window.__inline)).toBeUndefined();
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('injected')).color)).not.toBe('rgb(255, 0, 0)');
      await expect.poll(() => page.evaluate(() => window.__csp.length)).toBeGreaterThan(0);
    });
  }
});

test.describe('keyboard and accessibility', () => {
  test('scenarios reachable and operable by keyboard, focus visible', async ({ page }) => {
    await openVerify(page);
    let found = false;
    for (let i = 0; i < 60 && !found; i++) {
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => document.activeElement && document.activeElement.textContent === 'Cambiar una temperatura');
    }
    expect(found, 'scenario button reached with Tab').toBe(true);
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    expect(outline).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.locator('#status')).toHaveText('FAILED');
  });

  test('result is announced in a live region', async ({ page }) => {
    await openVerify(page);
    await expect(page.locator('section.result')).toHaveAttribute('aria-live', 'polite');
  });
});

test.describe('advanced mode', () => {
  test('switch, deep link and back', async ({ page }) => {
    const w = await watch(page);
    await openVerify(page);
    await page.getByRole('button', { name: 'Avanzado', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Avanzado', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#phases')).toBeVisible();
    await expect(page).toHaveURL(/#avanzado$/);
    await page.getByRole('button', { name: 'Guiado', exact: true }).click();
    await expect(page.locator('#phases')).toBeHidden();
    await expect(page).not.toHaveURL(/#avanzado/);
    await page.goto('index.html#avanzado');
    await page.reload();
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    await expect(page.locator('#phases')).toBeVisible();
    await noViolations(page, w);
  });

  test('each signature answers four separate questions; threshold counted', async ({ page }) => {
    await page.goto('index.html#avanzado');
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    await page.getByRole('button', { name: 'Una clave sin fijar', exact: true }).click();
    await expect(page.locator('#status')).toHaveText('FAILED');
    const reviewer = page.locator('#sigs .sig', { hasText: 'example-reviewer' });
    await expect(reviewer).toContainText('Firma criptográfica: válida');
    await expect(reviewer).toContainText('Firmó este manifiesto: sí');
    await expect(reviewer).toContainText('Clave fijada por ti: no');
    await expect(reviewer).toContainText('Cuenta para el umbral: no');
    await expect(page.locator('#threshold')).toContainText('Cuentan 1 de 2 exigidas');
    await page.getByRole('button', { name: 'Sin claves fijadas', exact: true }).click();
    await expect(reviewer).toContainText('Clave fijada por ti: no comprobado');
    await expect(page.locator('#threshold')).toContainText('Cuentan 2 de 2 exigidas');
  });

  test('downloads the JSON report built in the page', async ({ page }) => {
    await page.goto('index.html#avanzado');
    await expect(page.locator('#status')).toHaveText('VERIFIED');
    await page.getByRole('button', { name: 'Cambiar una temperatura', exact: true }).click();
    await expect(page.locator('#status')).toHaveText('FAILED');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar e3bundle-report.json' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('e3bundle-report.json');
    const fs = await import('node:fs');
    const text = fs.readFileSync(await download.path(), 'utf-8');
    const report = JSON.parse(text);
    expect(report.status).toBe('FAILED');
    expect(report.findings).toContain('hash mismatch: data/readings.csv');
    expect(report.limitations).toMatch(/^Checks integrity of declared files/);
    expect(text.trimEnd()).toBe((await page.locator('#report').textContent()).trimEnd());
    expect(text).not.toMatch(/private|signature_b64|temperature_c/);
  });
});

test.describe('no horizontal overflow', () => {
  for (const width of [375, 768, 1440]) {
    for (const file of ['index.html', 'index.html#avanzado', 'crear.html', 'paquete.html', 'legal.html']) {
      test(`${file} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(file);
        await page.waitForLoadState('networkidle');
        if (file.startsWith('index')) await expect(page.locator('#status')).toHaveText('VERIFIED');
        const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        expect(sw, `scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw);
      });
    }
  }
});
