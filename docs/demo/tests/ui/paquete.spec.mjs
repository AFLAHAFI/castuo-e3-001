// Local bundle page (paquete.html): folders are built on disk, chosen through the real file
// input, verified in the page and, when E3_CLI is set, compared with `e3bundle verify` on the
// same folder (status, exit code, findings).
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SITE = process.env.E3_SITE || path.resolve(import.meta.dirname, '../../../../_site');
const BUNDLES = process.env.E3_BUNDLES || path.join(SITE, 'bundles');
const CLI = process.env.E3_CLI;
const PYTHON = process.env.E3_PYTHON || 'python';
const KEYS = path.join(BUNDLES, 'trusted-keys.json');

function fixture(name, build) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'e3pkg-')), name);
  fs.cpSync(path.join(BUNDLES, 'valid'), dir, { recursive: true });
  if (build) build(dir);
  return dir;
}

function cli(dir, min, keysFile) {
  const args = [CLI, 'verify', dir, '--min-signatures', String(min)];
  if (keysFile) args.push('--trusted-keys', keysFile);
  try { return { report: JSON.parse(execFileSync(PYTHON, args, { encoding: 'utf-8' })), code: 0 }; }
  catch (e) { return { report: JSON.parse(e.stdout), code: e.status }; }
}

// Choosing a folder through the file input once hung for 30 s in Firefox on CI (PR #59, run
// 37996253918; passed on rerun). Folder tests get more time and one retry; a retried pass is
// reported as "flaky" in the output, not hidden.
test.describe.configure({ timeout: 60_000, retries: process.env.CI ? 1 : 0 });

const norm = (f) => (f.startsWith('cannot read ') ? f.slice(0, f.indexOf(':')) : f);

async function choose(page, dir, { keys, pin, min = 2 } = {}) {
  await page.goto('paquete.html');
  await page.locator('#folder').setInputFiles(dir);
  if (keys) await page.locator('#keys').setInputFiles(keys);
  if (pin) {
    await page.getByLabel('Fijar solo las claves que marque').check();
    for (const s of pin) await page.getByRole('checkbox', { name: new RegExp('^' + s + ' ') }).check();
  }
  await page.locator('#min').fill(String(min));
}

async function verifyAndRead(page) {
  await page.getByRole('button', { name: 'Verificar paquete' }).click();
  await expect(page.locator('#resBox')).toBeVisible();
  const status = await page.locator('#status').textContent();
  const exit = Number((await page.locator('#exit').textContent()).replace('exit ', ''));
  const findings = (await page.locator('#findings li.bad').allTextContents()).map((t) => t.replace(/^- /, ''));
  return { status, exit, findings };
}

function sameAsCli(got, dir, min, keysFile) {
  if (!CLI) { test.info().annotations.push({ type: 'cli', description: 'E3_CLI not set: CLI comparison skipped' }); return; }
  const py = cli(dir, min, keysFile);
  expect(got.status, 'status vs CLI').toBe(py.report.status);
  expect(got.exit, 'exit vs CLI').toBe(py.code);
  expect(got.findings.map(norm), 'findings vs CLI').toEqual(py.report.findings.map(norm));
}

test.describe('local bundle: same result as the CLI', () => {
  test('valid bundle, both keys pinned → VERIFIED', async ({ page }) => {
    const dir = fixture('pkg');
    await choose(page, dir, { keys: KEYS, pin: ['example-runner', 'example-reviewer'] });
    const got = await verifyAndRead(page);
    expect(got.status).toBe('VERIFIED');
    sameAsCli(got, dir, 2, KEYS);
  });

  test('imported keys are not trusted until selected', async ({ page }) => {
    const dir = fixture('pkg');
    await choose(page, dir, { keys: KEYS });
    await expect(page.getByRole('checkbox', { name: /^example-runner / })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: /^example-runner / })).not.toBeChecked();
    const got = await verifyAndRead(page);
    expect(got.status).toBe('VERIFIED');
    await expect(page.locator('#summary')).toContainText('confianza no comprobada');
    sameAsCli(got, dir, 2, null);
  });

  test('only one key pinned → threshold not met', async ({ page }) => {
    const dir = fixture('pkg');
    await choose(page, dir, { keys: KEYS, pin: ['example-runner'] });
    const got = await verifyAndRead(page);
    expect(got.status).toBe('FAILED');
    const subset = path.join(path.dirname(dir), 'runner-only.json');
    fs.writeFileSync(subset, JSON.stringify({ 'example-runner': JSON.parse(fs.readFileSync(KEYS, 'utf-8'))['example-runner'] }));
    sameAsCli(got, dir, 2, subset);
  });

  const failing = [
    ['tampered file', (d) => fs.copyFileSync(path.join(BUNDLES, 'tampered', 'data', 'readings.csv'), path.join(d, 'data', 'readings.csv')), 'FAILED'],
    ['undeclared file', (d) => fs.writeFileSync(path.join(d, 'notes.txt'), 'added after signing\n'), 'FAILED'],
    ['missing declared file', (d) => fs.rmSync(path.join(d, 'report.md')), 'FAILED'],
    ['manifest not JSON', (d) => fs.writeFileSync(path.join(d, 'manifest.json'), '{"format":'), 'ERROR'],
    ['manifest with UTF-8 BOM', (d) => fs.writeFileSync(path.join(d, 'manifest.json'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(path.join(d, 'manifest.json'))])), 'ERROR'],
    ['manifest missing', (d) => fs.rmSync(path.join(d, 'manifest.json')), 'ERROR'],
    ['signatures not JSON', (d) => fs.writeFileSync(path.join(d, 'signatures.json'), '[{'), 'FAILED'],
    ['signatures missing', (d) => fs.rmSync(path.join(d, 'signatures.json')), 'FAILED'],
  ];
  for (const [name, build, status] of failing) {
    test(`${name} → ${status}`, async ({ page }) => {
      const dir = fixture('pkg', build);
      await choose(page, dir, { keys: KEYS, pin: ['example-runner', 'example-reviewer'] });
      const got = await verifyAndRead(page);
      expect(got.status).toBe(status);
      sameAsCli(got, dir, 2, KEYS);
    });
  }

  test('unreadable key file with pinning → ERROR, before the manifest', async ({ page }) => {
    const dir = fixture('pkg', (d) => fs.writeFileSync(path.join(d, 'manifest.json'), 'not json'));
    const bad = path.join(path.dirname(dir), 'bad-keys.json');
    fs.writeFileSync(bad, '["not", "an", "object"]');
    await choose(page, dir, { keys: bad });
    await page.getByLabel('Fijar solo las claves que marque').check();
    const got = await verifyAndRead(page);
    expect(got.status).toBe('ERROR');
    expect(got.findings[0]).toContain('trusted keys must be a JSON object');
    sameAsCli(got, dir, 2, bad);
  });
});

test.describe('local bundle: unsafe folders are not verified', () => {
  test('a path deeper than the limit blocks verification', async ({ page }) => {
    const dir = fixture('pkg', (d) => {
      const deep = path.join(d, ...Array(16).fill('d'));
      fs.mkdirSync(deep, { recursive: true });
      fs.writeFileSync(path.join(deep, 'x.txt'), 'x');
    });
    await page.goto('paquete.html');
    await page.locator('#folder').setInputFiles(dir);
    await expect(page.locator('#planProblem')).toContainText('no se ha verificado nada');
    await expect(page.locator('#plan')).toContainText('niveles');
    await expect(page.getByRole('button', { name: 'Verificar paquete' })).toBeDisabled();
    await expect(page.locator('#resBox')).toBeHidden();
  });

  test('a file over the per-file limit blocks verification without reading it', async ({ page }) => {
    const dir = fixture('pkg', (d) => fs.writeFileSync(path.join(d, 'big.bin'), Buffer.alloc(10 * 1024 * 1024 + 1)));
    await page.goto('paquete.html');
    await page.locator('#folder').setInputFiles(dir);
    await expect(page.locator('#plan')).toContainText('big.bin');
    await expect(page.getByRole('button', { name: 'Verificar paquete' })).toBeDisabled();
  });

  test('an invalid minimum is refused with an associated message', async ({ page }) => {
    const dir = fixture('pkg');
    await page.goto('paquete.html');
    await page.locator('#folder').setInputFiles(dir);
    await page.locator('#min').fill('-1');
    await expect(page.locator('#min')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#minError')).toContainText('número entero');
    await expect(page.getByRole('button', { name: 'Verificar paquete' })).toBeDisabled();
  });
});

test.describe('local bundle: privacy, download and reset', () => {
  test('no request while importing and verifying; report downloads; reset clears', async ({ page, baseURL }) => {
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    const dir = fixture('pkg', (d) => fs.writeFileSync(path.join(d, 'data', 'readings.csv'), 'secret-user-data-789\n'));
    await page.goto('paquete.html');
    await expect(page.getByRole('button', { name: 'Reiniciar sesión' })).toBeEnabled();
    const atLoad = requests.length;
    await page.locator('#folder').setInputFiles(dir);
    await page.locator('#keys').setInputFiles(KEYS);
    await page.getByLabel('Fijar solo las claves que marque').check();
    await page.getByRole('checkbox', { name: /^example-runner / }).check();
    await page.getByRole('checkbox', { name: /^example-reviewer / }).check();
    const got = await verifyAndRead(page);
    expect(got.findings).toContain('hash mismatch: data/readings.csv');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar e3bundle-report.json' }).click()]);
    const text = fs.readFileSync(await download.path(), 'utf-8');
    expect(JSON.parse(text).status).toBe('FAILED');
    expect(text).not.toContain('secret-user-data-789');
    const origin = new URL(baseURL).origin;
    expect(requests.slice(atLoad).filter((u) => !u.startsWith('blob:') && new URL(u).origin !== origin), 'cross-origin requests').toEqual([]);
    expect(requests.slice(atLoad).filter((u) => !u.startsWith('blob:')), 'requests during import').toEqual([]);

    await page.getByRole('button', { name: 'Reiniciar sesión' }).click();
    await expect(page.locator('#resBox')).toBeHidden();
    await expect(page.locator('#plan li')).toHaveCount(0);
    await expect(page.locator('#keyList li')).toHaveCount(0);
    await expect(page.getByLabel('No fijar claves: la confianza queda sin comprobar')).toBeChecked();
    await expect(page.getByRole('button', { name: 'Verificar paquete' })).toBeDisabled();
    expect(await page.locator('#folder').evaluate((i) => i.files.length)).toBe(0);
  });
});
