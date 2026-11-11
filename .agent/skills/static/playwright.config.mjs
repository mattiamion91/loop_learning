import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Questo file sta in .agent/skills/static/: la radice del progetto è tre cartelle sopra.
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
    // server locale della sottoskill (server.mjs): serve la radice del progetto, senza cache e senza rete
    command: `node .agent/skills/static/server.mjs ${PORT}`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}`,
    // mai riusare un server già attivo: potrebbe essere di un altro progetto e dare risultati falsi
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
