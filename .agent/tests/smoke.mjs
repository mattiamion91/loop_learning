// Prova completa dei due stack con dipendenze e Chromium reali, in progetti temporanei.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = fs.mkdtempSync(path.join(ROOT, '.agent/tests/smoke-'));
const runtime = path.join(temporary, 'runtime');
fs.mkdirSync(runtime);
// Senza un package.json proprio, npm risalirebbe fino a .agent/package.json e installerebbe nel template.
fs.writeFileSync(path.join(runtime, 'package.json'), '{ "private": true }\n');
// Browser in una cartella temporanea (prova pulita), salvo che PLAYWRIGHT_BROWSERS_PATH indichi una cache da riusare.
const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(runtime, 'browsers') };

function command(executable, args, cwd) {
  const windows = process.platform === 'win32';
  const program = windows ? executable + ' ' + args.map((value) => `"${value}"`).join(' ') : executable;
  const result = spawnSync(program, windows ? [] : args, { cwd, env, shell: windows, encoding: 'utf8', timeout: 300_000, maxBuffer: 20e6 });
  if (result.error || result.status !== 0) throw new Error(`${executable} ${args.join(' ')}\n${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  console.log('Installazione delle dipendenze temporanee per la prova reale.');
  command('npm', ['install', '--no-audit', '--no-fund', '@playwright/test', 'vite', 'react', 'react-dom', '@vitejs/plugin-react'], runtime);
  command('npx', ['playwright', 'install', 'chromium'], runtime);
  for (const stack of ['static', 'modern']) {
    const cwd = path.join(temporary, stack);
    fs.mkdirSync(path.join(cwd, '.agent/tests/e2e'), { recursive: true });
    for (const file of ['loop.mjs', 'process-runner.mjs', 'test-md-reporter.mjs', 'package.json']) fs.copyFileSync(path.join(ROOT, '.agent', file), path.join(cwd, '.agent', file));
    fs.cpSync(path.join(ROOT, '.agent/skills'), path.join(cwd, '.agent/skills'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, '.gitignore'), path.join(cwd, '.gitignore'));
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(path.join(runtime, 'node_modules'), path.join(cwd, '.agent/node_modules'), linkType);
    fs.writeFileSync(path.join(cwd, 'README.md'), `---\nstack: ${stack}\n---\n# Prova reale ${stack}\n`);
    fs.writeFileSync(path.join(cwd, 'PLAN.md'), '## M1 — Contatore\n- [ ] Mostrare e incrementare il contatore\n');
    if (stack === 'static') {
      // Convenzioni della sottoskill static: assets/js, script classici con defer, niente import/export.
      fs.mkdirSync(path.join(cwd, 'assets/js'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'index.html'), '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Contatore</title><h1>Contatore</h1><button data-testid="incrementa">Incrementa</button><output data-testid="conteggio">0</output><script src="assets/js/app.js" defer></script></html>');
      fs.writeFileSync(path.join(cwd, 'assets/js/app.js'), "(function () { 'use strict'; let conteggio = 0; document.querySelector('button').addEventListener('click', () => { document.querySelector('output').textContent = String(++conteggio); }); })();");
      fs.writeFileSync(path.join(cwd, 'manifest.webmanifest'), '{"name":"Contatore"}');
      fs.writeFileSync(path.join(cwd, 'dati.csv'), 'valore\n1');
    } else {
      fs.symlinkSync(path.join(runtime, 'node_modules'), path.join(cwd, 'node_modules'), linkType);
      fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' } }));
      fs.writeFileSync(path.join(cwd, 'vite.config.js'), "import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({plugins:[react()]});");
      fs.writeFileSync(path.join(cwd, 'index.html'), '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Contatore</title><div id="root"></div><script type="module" src="/main.jsx"></script></html>');
      fs.writeFileSync(path.join(cwd, 'main.jsx'), "import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; function App(){const [n,setN]=useState(0);return <><h1>Contatore</h1><button data-testid='incrementa' onClick={()=>setN(n+1)}>Incrementa</button><output data-testid='conteggio'>{n}</output></>;} createRoot(document.getElementById('root')).render(<App/>);");
    }
    const loop = (...args) => command('node', ['.agent/loop.mjs', ...args], cwd);
    loop('approve');
    loop('next');
    loop('task', '1', 'inizia');
    loop('task', '1', 'fatta');
    loop('done');
    fs.writeFileSync(path.join(cwd, '.agent/tests/e2e/M1.spec.js'), `
import { test, expect } from '@playwright/test';
for (const width of [360, 1280]) {
  test('contatore a ' + width + ' pixel', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({width, height: 800});
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Contatore' })).toBeVisible();
    await page.getByRole('button', {name: 'Incrementa'}).click();
    await expect(page.getByTestId('conteggio')).toHaveText('1');
    expect(errors).toEqual([]);
  });
}
${stack === 'static' ? "test('asset pubblici', async ({request}) => { for (const file of ['/manifest.webmanifest', '/dati.csv']) expect((await request.get(file)).status()).toBe(200); });" : ''}
`);
    loop('done');
    console.log(loop('test').trim());
    console.log(loop('test').trim());
    const state = JSON.parse(fs.readFileSync(path.join(cwd, '.agent/state.json'), 'utf8'));
    assert.equal(state.status, 'done');
    const report = JSON.parse(fs.readFileSync(path.join(cwd, '.agent/logs/report.json'), 'utf8'));
    assert.equal(report.stats.unexpected, 0);
    assert.ok(report.stats.expected >= 2);
    // TEST.md: una riga per test, tutte passate, nessuna in lavorazione.
    const testMd = fs.readFileSync(path.join(cwd, 'TEST.md'), 'utf8');
    assert.match(testMd, /^## M1 — Contatore$/m);
    assert.equal((testMd.match(/^- \[✔\] /gmu) ?? []).length, report.stats.expected, testMd);
    assert.doesNotMatch(testMd, /^- \[(➤|✘| )\] /mu);
    console.log(`Stack ${stack} verificato con Chromium reale.`);
  }
} finally {
  const resolved = fs.realpathSync(temporary);
  assert.equal(path.dirname(resolved), fs.realpathSync(path.join(ROOT, '.agent/tests')));
  assert.ok(path.basename(resolved).startsWith('smoke-'));
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
}
