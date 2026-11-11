// Custodisce il processo del passo anche quando il loop principale termina bruscamente.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

let child;
let lease;
let timer;
let monitor;
let stopped = false;
let failure;

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

function killTree() {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000, windowsHide: true });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gruppo già terminato */ }
  }
}

function stop(reason) {
  if (stopped) return;
  stopped = true;
  failure = reason;
  clearTimeout(timer);
  clearInterval(monitor);
  killTree();
  if (!child) process.exit(1);
  setTimeout(() => process.exit(1), 6000).unref();
}

function record(owner) {
  const temporary = lease + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify({ runnerPid: process.pid, childPid: child?.pid, ownerPid: owner.pid }));
  fs.renameSync(temporary, lease);
}

process.on('exit', () => {
  clearTimeout(timer);
  clearInterval(monitor);
  killTree();
  if (lease && !alive(child?.pid)) fs.rmSync(lease, { force: true });
});
process.on('disconnect', () => stop('Il processo principale è terminato.'));
process.on('SIGINT', () => stop('Passo interrotto.'));
process.on('SIGTERM', () => stop('Passo interrotto.'));
process.once('message', ({ command, cwd, env, input, timeout, owner, lease: filename }) => {
  lease = filename;
  fs.mkdirSync(path.dirname(lease), { recursive: true });
  record(owner);
  const ownerAlive = () => {
    try { return alive(owner.pid) && fs.readFileSync(owner.file, 'utf8') === owner.token; } catch { return false; }
  };
  if (!process.connected || !ownerAlive()) return stop('Il proprietario del passo non è più attivo.');
  // Il custode non ha una console: su Windows ogni programma da console (cmd, npm, node...) aprirebbe una finestra.
  // windowsHide la evita davvero (CREATE_NO_WINDOW) solo se nessun canale è ereditato: per questo l'output
  // passa da pipe e viene inoltrato qui. I sottoprocessi ereditano la stessa console invisibile.
  child = spawn(command, { shell: true, cwd, env, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  record(owner);
  child.stdin.on('error', () => {}); // Un comando può chiudere stdin prima di leggere il prompt.
  child.stdin.end(input);
  timer = setTimeout(() => stop('Timeout del passo.'), timeout);
  monitor = setInterval(() => { if (!ownerAlive()) stop('Il proprietario del passo non è più attivo.'); }, 250);
  child.on('error', (error) => { failure = error.message; });
  child.on('close', (code) => {
    clearTimeout(timer);
    clearInterval(monitor);
    stopped = true;
    const result = { code: failure ? 1 : code ?? 1, error: failure };
    if (process.connected) process.send(result, () => { process.disconnect(); });
  });
});
