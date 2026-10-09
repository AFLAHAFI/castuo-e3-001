// Serves the assembled site (_site, as built by pages.yml) and runs the UI suite in three engines.
// E3_SITE: path of the assembled site. E3_BASE_URL: test an already deployed site instead.
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const site = process.env.E3_SITE || path.resolve(import.meta.dirname, '../../../../_site');
const external = process.env.E3_BASE_URL;
const port = 4173;

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // python -m http.server refuses connections under heavier parallel load on some hosts.
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: external || `http://127.0.0.1:${port}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: external ? undefined : {
    command: `python -m http.server ${port} --bind 127.0.0.1 --directory "${site}"`,
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
