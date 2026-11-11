import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { createStaticServer } from '../skills/static/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLAN = '## M1 — Prima\n- [ ] Funzione A\n- [ ] Funzione B\n';

function fixture(t, plan = PLAN) {
  const cwd = fs.mkdtempSync(path.join(ROOT, '.agent/tests/fixture-'));
  t.after(() => {
    const absolute = fs.realpathSync(cwd);
    assert.equal(path.dirname(absolute), fs.realpathSync(path.join(ROOT, '.agent/tests')));
    assert.ok(path.basename(absolute).startsWith('fixture-'));
    fs.rmSync(absolute, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  });
  for (const dir of ['.agent/skills/static', '.agent/tests/e2e', '.agent/node_modules/@playwright/test', 'bin']) fs.mkdirSync(path.join(cwd, dir), { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(cwd, name), value);
  const read = (name) => fs.readFileSync(path.join(cwd, name), 'utf8');
  fs.copyFileSync(path.join(ROOT, '.agent/loop.mjs'), path.join(cwd, '.agent/loop.mjs'));
  fs.copyFileSync(path.join(ROOT, '.agent/process-runner.mjs'), path.join(cwd, '.agent/process-runner.mjs'));
  fs.copyFileSync(path.join(ROOT, '.gitignore'), path.join(cwd, '.gitignore'));
  write('README.md', '---\nstack: static\n---\n# Applicazione di prova\n');
  write('PLAN.md', plan);
  write('.agent/skills/static/SKILL.md', '# Static');
  write('bin/runner.cjs', "require('node:fs').appendFileSync('logs/invocazioni', 'test\\n'); process.exit(Number(process.env.LOOP_TEST_EXIT || 0));");
  write('bin/npx.cmd', '@node "%~dp0runner.cjs"\r\n');
  write('bin/npx', '#!/bin/sh\nexec node "$(dirname "$0")/runner.cjs"\n');
  fs.chmodSync(path.join(cwd, 'bin/npx'), 0o755);
  const env = { ...process.env };
  const key = Object.keys(env).find((name) => name.toLowerCase() === 'path');
  env[key] = path.join(cwd, 'bin') + path.delimiter + env[key];
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(git('init').status, 0);
  const cli = (...args) => {
    const result = spawnSync('node', [path.join(cwd, '.agent/loop.mjs'), ...args], { cwd, env, encoding: 'utf8', timeout: 60000 });
    assert.ifError(result.error);
    return { code: result.status, output: result.stdout + result.stderr };
  };
  const ok = (...args) => {
    const result = cli(...args);
    assert.equal(result.code, 0, result.output);
    return result;
  };
  const state = () => JSON.parse(read('.agent/state.json'));
  const readyForTests = () => {
    ok('approve');
    ok('task', '1', 'fatta');
    ok('task', '2', 'fatta');
    ok('done');
    write('.agent/tests/e2e/M1.spec.js', '// Test simulati dal runner della fixture.\n');
    ok('done');
    assert.equal(state().phase, 'test-run');
  };
  return { cwd, write, read, cli, ok, state, readyForTests, git, env };
}

test('tutti i comandi operativi rispettano il gate; status non scrive', (t) => {
  const f = fixture(t);
  f.ok('status');
  assert.equal(fs.existsSync(path.join(f.cwd, '.agent/state.json')), false);
  for (const args of [['next'], ['done'], ['test'], ['task', '1', 'fatta'], ['reset-attempts']]) {
    assert.equal(f.cli(...args).code, 2);
  }
  assert.equal(f.read('PLAN.md'), PLAN);
});

test('la ripresa di test-write richiede done e status lascia lo stato identico', (t) => {
  const f = fixture(t);
  f.ok('approve');
  f.ok('task', '1', 'fatta');
  f.ok('task', '2', 'fatta');
  f.ok('done');
  f.write('.agent/tests/e2e/M1.spec.js', '// Scrittura interrotta.');
  const before = f.read('.agent/state.json');
  f.ok('status');
  assert.equal(f.read('.agent/state.json'), before);
  f.ok('next');
  assert.equal(f.state().phase, 'test-write');
  f.ok('done');
  assert.equal(f.state().phase, 'test-run');
});

test('ID duplicati e milestone vuote vengono rifiutati prima di modificare file', (t) => {
  const f = fixture(t, '## M1 — Prima ✔\n- [✔] Finita\n## M1 — Seconda\n- [ ] Nuova\n');
  f.ok('approve');
  const before = f.read('PLAN.md');
  assert.equal(f.cli('task', '1', 'inizia').code, 2);
  assert.equal(f.read('PLAN.md'), before);
  f.write('PLAN.md', '## M1 — Vuota\n');
  assert.equal(f.cli('status').code, 2);
});

test('un simbolo interno al titolo non completa la milestone', (t) => {
  const f = fixture(t, '## M1 — Checklist ✔ accessibile\n- [ ] Da fare\n');
  f.ok('approve');
  f.ok('task', '1', 'inizia');
  assert.equal(f.state().milestone, 'M1');
  assert.match(f.read('PLAN.md'), /\[➤\]/);
});

test('una task fallita porta a fix anche con task aperte', (t) => {
  const f = fixture(t);
  f.ok('approve');
  f.ok('task', '1', 'errore');
  f.ok('done');
  assert.equal(f.state().phase, 'fix');
  assert.equal(f.state().attempt, 1);
});

test('commit fallito lascia la milestone aperta e consente la ripresa', (t) => {
  const f = fixture(t);
  f.readyForTests();
  f.write('.git/index.lock', 'Lock di prova');
  assert.equal(f.cli('test').code, 2);
  assert.doesNotMatch(f.read('PLAN.md').split('\n')[0], /✔$/);
  assert.equal(f.state().phase, 'test-run');
  fs.unlinkSync(path.join(f.cwd, '.git/index.lock'));
  f.ok('test');
  assert.match(f.read('PLAN.md').split('\n')[0], /✔$/);
  assert.equal(f.git('rev-parse', '--verify', 'HEAD').status, 0);
});

test('un crash nella fase commit riapre la verifica della stessa milestone', (t) => {
  const f = fixture(t);
  f.readyForTests();
  f.write('.agent/state.json', JSON.stringify({ ...f.state(), phase: 'commit' }));
  f.write('PLAN.md', f.read('PLAN.md').replace('## M1 — Prima', '## M1 — Prima ✔'));
  f.ok('next');
  assert.equal(f.state().phase, 'test-run');
  assert.doesNotMatch(f.read('PLAN.md').split('\n')[0], /✔$/);
});

test('FINITO vale per il contenuto verificato e test può sempre riverificarlo', (t) => {
  const f = fixture(t);
  f.readyForTests();
  f.ok('test');
  f.ok('test');
  assert.equal(f.state().status, 'done');
  const before = f.read('.agent/logs/invocazioni');
  f.ok('test');
  assert.notEqual(f.read('.agent/logs/invocazioni'), before);
  f.write('index.html', '<h1>Nuovo contenuto</h1>');
  f.ok('next');
  assert.equal(f.state().phase, 'verify');
  f.ok('test');
  assert.equal(f.state().status, 'done');
  const verified = f.state();
  f.write('.agent/state.json', JSON.stringify({ ...verified, verificato: 'M1' }));
  f.ok('next');
  assert.equal(f.state().phase, 'verify');
});

test('il lock blocca comandi esterni e ammette solo task del proprio agente', (t) => {
  const f = fixture(t);
  f.ok('approve');
  f.write('.agent/lock', `${process.pid}:prova`);
  assert.equal(f.cli('task', '1', 'inizia').code, 3);
  f.ok('status');
  f.env.LOOP_OWNER_PID = String(process.pid);
  f.ok('task', '1', 'inizia');
  assert.equal(f.cli('done').code, 3);
  fs.unlinkSync(path.join(f.cwd, '.agent/lock'));
  f.write('.agent/state.lock', `${process.pid}:prova`);
  assert.equal(f.cli('task', '1', 'fatta').code, 3);
});

test('un nuovo requisito riapre sviluppo e scrittura dei test', (t) => {
  const f = fixture(t);
  f.readyForTests();
  f.write('PLAN.md', f.read('PLAN.md') + '- [ ] Nuovo requisito\n');
  f.ok('next');
  assert.equal(f.state().phase, 'dev');
  assert.equal(f.read('PLAN.md').match(/\[ \]/g).length, 3);
  for (const n of ['1', '2', '3']) f.ok('task', n, 'fatta');
  f.ok('done');
  assert.equal(f.state().phase, 'test-write');
});

test('una nota in README.md non riapre le milestone completate né quella in corso', (t) => {
  const f = fixture(t, PLAN + '\n## M2 — Seconda\n- [ ] Funzione C\n');
  f.readyForTests();
  f.ok('test');
  assert.equal(f.state().milestone, 'M2');
  f.ok('task', '1', 'inizia');
  f.write('README.md', f.read('README.md') + '\n## Note tecniche\n- Nota dell\'agente: i dati stanno in localStorage.\n');
  f.ok('next');
  assert.equal(f.state().milestone, 'M2');
  assert.match(f.read('PLAN.md'), /^## M1 — Prima ✔$/m);
  assert.match(f.read('PLAN.md'), /^- \[➤\] Funzione C$/m);
});

test('modifiche durante i test invalidano il risultato senza consumare tentativi', (t) => {
  const f = fixture(t);
  f.readyForTests();
  f.write('bin/runner.cjs', "require('node:fs').writeFileSync('../index.html','Versione cambiata'); process.exit(0);");
  assert.equal(f.cli('test').code, 2);
  assert.equal(f.state().phase, 'test-run');
  assert.equal(f.state().attempt, 0);
  assert.doesNotMatch(f.read('PLAN.md').split('\n')[0], /✔$/);
});

test('un hook Git che modifica i file non può certificare una nuova versione', (t) => {
  const f = fixture(t);
  f.readyForTests();
  f.write('.git/hooks/pre-commit', '#!/bin/sh\necho cambiato > index.html\n');
  fs.chmodSync(path.join(f.cwd, '.git/hooks/pre-commit'), 0o755);
  assert.equal(f.cli('test').code, 2);
  assert.equal(f.state().phase, 'test-run');
  assert.doesNotMatch(f.read('PLAN.md').split('\n')[0], /✔$/);
});

test('la cancellazione di un file viene verificata e committata correttamente', (t) => {
  const f = fixture(t);
  f.write('obsoleto.txt', 'File da eliminare');
  assert.equal(f.git('add', '-A').status, 0);
  assert.equal(f.git('-c', 'user.name=prova', '-c', 'user.email=prova@local', 'commit', '-m', 'Stato iniziale').status, 0);
  fs.unlinkSync(path.join(f.cwd, 'obsoleto.txt'));
  f.readyForTests();
  f.ok('test');
  assert.match(f.read('PLAN.md').split('\n')[0], /✔$/);
});

test('i lock vuoti delle vecchie versioni si recuperano automaticamente', (t) => {
  const f = fixture(t);
  f.ok('approve');
  f.write('.agent/state.lock', '');
  f.write('.agent/lock', '');
  f.ok('task', '1', 'inizia');
  assert.match(f.read('PLAN.md'), /\[➤\]/);
});

test('la morte del loop termina il suo agente e permette una ripresa', async (t) => {
  const f = fixture(t);
  f.write('agente.cjs', "require('node:fs').writeFileSync('agente.pid', String(process.pid)); setInterval(() => {}, 1000);");
  f.write('.agent/harness.json', JSON.stringify({ active: 'prova', harnesses: { prova: { cmd: 'node', args: ['agente.cjs'] } } }));
  f.ok('approve');
  const child = spawn('node', ['.agent/loop.mjs', 'run'], { cwd: f.cwd, env: f.env, stdio: 'ignore' });
  const dead = once(child, 'exit');
  let agentPid;
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    for (let i = 0; i < 100 && !fs.existsSync(path.join(f.cwd, 'agente.pid')); i++) await new Promise((r) => setTimeout(r, 50));
    agentPid = Number(f.read('agente.pid'));
    child.kill();
    await dead;
    for (let i = 0; i < 100 && alive(agentPid); i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(alive(agentPid), false, 'Il processo agente deve terminare dopo la morte del loop');
    f.ok('next');
  } finally {
    if (child.exitCode === null) child.kill();
    if (agentPid && alive(agentPid)) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(agentPid), '/T', '/F']);
      else process.kill(agentPid, 'SIGKILL');
    }
  }
});

test('un ciclo orchestrato completa sviluppo, scrittura, test e verifica finale', (t) => {
  const f = fixture(t);
  f.write('harness.cjs', `
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const state = JSON.parse(fs.readFileSync('.agent/state.json', 'utf8'));
if (state.phase === 'dev') {
  for (const n of ['1', '2']) {
    for (const verb of ['inizia', 'fatta']) {
      const result = spawnSync('node', ['.agent/loop.mjs', 'task', n, verb], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
} else if (state.phase === 'test-write') {
  fs.writeFileSync('.agent/tests/e2e/M1.spec.js', '// Suite simulata');
} else process.exit(1);
`);
  f.write('.agent/harness.json', JSON.stringify({ active: 'prova', harnesses: { prova: { cmd: 'node', args: ['harness.cjs'] } } }));
  f.ok('approve');
  f.ok('run');
  assert.equal(f.state().status, 'done');
  assert.equal(f.read('.agent/logs/invocazioni').trim().split('\n').length, 2);
  assert.equal(fs.existsSync(path.join(f.cwd, '.agent/lock')), false);
  assert.equal(fs.existsSync(path.join(f.cwd, '.agent/state.lock')), false);
});

test('il server serve asset pubblici e nega file interni e link esterni', async (t) => {
  const f = fixture(t);
  f.write('index.html', '<h1>Pagina</h1>');
  f.write('.env', 'SEGRETO_FITTIZIO=prova');
  fs.mkdirSync(path.join(f.cwd, 'assets'));
  f.write('assets/dati.json', '{"valore":1}');
  f.write('assets/dati.csv', 'a,b\n1,2');
  f.write('manifest.webmanifest', '{"name":"Prova"}');
  f.write('assets/modulo.wasm', Buffer.from([0, 97, 115, 109]));
  const server = createStaticServer(f.cwd);
  const request = (url) => new Promise((resolve) => {
    const res = {
      writeHead(status) { this.status = status; },
      end(body) { resolve({ status: this.status, body: String(body) }); },
    };
    server.emit('request', { url }, res);
  });
  assert.equal((await request('/')).status, 200);
  assert.equal((await request('/assets/dati.json')).status, 200);
  for (const url of ['/assets/dati.csv', '/manifest.webmanifest', '/assets/modulo.wasm']) assert.equal((await request(url)).status, 200);
  for (const url of ['/.env', '/%2eenv', '/.git/config', '/.agent/loop.mjs', '/package.json', '/README.md', '/node_modules/a.js']) assert.equal((await request(url)).status, 403, url);
  assert.equal((await request('/%ZZ')).status, 400);
  const external = fixture(t);
  external.write('index.html', '<h1>File esterno</h1>');
  fs.symlinkSync(external.cwd, path.join(f.cwd, 'assets/esterno'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await request('/assets/esterno/index.html')).status, 403);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(url + '/', { signal: AbortSignal.timeout(3000) })).status, 200);
    assert.equal((await fetch(url + '/.env', { signal: AbortSignal.timeout(3000) })).status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
