import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Questo file sta in .agent/skills/modern/: la radice del progetto è tre cartelle sopra.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Porta scelta libera dal loop a ogni corsa (LOOP_TEST_PORT); 4173 se lanci Playwright a mano.
const PORT = Number(process.env.LOOP_TEST_PORT) || 4173;

export default defineConfig({
  testDir: path.join(ROOT, '.agent/tests/e2e'),
  outputDir: path.join(ROOT, '.agent/test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  // line: output leggibile · json: esiti letti dal loop · test-md-reporter: aggiorna TEST.md test per test
  reporter: [
    ['line'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? path.join(ROOT, '.agent/logs/report.json') }],
    [path.join(ROOT, '.agent/test-md-reporter.mjs')],
  ],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // testa sempre la build di produzione dell'app (package.json di Vite nella radice), così i test vedono l'ultimo codice
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
