#!/usr/bin/env node
// Loop agentico per costruire webapp: zero dipendenze, indipendente dall'harness, riprende dopo un crash.
//
// Si lancia dalla radice del progetto (funziona anche da altre cartelle: la radice è la cartella sopra .agent/).
//
//   node .agent/loop.mjs [--harness nome]            modalità orchestrata con riavvio automatico (supervisor)
//   node .agent/loop.mjs run [--harness nome]        modalità orchestrata senza supervisor
//   node .agent/loop.mjs next | done | test          modalità guidata dall'agente: qualsiasi agente che esegue comandi shell
//   node .agent/loop.mjs task <n> inizia|fatta|errore|blocca "motivo"  cambia lo stato della task n della milestone corrente in PLAN.md
//   node .agent/loop.mjs approve                     l'utente ha confermato README.md e PLAN.md: sblocca il loop
//   node .agent/loop.mjs status | reset-attempts
//
// Ciclo di ogni milestone: dev → test-write → test-run (→ fix, max 3). Quando tutte sono ✔ parte la verifica finale:
// si rilanciano tutti i test e, se qualcosa fallisce, il loop aggiunge al PLAN una milestone di correzione e riparte.
//
// Tutto ciò che serve al loop vive in .agent/ (Playwright, test e2e, log, stato): la radice resta del progetto.
//
// Limite di tempo: "tempo:" nel front-matter di README.md (default 2h), controllato prima di ogni passo.
//
// Exit code: 0 = milestone finite, 1 = errore, 2 = bloccato (serve una persona), 3 = un'altra istanza è attiva.
//
// Struttura del file:
//   1 configurazione · 2 testi · 3 utilità · 4 PLAN e stati delle task · 5 stato del loop · 6 progetto e sottoskill
//   7 conferma · 8 prompt · 9 test · 10 harness · 11 lock · 12 comandi · 13 avvio

import { spawn, spawnSync, fork } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

// =====================================================================
// 1. CONFIGURAZIONE (da qui si cambiano soglie e percorsi)
// =====================================================================
const AGENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(AGENT_DIR);
const A = (...p) => path.join(AGENT_DIR, ...p);
const STATE_FILE = A('state.json');
const LOCK_FILE = A('lock');
const COMMAND_LOCK_FILE = A('state.lock');
const APPROVED_FILE = A('approved');
const PROMPT_FILE = A('current-prompt.md');
const TIME_FILE = A('tempo.json'); // tempo di lavoro già usato dal loop su questo progetto
const DEFAULT_TIME_LIMIT = '2h';   // se README.md non indica "tempo:"
const SKILLS_DIR = '.agent/skills';
const TEST_SKILL = 'playwright-tests';
const STACKS = ['static', 'modern'];

const MAX_FIX_ATTEMPTS = 3;
const MAX_VERIFY_ROUNDS = 3; // milestone di correzione consecutive create dalla verifica finale prima di fermarsi
const STEP_TIMEOUT_MS = 20 * 60_000;
const TEST_TIMEOUT_MS = 10 * 60_000;
const INSTALL_TIMEOUT_MS = 30 * 60_000; // Chromium pesa circa 200 MB: su una rete lenta serve tempo
const RATE_LIMIT_WAIT_MS = 15 * 60_000;
const MAX_HARNESS_FAILS = 3;
const MAX_ENV_RETRIES = 3;
const ENV_RETRY_WAIT_MS = 10_000;
const MAX_CRASHES = 10;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;
const MAX_ERROR_CHARS = 6000;
const IS_WIN = process.platform === 'win32';
let ownedLockFile;

// Stati delle task in PLAN.md. Al massimo UNA task "in lavorazione" in tutto il PLAN.
const STATI = {
  todo: ' ',  // - [ ] da fare
  doing: '➤', // - [➤] in lavorazione
  done: '✔',  // - [✔] completata
  error: '✘', // - [✘] non completata o con errori
};
// Verbi del comando `task` → stato.
const VERBI_TASK = { inizia: 'doing', fatta: 'done', errore: 'error' };
// Simboli dei titoli delle milestone, gestiti solo dal loop.
const MS_OK = '✔';
const MS_BLOCCATA = '✘';
// Problemi d'ambiente: test falliti per colpa della macchina, non dell'app. Non consumano tentativi di correzione.
// `rimedio` (facoltativo) è un comando lanciato in .agent/ prima di riprovare.
const ENV_PROBLEMS = [
  { nome: 'porta occupata', re: /is already used, make sure that nothing is running on the port/i },
  { nome: 'browser di Playwright mancante', re: /Executable doesn't exist|Please run the following command to download new browsers/i, rimedio: 'npx playwright install chromium' },
  { nome: 'Playwright non installato', re: /Cannot find (module|package) '@playwright\/test'/i, rimedio: 'npm i -D @playwright/test' },
];
// Titolo delle milestone che il loop crea quando la verifica finale trova errori.
const FIX_MS_TITLE = 'Correzioni dalla verifica finale';

// =====================================================================
// 2. TESTI (tutto ciò che legge l'agente o l'utente, in un posto solo)
// =====================================================================
const T = {
  // --- prompt per l'agente ---
  promptIntro: 'Sei un passo di un loop automatico che costruisce una webapp. Lavora solo dentro questa cartella di progetto.',
  promptLeggi: 'Leggi prima: README.md (scopo del progetto), PLAN.md (memoria: cosa è fatto e cosa resta), AGENTS.md (regole).',
  promptSkill: (files) => `Sottoskill OBBLIGATORIE per questo progetto (leggile e seguile): ${files.join(', ')}.`,
  promptDesign: 'DESIGN.md esiste ed è la FONTE DI VERITÀ per tutta la grafica (colori, tipografia, spaziature, componenti, tono). Leggilo e seguilo alla lettera; se README.md dice altro sul design, vince DESIGN.md. Metti i suoi valori nei design token CSS.',
  promptMilestone: (m) => `Milestone corrente: ${m.id} — ${m.title}`,
  promptTask: 'Task di questa milestone (numero, stato attuale, testo):',
  promptRiprendi: (n) => `ATTENZIONE: la task ${n} è [${STATI.doing}]: un passo precedente si è interrotto mentre ci lavorava. Riprendi da lì.`,
  promptStati: 'Gli stati in PLAN.md li cambi SOLO con questi comandi, che scrivono subito su disco (non modificarli a mano):\n'
    + '  node .agent/loop.mjs task <n> inizia   prima di iniziare la task n (una sola task in lavorazione alla volta)\n'
    + '  node .agent/loop.mjs task <n> fatta    appena la task n è finita\n'
    + '  node .agent/loop.mjs task <n> errore   se non riesci a completarla\n'
    + '  node .agent/loop.mjs task <n> blocca "motivo"   se serve una decisione dell\'utente (es. cambiare una milestone già ✔): il loop si ferma subito',
  promptDev: 'PASSO: implementa SOLO questa milestone, una task alla volta e nell\'ordine. Per ogni task: "inizia", implementa, poi "fatta" (o "errore").\n'
    + 'Aggiungi data-testid agli elementi interattivi e alle regioni chiave, così i test possono trovarli. '
    + 'NON scrivere test e2e: è il passo successivo. Controlla che l\'app si carichi/compili senza errori. '
    + 'Alla fine nessuna task deve restare [ ] o [➤].',
  promptDevVerifica: (errore) => [
    'PASSO: questa milestone l\'ha creata il loop. A fine piano ha rilanciato TUTTI i test e alcuni test di milestone già completate falliscono. Output:',
    '```', errore ?? '(nessun output catturato)', '```',
    'Ogni task è un test che fallisce. Per ogni task: "inizia", trova la causa e correggi il codice dell\'APP, poi "fatta" (o "errore").',
    'Ripristina il comportamento promesso dalle milestone completate senza togliere quello delle successive. NON modificare i test. Il loop rilancerà tutta la suite.',
  ].join('\n'),
  promptTestWrite: (spec) => `PASSO: scrivi i test Playwright per questa milestone. Leggi e segui ${SKILLS_DIR}/${TEST_SKILL}/SKILL.md. Crea ${spec}. NON modificare il codice dell'app né gli stati in PLAN.md.`,
  promptFix: (id, spec, n, errore) => [
    `PASSO: correzione di ${id} (tentativo ${n} di ${MAX_FIX_ATTEMPTS}). Problema da risolvere:`,
    '```', errore ?? '(nessun output catturato)', '```',
    'Per ogni task coinvolta dall\'errore: "inizia", correggi, poi "fatta" (o "errore" se non ci riesci). Le task [✘] vanno riprese allo stesso modo.',
    `Trova la causa e correggi il codice dell'APP. Non indebolire, saltare o cancellare i test (modifica un test solo se contraddice le task qui sopra, e spiega il perché in un commento). Non lanciare tu i test: il loop rilancia ${spec}.`,
  ].join('\n'),
  promptRegole: 'Non iniziare altre milestone. Non lasciare server o processi in background. Fermati quando il passo è completo.',

  // --- cartelle non pronte ---
  nonPronto: (motivi) => `NON PRONTO: ${motivi.join('; ')}. Compilali prima con l'utente (vedi SKILL.md, "Nuovo progetto").`,
  readmeTemplate: 'README.md è ancora il template',
  planTemplate: 'PLAN.md è ancora il template',
  nonApprovato: 'NON APPROVATO: l\'utente non ha ancora confermato README.md e PLAN.md. Fagli rileggere i due file; quando dice di sì, lancia: node .agent/loop.mjs approve',
  approvato: 'README.md e PLAN.md approvati. Avvia con: node .agent/loop.mjs  (oppure, guidato dall\'agente: node .agent/loop.mjs next)',

  // --- comando task ---
  taskUso: 'Uso: node .agent/loop.mjs task <numero> inizia|fatta|errore   oppure   task <numero> blocca "motivo"',
  bloccaSenzaMotivo: 'Serve il motivo: node .agent/loop.mjs task <numero> blocca "motivo"',
  decisione: (id, n, testo, motivo) => `Serve una decisione dell'utente su ${id} task ${n} "${testo}": ${motivo}`,
  taskBloccata: (id, n) => `${id} task ${n} → [${STATI.error}]. Loop fermo: serve una decisione dell'utente. Non proseguire.`,
  taskFaseErrata: (s) => `Gli stati delle task si cambiano solo nelle fasi dev e fix (ora: status=${s.status}, fase=${s.phase}).`,
  taskInesistente: (m, n) => `La milestone ${m.id} non ha la task ${n} (ne ha ${m.tasks.length}).`,
  taskGiaInLavorazione: (t) => `C'è già una task in lavorazione: ${t.ms} task ${t.n} "${t.text}". Chiudila prima con "fatta" o "errore".`,
  taskOk: (id, n, stato) => `${id} task ${n} → [${STATI[stato]}] (scritto in PLAN.md)`,

  // --- controlli sul PLAN ---
  piuInLavorazione: (lista) => `PLAN.md ha più di una task [${STATI.doing}]: ${lista}. Ne è ammessa al massimo una: correggi PLAN.md a mano, poi rilancia.`,
  taskInErrore: (lista) => `Queste task sono [${STATI.error}] (non completate o con errori): ${lista}. Una milestone va ai test solo quando tutte le sue task sono [${STATI.done}]: riprendile e completale.`,
  testNonScritto: (spec) => `il passo test-write non ha creato ${spec}. Scrivi il file di test prima di proseguire.`,
  taskAperte: (m, lista) => `${m.id} non è completa: ${lista} sono ancora [ ] o [${STATI.doing}]. Chiudile con "fatta" o "errore" prima di proseguire.`,

  // --- messaggi del loop ---
  tuttoFinito: 'TUTTE LE MILESTONE COMPLETATE E VERIFICATE',
  bloccato: (id, decisione) => `BLOCCATO su ${id}.${decisione ? `\n${decisione}\n` : ' '}Intervieni a mano (correggi il codice o modifica PLAN.md), poi: node .agent/loop.mjs reset-attempts`,
  ambiente: (nome, riga) => `PROBLEMA D'AMBIENTE (${nome}): non è un bug dell'app, nessun tentativo di correzione consumato.\n  ${riga}\nRisolvilo e rilancia: node .agent/loop.mjs test`,
  tempoScaduto: (usato, limite) => `LIMITE DI TEMPO RAGGIUNTO: il loop ha lavorato ${usato} su un limite di ${limite}. Fermati: lo stato è salvato. Per continuare alza "tempo:" nel front-matter di README.md (es. tempo: 3h, oppure tempo: nessuno) e rilancia.`,
  tempoNonValido: (v) => `Valore di "tempo:" non valido in README.md: "${v}". Usa per esempio 2h, 90m, 1h30m, 1.5 oppure nessuno.`,
  gitAssente:'Git non è installato: il loop funziona lo stesso, ma senza un commit per ogni milestone. Per avere la cronologia installa Git (https://git-scm.com) e rilancia.',
  chromiumMancante: 'Chromium per Playwright non è ancora scaricato: lo scarico ora (circa 200 MB, una volta sola).',
  installazioneFallita: (cmd, out) => `PROBLEMA D'AMBIENTE: installazione non riuscita (${cmd}). Controlla la connessione a internet e rilancia lo stesso comando: riprende da qui, nessun tentativo di correzione consumato.\n${out}`,
  ambienteRimedio: (cmd) => `provo a risolverlo da solo: ${cmd}`,
  ambienteRiprova: (n, sec) => `riprovo i test tra ${sec}s (${n}/${MAX_ENV_RETRIES})`,
  ambienteStop: 'il problema d\'ambiente non si risolve: mi fermo.',
  verificaNome: 'verifica finale',
  verificaAvvio: 'verifica finale: rilancio tutti i test',
  verificaOk: 'verifica finale SUPERATA',
  verificaFallita: (id, n) => `verifica finale FALLITA (${n} test): creata la milestone ${id}`,
  verificaBloccata: `verifica finale ancora fallita dopo ${MAX_VERIFY_ROUNDS} milestone di correzione consecutive`,
  verificaTaskGenerica: 'Correggi gli errori della verifica finale (vedi l\'output nel prompt)',
  verificaTask: (nome) => `Correggi il test che fallisce: ${nome}`,
  commitVerifica: 'verifica finale superata',
  tuttaLaSuite: 'tutta la suite .agent/tests/e2e/',
  fase: (s) => `${s.milestone} fase=${s.phase}${s.phase === 'fix' ? ` tentativo=${s.attempt}` : ''}`,
  testRun: (s) => `test-run ${s.milestone} (correzioni usate: ${s.attempt}/${MAX_FIX_ATTEMPTS})`,
  testOk: (id) => `${id} SUPERATA`,
  testBloccata: (id) => `${id} BLOCCATA dopo ${MAX_FIX_ATTEMPTS} tentativi di correzione`,
  testFallita: (id) => `${id} FALLITA -> fix`,
  commit: (id) => `milestone ${id} completata`,
  fileTestMancante: (spec) => `Il file di test ${spec} non esiste.`,
  harnessFatale: (code) => `l'harness è uscito con ${code}, errore di configurazione che un nuovo tentativo non risolve: controlla .agent/harness.json`,
  rateLimit: 'limite d\'uso o errore temporaneo del provider: attendo 15 minuti, senza consumare tentativi',
  harnessKo: `lo stesso passo è fallito ${MAX_HARNESS_FAILS} volte di fila: mi fermo. Controlla i log in .agent/logs/, poi rilancia`,
  harnessRiprova: (code) => `l'harness è uscito con ${code}, riprovo lo stesso passo`,
  passoIncompleto: (msg) => `passo incompleto, lo ripeto: ${msg}`,
  altraIstanza: (pid) => `un'altra istanza è già attiva (pid ${pid})`,
  troppiCrash: 'troppi crash consecutivi, rinuncio',
  riavvio: (code, sec) => `il processo figlio è uscito con ${code}, riavvio tra ${sec}s (riprende da state.json)`,

  // --- modalità guidata dall'agente ---
  nextDone: 'FINITO: tutte le milestone sono completate. Fermati.',
  nextBloccato: (id, motivo) => `BLOCCATO su ${id}. Fermati e riferisci all'utente. Motivo:\n${motivo ?? ''}`,
  nextTest: 'PROSSIMA AZIONE: lancia esattamente questo comando e leggi l\'output:\n  node .agent/loop.mjs test',
  nextFine: '\n--- Quando questo passo è completo (e solo allora) lancia: node .agent/loop.mjs done\n--- Poi lancia: node .agent/loop.mjs next',
  doneNiente: (s) => `Niente da confermare (status=${s.status}, fase=${s.phase}). Lancia: node .agent/loop.mjs next`,
  doneOk: 'Passo registrato. Lancia: node .agent/loop.mjs next',
  doneFix: 'Ci sono task [✘]: la milestone non va ai test ma in correzione. Lancia: node .agent/loop.mjs next',
  testNonFase: (s) => `Non siamo nella fase di test (status=${s.status}, fase=${s.phase}). Lancia: node .agent/loop.mjs next`,
  esitoFinito: 'ESITO: SUPERATA. TUTTE LE MILESTONE COMPLETATE.',
  esitoBloccato: 'ESITO: BLOCCATA. Fermati e chiedi all\'utente.',
  esitoOk: 'ESITO: SUPERATA. Lancia: node .agent/loop.mjs next',
  esitoKo: 'ESITO: FALLITA. Lancia: node .agent/loop.mjs next',
  esitoVerificaKo: (id) => `ESITO: VERIFICA FINALE FALLITA. Creata la milestone ${id}. Lancia: node .agent/loop.mjs next`,
  resetNiente: 'Niente da resettare.',
  resetOk: (id, eraBloccato) => `${id} sbloccata; ${eraBloccato ? 'riprendi con: node .agent/loop.mjs' : 'stato resettato'}.`,
  comandoSconosciuto: 'Comando sconosciuto. Vedi l\'intestazione di loop.mjs.',

  // --- errori di configurazione ---
  planVuoto: 'PLAN.md non ha milestone. Usa titoli come "## M1 — Titolo".',
  stackMancante: `README.md richiede nel front-matter "stack: ${STACKS.join('" oppure "stack: ')}".`,
  skillMancante: (f) => `Sottoskill non trovata: ${f}. Crea il file o togli il nome da "skills:" nel front-matter di README.md.`,
  harnessSconosciuto: (n) => `Harness "${n}" sconosciuto. Modifica .agent/harness.json`,
};

// =====================================================================
// 3. UTILITÀ
// =====================================================================
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const cmd = args.find((a) => !a.startsWith('--') && a !== flag('--harness')) ?? 'supervise';

const log = (...m) => console.log(`[loop ${new Date().toISOString().slice(11, 19)}]`, ...m);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const specOf = (id) => `.agent/tests/e2e/${id}.spec.js`; // percorso dalla radice del progetto

// Scrittura atomica: chi legge il file vede sempre la versione vecchia o quella nuova, mai una a metà.
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, text);
    for (let attempt = 0; ; attempt++) {
      try { fs.renameSync(temporary, file); break; } catch (error) {
        // Su Windows un lettore o l'antivirus può trattenere brevemente il file.
        if (!IS_WIN || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 5) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
      }
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

// Errore che ferma il loop chiedendo l'intervento di una persona (exit 2, il supervisor non riavvia).
class StopError extends Error { exitCode = 2; }
// Test non eseguibili per un problema della macchina (porta, browser...): lo stato non cambia.
class EnvError extends StopError {}

// =====================================================================
// 4. PLAN.md (la memoria del progetto: cosa è fatto e cosa resta)
// =====================================================================
const SIMBOLO_A_STATO = { ' ': 'todo', '➤': 'doing', '✔': 'done', '✘': 'error', x: 'done', X: 'done' };
const RE_TASK = /^(\s*- \[)( |➤|✔|✘|x|X)(\]\s+)(.*)$/u;
const RE_MS_MARK = new RegExp(`\\s*(${MS_OK}|${MS_BLOCCATA})\\s*$`, 'u');

function readPlan() {
  const lines = read('PLAN.md').split(/\r?\n/);
  const ms = [];
  let cur = null;
  lines.forEach((l, i) => {
    const h = l.match(/^##\s+(M\d+)\s*[—–-]\s*(.+?)\s*$/);
    if (h) {
      if (ms.some((m) => m.id === h[1])) throw new StopError(`ID duplicato in PLAN.md: ${h[1]}. Assegna un ID unico a ogni milestone.`);
      const mark = h[2].match(RE_MS_MARK)?.[1];
      cur = { id: h[1], title: h[2].replace(RE_MS_MARK, ''), line: i, done: mark === MS_OK, blocked: mark === MS_BLOCCATA, tasks: [] };
      ms.push(cur);
    } else if (/^##\s/.test(l)) cur = null;
    else if (cur) {
      const t = l.match(RE_TASK);
      if (t) cur.tasks.push({ i, n: cur.tasks.length + 1, ms: cur.id, state: SIMBOLO_A_STATO[t[2]], text: t[4] });
    }
  });
  if (!ms.length) throw new Error(T.planVuoto);
  if (ms.some((m) => !m.tasks.length)) throw new StopError('Ogni milestone deve contenere almeno una task.');
  return { lines, ms };
}
const writePlan = (lines) => writeAtomic(path.join(ROOT, 'PLAN.md'), lines.join('\n'));
const setTaskLine = (lines, t, stato) => { lines[t.i] = lines[t.i].replace(RE_TASK, `$1${STATI[stato]}$3$4`); };
const tasksIn = (ms, stati) => ms.flatMap((m) => m.tasks).filter((t) => stati.includes(t.state));
const elenco = (tasks) => tasks.map((t) => `${t.ms} task ${t.n}`).join(', ');

// Invariante: al massimo una task in lavorazione in tutto il PLAN.
function checkPlan(ms) {
  const doing = tasksIn(ms, ['doing']);
  if (doing.length > 1) throw new StopError(T.piuInLavorazione(elenco(doing)));
}
// Una milestone è pronta per i test quando nessuna task è da fare o in lavorazione.
function openTasks(m) {
  const aperte = m.tasks.filter((t) => t.state === 'todo' || t.state === 'doing');
  return aperte.length ? T.taskAperte(m, elenco(aperte)) : null;
}
function setTask(id, n, stato) {
  const { lines, ms } = readPlan();
  const m = ms.find((x) => x.id === id);
  const t = m.tasks[n - 1];
  if (!t) throw new Error(T.taskInesistente(m, n));
  if (stato === 'doing') {
    const altra = tasksIn(ms, ['doing']).find((x) => x !== t);
    if (altra) throw new Error(T.taskGiaInLavorazione(altra));
  }
  setTaskLine(lines, t, stato);
  writePlan(lines);
}
function markMilestone(id, symbol) {
  const { lines, ms } = readPlan();
  const m = ms.find((x) => x.id === id);
  lines[m.line] = lines[m.line].replace(RE_MS_MARK, '') + (symbol ? ` ${symbol}` : '');
  if (symbol === MS_BLOCCATA) m.tasks.filter((t) => t.state === 'doing').forEach((t) => setTaskLine(lines, t, 'error'));
  writePlan(lines);
}

function reopenErrorTasks(id) {
  const { lines, ms } = readPlan();
  ms.find((x) => x.id === id).tasks.filter((t) => t.state === 'error').forEach((t) => setTaskLine(lines, t, 'todo'));
  writePlan(lines);
}

// --- milestone di correzione create dalla verifica finale ---
const isFixMs = (m) => m.title.startsWith(FIX_MS_TITLE);
// Quante milestone di correzione ci sono di fila in fondo al PLAN (i tentativi della verifica finale).
function trailingFixMs(ms) {
  let n = 0;
  for (let i = ms.length - 1; i >= 0 && isFixMs(ms[i]); i--) n++;
  return n;
}
// Aggiunge in fondo al PLAN una milestone con una task per ogni test fallito; restituisce il suo id.
function addFixMilestone(failures) {
  const { lines, ms } = readPlan();
  const id = `M${Math.max(...ms.map((m) => Number(m.id.slice(1)))) + 1}`;
  const tasks = failures.length ? failures.map(T.verificaTask) : [T.verificaTaskGenerica];
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push('', `## ${id} — ${FIX_MS_TITLE}`, ...tasks.map((t) => `- [${STATI.todo}] ${t}`), '');
  writePlan(lines);
  return id;
}

// =====================================================================
// 5. STATO DEL LOOP (scritto in modo atomico, sempre PRIMA del passo che descrive)
// =====================================================================
function saveState(s) {
  s.updatedAt = new Date().toISOString();
  writeAtomic(STATE_FILE, JSON.stringify(s, null, 2));
  return s;
}
function loadState(persist = true) {
  const finish = persist ? saveState : (value) => value;
  let s = null;
  try { s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { /* primo avvio o file corrotto: si ricostruisce dal PLAN */ }
  // Se il processo è caduto durante il commit, si ripete la verifica prima di avanzare.
  if (s?.phase === 'commit') {
    if (persist) markMilestone(s.milestone, null);
    return finish({ ...s, phase: 'test-run' });
  }
  const { ms } = readPlan();
  checkPlan(ms);
  const completed = { ...(s?.completed ?? {}) };
  // Impronte salvate da una versione precedente del loop (calcolate anche sul README): si aggiornano senza riaprire nulla.
  for (const m of ms) if (m.done && completed[m.id] && !isCurrentRequirements(completed[m.id])) completed[m.id] = requirementsOf(m);
  const changed = ms.filter((m) => m.done && completed[m.id] && completed[m.id] !== requirementsOf(m));
  if (changed.length) {
    const plan = readPlan();
    for (const m of changed) {
      plan.lines[m.line] = plan.lines[m.line].replace(RE_MS_MARK, '');
      m.tasks.forEach((t) => setTaskLine(plan.lines, t, 'todo'));
      m.done = false;
    }
    if (persist) writePlan(plan.lines);
  }
  const incomplete = ms.find((m) => m.done && m.tasks.some((t) => t.state !== 'done'));
  if (incomplete) throw new StopError(`${incomplete.id} è marcata ✔ ma contiene task aperte. Rimuovi il segno dal titolo per riaprire la milestone.`);
  const verificato = s?.verificato ?? null; // milestone coperte dall'ultima verifica finale superata
  const open = ms.find((m) => !m.done);
  if (!open) {
    // Tutte ✔: il progetto è finito solo se la verifica finale ha già coperto esattamente queste milestone.
    if (verificato?.ids === idsOf(ms) && verificato.digest === projectDigest()) return finish({ status: 'done', milestone: null, phase: null, attempt: 0, verificato, completed });
    if (s?.phase === 'verify' && s.status === 'blocked') return finish(s);
    return finish({ status: 'running', milestone: null, phase: 'verify', attempt: 0, verificato, completed });
  }
  if (!s || s.milestone !== open.id || s.status === 'done') s = { status: 'running', milestone: open.id, phase: 'dev', attempt: 0, verificato, completed };
  const requirements = requirementsOf(open);
  if (s.requirements && isCurrentRequirements(s.requirements) && s.requirements !== requirements && s.status !== 'blocked') {
    if (persist) {
      const plan = readPlan();
      plan.ms.find((m) => m.id === open.id).tasks.forEach((t) => setTaskLine(plan.lines, t, 'todo'));
      writePlan(plan.lines);
    }
    s = { ...s, phase: 'dev', attempt: 0, verificato: null, lastError: 'I requisiti sono cambiati. Riesamina le task e aggiorna i test della milestone.' };
  }
  if (!s.requirements && ['test-write', 'test-run'].includes(s.phase)) s.phase = 'dev';
  s.requirements = requirements;
  if (open.blocked && s.status !== 'blocked') s.status = 'blocked';
  return finish(s);
}
const idsOf = (ms) => ms.map((m) => m.id).join(',');
// Impronta dei requisiti di una milestone: se cambia, la milestone si riapre.
// Contiene solo ciò che la definisce (titolo e task in PLAN.md) e DESIGN.md. README.md resta fuori: l'agente
// ci scrive note durante il lavoro, e una nota non deve riaprire le milestone già completate.
const REQUIREMENTS_VERSION = 'v2:';
const isCurrentRequirements = (h) => typeof h === 'string' && h.startsWith(REQUIREMENTS_VERSION);
const requirementsOf = (m) => REQUIREMENTS_VERSION + createHash('sha256').update(JSON.stringify({
  id: m.id, title: m.title, tasks: m.tasks.map((t) => t.text),
  design: exists('DESIGN.md') ? read('DESIGN.md') : null,
})).digest('hex');
// Elenco dei file del progetto quando Git non c'è: stesse esclusioni del .gitignore del template.
const DIR_ESCLUSE = new Set(['.git', 'node_modules', 'dist', 'test-results', 'playwright-report']);
function listProjectFiles(rel = '') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const file = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) { if (!DIR_ESCLUSE.has(entry.name)) files.push(...listProjectFiles(file)); }
    else if (!/^\.env($|\.)/.test(entry.name) || entry.name === '.env.example') files.push(file);
  }
  return files;
}
function projectDigest() {
  const files = useGit() ? git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean) : listProjectFiles();
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    // TEST.md lo riscrive il reporter durante i test: è un esito, non un requisito, e non entra nell'impronta.
    if (/^(TEST\.md|\.agent\/(state\.json|state\.lock|lock|approved|current-prompt\.md|tempo\.json))$|^\.agent\/(logs|processes)\//.test(file) || file.endsWith('.tmp')) continue;
    const absolute = path.join(ROOT, file);
    if (!fs.existsSync(absolute)) continue;
    hash.update(file + '\0');
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) hash.update(fs.readlinkSync(absolute));
    else if (stat.isFile()) {
      let content = fs.readFileSync(absolute);
      // I segni di avanzamento cambiano durante il commit senza modificare i requisiti testati.
      if (file === 'PLAN.md') content = content.toString('utf8').split(/\r?\n/).map((line) => {
        if (/^##\s+M\d+\s*[—–-]/.test(line)) return line.replace(RE_MS_MARK, '');
        return line.replace(RE_TASK, '$1 $3$4');
      }).join('\n');
      // Il limite di tempo non cambia ciò che è stato verificato.
      if (file === 'README.md') content = content.toString('utf8').replace(/^tempo:.*$/m, '');
      hash.update(content);
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}
const verification = (ms, digest) => ({ ids: idsOf(ms), digest });
function assertUnchanged(digest) {
  if (projectDigest() !== digest) throw new StopError('I file sono cambiati durante la verifica. Nessun risultato viene certificato. Riprendi con next e ripeti i test.');
}
const currentMilestone = (s) => readPlan().ms.find((x) => x.id === s.milestone);
// Fase successiva a un passo completato: si scrivono i test se mancano, poi si lanciano.
// Una milestone di correzione non scrive test nuovi: si rilancia direttamente tutta la suite.
function advance(s) {
  const scriviTest = !isFixMs(currentMilestone(s)) && (s.phase === 'dev' || (s.phase === 'fix' && !exists(specOf(s.milestone))));
  return saveState({ ...s, phase: scriviTest ? 'test-write' : 'test-run' });
}
// Controlla che il passo abbia prodotto ciò che deve, prima di avanzare.
// Restituisce il motivo se è incompleto, altrimenti null.
function stepIncomplete(s) {
  if (s.phase === 'dev' || s.phase === 'fix') {
    const milestone = currentMilestone(s);
    return milestone.tasks.some((t) => t.state === 'error') ? null : openTasks(milestone);
  }
  if (s.phase === 'test-write' && !exists(specOf(s.milestone))) return T.testNonScritto(specOf(s.milestone)); // file di test creato
  return null;
}

// =====================================================================
// 6. PROGETTO E SOTTOSKILL (dal front-matter di README.md)
// =====================================================================
const skillFile = (name) => `${SKILLS_DIR}/${name}/SKILL.md`;
function project() {
  const fm = read('README.md').match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const field = (k) => fm && fm[1].match(new RegExp(`^${k}:[ \\t]*([^#\\r\\n]*)`, 'm'))?.[1].trim();
  const stack = field('stack');
  if (!STACKS.includes(stack)) throw new Error(T.stackMancante);
  const extra = (field('skills') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const skills = [stack, ...extra];
  for (const s of skills) if (!exists(skillFile(s))) throw new Error(T.skillMancante(skillFile(s)));
  const tempo = field('tempo') || DEFAULT_TIME_LIMIT;
  return { stack, skills, tempo, limiteMs: parseDuration(tempo) };
}

// --- Limite di tempo (front-matter "tempo:" di README.md, default 2h) ---
// Conta il tempo di lavoro dei passi (agente e test) su tutto il progetto, anche tra un avvio e l'altro.
// Si controlla prima di ogni passo: un passo già avviato non viene interrotto.
function parseDuration(value) {
  const v = value.toLowerCase().replace(/\s+/g, '');
  if (['nessuno', 'illimitato', '0'].includes(v)) return Infinity;
  const m = v.match(/^(?:(\d+(?:[.,]\d+)?)h)?(?:(\d+)m(?:in)?)?$/) ?? [];
  const ore = v.match(/^\d+(?:[.,]\d+)?$/) ? Number(v.replace(',', '.')) : Number((m[1] ?? '0').replace(',', '.'));
  const minuti = Number(m[2] ?? 0);
  const ms = (ore * 60 + minuti) * 60_000;
  if (!(ms > 0)) throw new StopError(T.tempoNonValido(value));
  return ms;
}
const formatDuration = (ms) => (ms === Infinity ? 'nessun limite' : `${Math.floor(ms / 3_600_000)}h ${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}m`);
function readTime() {
  try { return { usatoMs: 0, ...JSON.parse(fs.readFileSync(TIME_FILE, 'utf8')) }; } catch { return { usatoMs: 0 }; }
}
const writeTime = (t) => writeAtomic(TIME_FILE, JSON.stringify(t, null, 2));
const addTime = (ms) => { const t = readTime(); writeTime({ ...t, usatoMs: t.usatoMs + Math.max(0, ms) }); };
// Restituisce il messaggio di stop se il limite è stato raggiunto, altrimenti null.
function timeLimitReached() {
  const { tempo, limiteMs } = project();
  const { usatoMs } = readTime();
  return usatoMs >= limiteMs ? T.tempoScaduto(formatDuration(usatoMs), tempo) : null;
}
// Misura la durata di un passo e la aggiunge al tempo usato, anche se il passo fallisce.
async function timed(fn) {
  const t0 = Date.now();
  try { return await fn(); } finally { addTime(Date.now() - t0); }
}

// =====================================================================
// 7. CONFERMA: README e PLAN devono essere compilati e approvati dall'utente
// =====================================================================
function readiness() {
  const readme = read('README.md');
  const plan = read('PLAN.md');
  const motivi = [];
  if (/^#\s+Nome progetto\s*$/m.test(readme) || readme.includes('Una frase: che cosa fa')) motivi.push(T.readmeTemplate);
  if (plan.includes('Descrivi qui il comportamento')) motivi.push(T.planTemplate);
  if (motivi.length) return T.nonPronto(motivi);
  if (!fs.existsSync(APPROVED_FILE)) return T.nonApprovato;
  return null;
}
function gate() {
  const r = readiness();
  if (r) { console.log(r); return false; }
  return true;
}

// =====================================================================
// 8. PROMPT (testo semplice, autosufficiente, senza dettagli di modello o vendor)
// =====================================================================
function promptFor(s) {
  const m = currentMilestone(s);
  const ripresa = m.tasks.find((t) => t.state === 'doing');
  const head = [
    T.promptIntro,
    T.promptLeggi,
    T.promptSkill(project().skills.map(skillFile)),
    ...(exists('DESIGN.md') ? [T.promptDesign] : []),
    '',
    T.promptMilestone(m),
    T.promptTask,
    ...m.tasks.map((t) => `${t.n}. [${STATI[t.state]}] ${t.text}`),
    ...(ripresa ? [T.promptRiprendi(ripresa.n)] : []),
    '',
  ];
  const fixMs = isFixMs(m);
  const body = {
    dev: [fixMs ? T.promptDevVerifica(s.lastError) : T.promptDev, T.promptStati],
    'test-write': [T.promptTestWrite(specOf(m.id))],
    fix: [T.promptFix(m.id, fixMs ? T.tuttaLaSuite : specOf(m.id), s.attempt, s.lastError), T.promptStati],
  }[s.phase];
  return body ? [...head, ...body, T.promptRegole].join('\n') : '';
}

// =====================================================================
// 9. TEST: l'exit code di Playwright è l'unico giudice
// =====================================================================
// Playwright si installa in .agent/ (package.json e node_modules del loop), non nella radice del progetto.
async function bootstrap() {
  project(); // verifica stack e sottoskill prima di installare qualcosa
  if (!hasGit()) log(T.gitAssente);
  else if (!exists('.git')) { log('git init'); git(['init']); }
  if (!fs.existsSync(A('node_modules', '@playwright', 'test'))) {
    log('installo Playwright in .agent/');
    await install('npm i -D @playwright/test');
  }
  if (!chromiumPresente()) {
    log(T.chromiumMancante);
    await install('npx playwright install chromium');
  }
}
async function install(command) {
  const result = await runProcess({ command, cwd: AGENT_DIR, timeout: INSTALL_TIMEOUT_MS, tag: 'installazione', stream: true });
  if (result.code !== 0) throw new EnvError(T.installazioneFallita(command, result.out));
}
// Cartella dei browser di Playwright: PLAYWRIGHT_BROWSERS_PATH oppure la cache standard del sistema.
function browsersDir() {
  const custom = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (custom === '0') return A('node_modules', 'playwright-core', '.local-browsers');
  if (custom) return path.resolve(AGENT_DIR, custom);
  if (IS_WIN) return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'ms-playwright');
}
// Il Chromium richiesto dalla versione di Playwright installata è già scaricato per intero?
function chromiumPresente() {
  let browsers;
  try { ({ browsers } = JSON.parse(fs.readFileSync(A('node_modules', 'playwright-core', 'browsers.json'), 'utf8'))); } catch { return true; } // formato sconosciuto: ci pensa il controllo d'ambiente dopo i test
  return browsers
    .filter((b) => b.name === 'chromium' || b.name === 'chromium-headless-shell')
    .every((b) => fs.existsSync(path.join(browsersDir(), `${b.name.replace(/-/g, '_')}-${b.revision}`, 'INSTALLATION_COMPLETE')));
}
// Lancia Playwright: solo il test di una milestone (spec) oppure tutta la suite (spec = null).
// Il config sta nella sottoskill dello stack (.agent/skills/<stack>/playwright.config.mjs).
const REPORT_FILE = A('logs', 'report.json');
async function runTests(spec, tag) {
  if (spec && !exists(spec)) return { ok: false, out: T.fileTestMancante(spec), failures: [] };
  const config = path.join('skills', project().stack, 'playwright.config.mjs');
  const filtro = spec ? path.relative(AGENT_DIR, path.join(ROOT, spec)).split(path.sep).join('/') : '';
  fs.mkdirSync(A('logs'), { recursive: true });
  fs.rmSync(REPORT_FILE, { force: true });
  const digest = projectDigest();
  // I reporter sono nel config dello stack: "line" per l'output, "json" su REPORT_FILE per sapere quali test
  // falliscono, test-md-reporter per aggiornare TEST.md test per test.
  // Ogni corsa ha una porta libera tutta sua: il server della corsa precedente può ancora essere in chiusura.
  const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: REPORT_FILE, PLAYWRIGHT_JSON_OUTPUT_NAME: REPORT_FILE, LOOP_TEST_PORT: String(await freePort()) };
  const r = await runProcess({ command: `npx playwright test ${filtro} --config ${config}`, cwd: AGENT_DIR, env, timeout: TEST_TIMEOUT_MS, tag: `${tag}-test` });
  const out = r.out.trim();
  assertUnchanged(digest);
  if (r.code !== 0) await checkEnvironment(out);
  return { ok: r.code === 0, out: out.length > MAX_ERROR_CHARS ? '...' + out.slice(-MAX_ERROR_CHARS) : out, failures: failedTests(), digest };
}
// Porta TCP libera scelta dal sistema operativo, passata al config di Playwright come LOOP_TEST_PORT.
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
// Se i test sono falliti per un problema d'ambiente, prova il rimedio e lancia EnvError (lo stato non cambia).
async function checkEnvironment(out) {
  const p = ENV_PROBLEMS.find((x) => x.re.test(out));
  if (!p) return;
  const riga = out.split(/\r?\n/).find((l) => p.re.test(l))?.trim() ?? '';
  if (p.rimedio) { log(T.ambienteRimedio(p.rimedio)); await install(p.rimedio); }
  throw new EnvError(T.ambiente(p.nome, riga));
}
// Nomi dei test falliti ("M2.spec.js › titolo"), letti dal report JSON di Playwright.
function failedTests() {
  let report;
  try { report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')); } catch { return []; }
  const nomi = new Set();
  const visita = (suite) => {
    (suite.specs ?? []).filter((sp) => sp.ok === false).forEach((sp) => nomi.add(`${sp.file} › ${sp.title}`));
    (suite.suites ?? []).forEach(visita);
  };
  (report.suites ?? []).forEach(visita);
  return [...nomi];
}
// --- Git è facoltativo ---
// Senza Git il loop funziona lo stesso: niente commit delle milestone e impronta calcolata leggendo le cartelle.
let gitPresente;
function hasGit() {
  if (gitPresente === undefined) {
    const r = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    gitPresente = !r.error && r.status === 0;
  }
  return gitPresente;
}
const useGit = () => hasGit() && exists('.git');
function git(argv) {
  const result = spawnSync('git', argv, { cwd: ROOT, encoding: 'utf8', timeout: 120_000, maxBuffer: 50e6, windowsHide: true });
  if (result.error || result.status !== 0) throw new StopError(`Git non riuscito (${argv[0]}): ${result.error?.message ?? result.stderr}. Risolvi il problema e riprendi il loop.`);
  return result.stdout;
}
function commit(msg) {
  if (!useGit()) return; // senza Git non si salva la cronologia (avviso già dato in bootstrap)
  git(['add', '-A']);
  git(['-c', 'user.name=loop', '-c', 'user.email=loop@local', 'commit', '-m', msg, '--allow-empty']);
}
async function afterTests(s) {
  log(T.testRun(s));
  const milestone = currentMilestone(s);
  if (milestone.tasks.some((t) => t.state !== 'done') || requirementsOf(milestone) !== s.requirements) throw new StopError('La milestone ha task aperte o requisiti cambiati. Riprendi con next prima di eseguire i test.');
  const fixMs = isFixMs(currentMilestone(s));
  const r = await runTests(fixMs ? null : specOf(s.milestone), s.milestone);
  if (r.ok) {
    saveState({ ...s, phase: 'commit' });
    try {
      markMilestone(s.milestone, MS_OK);
      commit(T.commit(s.milestone));
      assertUnchanged(r.digest);
    } catch (error) {
      markMilestone(s.milestone, null);
      saveState(s);
      throw error;
    }
    log(T.testOk(s.milestone));
    // Una milestone di correzione ha appena superato tutta la suite: vale come verifica finale.
    saveState({ ...s, completed: { ...s.completed, [s.milestone]: s.requirements }, verificato: fixMs ? verification(readPlan().ms.filter((m) => m.done), r.digest) : s.verificato });
    return loadState();
  }
  return failAttempt(s, r.out);
}
// Un tentativo fallito (test rossi o task [✘]): si passa al fix, oppure si blocca dopo MAX_FIX_ATTEMPTS.
function failAttempt(s, problema) {
  if (s.attempt >= MAX_FIX_ATTEMPTS) {
    log(T.testBloccata(s.milestone));
    markMilestone(s.milestone, MS_BLOCCATA);
    return saveState({ ...s, status: 'blocked', lastError: problema });
  }
  log(T.testFallita(s.milestone));
  return saveState({ ...s, phase: 'fix', attempt: s.attempt + 1, lastError: problema });
}
// Chiude un passo completato. Una milestone con task [✘] non va ai test: diventa un tentativo di
// correzione, così una task dichiarata non riuscita non può diventare ✔ solo perché i test passano.
function completeStep(s) {
  const inErrore = ['dev', 'fix'].includes(s.phase) ? currentMilestone(s).tasks.filter((t) => t.state === 'error') : [];
  return inErrore.length ? failAttempt(s, T.taskInErrore(elenco(inErrore))) : advance(s);
}
// Verifica finale: con tutte le milestone ✔ rilancia l'intera suite. Se qualcosa fallisce,
// aggiunge al PLAN una milestone di correzione (una task per test fallito) e il loop riparte.
async function verify(s) {
  log(T.verificaAvvio);
  if (readPlan().ms.some((m) => !m.done || m.tasks.some((t) => t.state !== 'done'))) throw new StopError('La verifica finale richiede tutte le milestone e le task completate. Riprendi con next.');
  const r = await runTests(null, 'verifica');
  const { ms } = readPlan();
  if (r.ok) {
    log(T.verificaOk);
    commit(T.commitVerifica);
    assertUnchanged(r.digest);
    return saveState({ status: 'done', milestone: null, phase: null, attempt: 0, verificato: verification(ms, r.digest), completed: Object.fromEntries(ms.map((m) => [m.id, requirementsOf(m)])) });
  }
  if (trailingFixMs(ms) >= MAX_VERIFY_ROUNDS) {
    log(T.verificaBloccata);
    return saveState({ ...s, status: 'blocked', lastError: r.out });
  }
  const id = addFixMilestone(r.failures);
  log(T.verificaFallita(id, r.failures.length || '?'));
  return saveState({ status: 'running', milestone: id, phase: 'dev', attempt: 0, lastError: r.out, verificato: s.verificato, completed: s.completed });
}

// =====================================================================
// 10. HARNESS (adattatore verso la CLI dell'agente, modalità orchestrata)
// =====================================================================
function harnessConf() {
  const c = JSON.parse(fs.readFileSync(A('harness.json'), 'utf8'));
  const name = flag('--harness') ?? c.active;
  const h = c.harnesses[name];
  if (!h) throw new Error(T.harnessSconosciuto(name));
  return { name, h, patterns: (c.rateLimitPatterns ?? []).map((p) => p.toLowerCase()) };
}
const quote = (a) => IS_WIN ? `"${a.replace(/"/g, '\\"')}"` : `'${a.replace(/'/g, "'\\''")}'`;
function runProcess({ command, cwd = ROOT, env = process.env, input, timeout, tag, stream = false }) {
  fs.mkdirSync(A('logs'), { recursive: true });
  const lease = A('processes', `${randomUUID()}.json`);
  const owner = { pid: process.pid, file: ownedLockFile, token: fs.readFileSync(ownedLockFile, 'utf8') };
  return new Promise((resolve, reject) => {
    // Su Windows il custode deve sopravvivere alla chiusura del job del genitore.
    const runner = fork(A('process-runner.mjs'), [], { cwd: ROOT, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let out = '';
    let result;
    const onData = (data) => {
      out = (out + data).slice(-5_000_000);
      if (stream) process.stdout.write(data);
    };
    runner.stdout.on('data', onData);
    runner.stderr.on('data', onData);
    runner.on('message', (message) => { result = message; });
    const stop = () => { if (runner.connected) runner.disconnect(); };
    const interrupt = () => { stop(); process.exitCode = 130; };
    process.once('SIGINT', interrupt);
    process.once('SIGTERM', interrupt);
    runner.once('error', reject);
    runner.once('close', (code) => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      if (result?.error) out += `\n${result.error}`;
      fs.writeFileSync(A('logs', `${Date.now()}-${tag}.log`), out);
      if (process.exitCode === 130) reject(new StopError('Esecuzione interrotta.'));
      else resolve({ code: result?.code ?? (code || 1), out });
    });
    runner.send({ command, cwd, env, input, timeout, owner, lease });
  });
}
function callHarness(prompt, tag) {
  const { h } = harnessConf();
  fs.mkdirSync(A('logs'), { recursive: true });
  fs.writeFileSync(PROMPT_FILE, prompt);
  const short = 'Leggi il file .agent/current-prompt.md ed esegui le istruzioni che contiene.';
  const argv = h.args.map((a) => a.replace('{prompt}', short).replace('{promptFile}', '.agent/current-prompt.md'));
  const executable = IS_WIN && /^[\w.-]+$/.test(h.cmd) ? h.cmd : quote(h.cmd);
  return runProcess({ command: [executable, ...argv.map(quote)].join(' '), env: { ...process.env, LOOP_OWNER_PID: String(process.pid) }, input: h.stdin ? prompt : undefined, timeout: STEP_TIMEOUT_MS, tag, stream: true });
}

// =====================================================================
// 11. LOCK (una sola istanza alla volta)
// =====================================================================
function lockOwner(file) {
  let value;
  try { value = fs.readFileSync(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const pid = Number(value.split(':')[0]);
  // Le nuove acquisizioni pubblicano il contenuto con un hard link atomico.
  // Un lock vuoto appartiene quindi a una vecchia esecuzione interrotta.
  if (!pid) return { pid: null, value, alive: false };
  try { process.kill(pid, 0); return { pid, value, alive: true }; } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return { pid, value, alive: false };
  }
}
function acquireLock(file) {
  fs.mkdirSync(A(), { recursive: true });
  const token = `${process.pid}:${randomUUID()}`;
  const prepared = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(prepared, token, { flag: 'wx' });
  try {
  for (;;) {
    try {
      fs.linkSync(prepared, file);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = lockOwner(file);
      if (!owner) continue;
      if (owner.alive) {
        const busy = new StopError(T.altraIstanza(owner.pid));
        busy.exitCode = 3;
        throw busy;
      }
      // Serializza anche il recupero: due riavvii non devono cancellare il nuovo proprietario.
      const releaseRecovery = acquireLock(file + '.recovery');
      try {
        const current = lockOwner(file);
        if (current?.value === owner.value && !current.alive) fs.unlinkSync(file);
      } finally { releaseRecovery(); }
    }
  }
  } finally { fs.rmSync(prepared, { force: true }); }
  const release = () => {
    try { if (fs.readFileSync(file, 'utf8') === token) fs.unlinkSync(file); } catch { /* già rilasciato */ }
  };
  process.on('exit', release);
  return release;
}
function checkOrchestrator() {
  const owner = lockOwner(LOCK_FILE);
  if (owner?.alive && !(cmd === 'task' && process.env.LOOP_OWNER_PID === String(owner.pid))) {
    const busy = new StopError(T.altraIstanza(owner.pid));
    busy.exitCode = 3;
    throw busy;
  }
}
async function waitForOrphans() {
  const directory = A('processes');
  if (!fs.existsSync(directory)) return;
  for (let attempt = 0; attempt < 25; attempt++) {
    let waiting = false;
    for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.json'))) {
      const file = path.join(directory, name);
      let record;
      try { record = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw new StopError(`Registro di processo illeggibile: ${file}`);
      }
      if (record.ownerPid === process.pid || (cmd === 'task' && String(record.ownerPid) === process.env.LOOP_OWNER_PID)) continue;
      const alive = (pid) => {
        if (!pid) return false;
        try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
      };
      if (alive(record.runnerPid)) waiting = true;
      else if (alive(record.childPid)) throw new StopError(`Un processo precedente è ancora attivo (pid ${record.childPid}). Termina quel processo prima di riprendere.`);
      else fs.rmSync(file, { force: true });
    }
    if (!waiting) return;
    await sleep(200);
  }
  throw new StopError('La chiusura dei processi precedenti è ancora in corso. Riprova tra pochi secondi.');
}

// =====================================================================
// 12. COMANDI
// =====================================================================

// --- modalità orchestrata ---
async function run() {
  if (!gate()) return 2;
  const { inizioPasso, ...tempo } = readTime(); // un "next" guidato rimasto aperto non conta: qui misura il loop
  if (inizioPasso) writeTime(tempo);
  await bootstrap();
  const { h, patterns } = harnessConf();
  const fatal = h.fatalExitCodes ?? []; // exit code che un nuovo tentativo non risolve (flag errati, serve conferma)
  let harnessFails = 0;
  for (;;) {
    const s = loadState();
    if (s.status === 'done') { log(T.tuttoFinito); return 0; }
    if (s.status === 'blocked') { log(T.bloccato(s.milestone ?? T.verificaNome, s.decisione)); return 2; }
    const scaduto = timeLimitReached();
    if (scaduto) { log(scaduto); return 2; }
    if (s.phase === 'test-run' || s.phase === 'verify') {
      await timed(() => executeTests(s));
      continue;
    }
    log(T.fase(s));
    const r = await timed(() => callHarness(promptFor(s), `${s.milestone}-${s.phase}`));
    const current = loadState();
    if (current.status === 'blocked' || current.requirements !== s.requirements || current.milestone !== s.milestone) continue;
    if (r.code === 0) {
      const incompleto = stepIncomplete(s);
      if (!incompleto) { harnessFails = 0; completeStep(s); continue; }
      log(T.passoIncompleto(incompleto));
    } else {
      if (fatal.includes(r.code)) { log(T.harnessFatale(r.code)); return 2; }
      if (patterns.some((p) => r.out.toLowerCase().includes(p))) { log(T.rateLimit); await sleep(RATE_LIMIT_WAIT_MS); continue; }
      log(T.harnessRiprova(r.code));
    }
    // Exit 2 e non 1: il supervisor riavvia solo i crash, non un passo che fallisce sempre allo stesso modo.
    if (++harnessFails >= MAX_HARNESS_FAILS) { log(T.harnessKo); return 2; }
  }
}
async function supervise() {
  let crashes = 0;
  for (;;) {
    const t0 = Date.now();
    const code = await new Promise((res) => {
      const c = spawn(process.execPath, [process.argv[1], 'run', ...args.filter((a) => a !== '--supervise' && a !== 'supervise')], { stdio: 'inherit', windowsHide: true });
      const stop = () => { c.kill(); process.exit(130); };
      for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, stop);
      c.on('error', () => res(1));
      c.on('close', (k) => {
        for (const sig of ['SIGINT', 'SIGTERM']) process.removeListener(sig, stop);
        res(k ?? 1);
      });
    });
    if ([0, 2, 3].includes(code)) process.exit(code);
    crashes = Date.now() - t0 > 60_000 ? 1 : crashes + 1;
    if (crashes > MAX_CRASHES) { log(T.troppiCrash); process.exit(1); }
    const wait = Math.min(BACKOFF_BASE_MS * 2 ** (crashes - 1), BACKOFF_MAX_MS);
    log(T.riavvio(code, wait / 1000));
    await sleep(wait);
  }
}

// --- modalità guidata dall'agente ---
async function next() {
  if (!gate()) return;
  const s = loadState();
  if (s.status === 'done') return console.log(T.nextDone);
  if (s.status === 'blocked') return console.log(T.nextBloccato(s.milestone ?? T.verificaNome, s.decisione ?? s.lastError));
  const scaduto = timeLimitReached();
  if (scaduto) return console.log(scaduto);
  if (s.phase === 'test-run' || s.phase === 'verify') return console.log(T.nextTest);
  await bootstrap();
  // Modalità guidata: il passo dell'agente dura da questo "next" al "done" che lo chiude.
  const t = readTime();
  if (!t.inizioPasso) writeTime({ ...t, inizioPasso: Date.now() });
  console.log(promptFor(s));
  console.log(T.nextFine);
}
function done() {
  const s = loadState();
  if (s.status !== 'running' || !['dev', 'test-write', 'fix'].includes(s.phase)) return console.log(T.doneNiente(s));
  const incompleto = stepIncomplete(s);
  if (incompleto) return console.log(incompleto);
  // Tempo del passo guidato dall'agente; tetto pari al timeout di un passo, nel caso la sessione sia rimasta ferma.
  const t = readTime();
  if (t.inizioPasso) writeTime({ usatoMs: t.usatoMs + Math.min(Math.max(0, Date.now() - t.inizioPasso), STEP_TIMEOUT_MS) });
  const n = completeStep(s);
  console.log(n.status === 'blocked' ? T.esitoBloccato : n.phase === 'fix' && n.attempt > s.attempt ? T.doneFix : T.doneOk);
}
async function executeTests(s) {
  for (let attempt = 1; attempt <= MAX_ENV_RETRIES; attempt++) {
    try { return await (s.phase === 'verify' ? verify(s) : afterTests(s)); } catch (error) {
      if (!(error instanceof EnvError)) throw error;
      log(error.message);
      if (attempt === MAX_ENV_RETRIES) throw new EnvError(T.ambienteStop);
      log(T.ambienteRiprova(attempt, ENV_RETRY_WAIT_MS / 1000));
      await sleep(ENV_RETRY_WAIT_MS);
    }
  }
}
async function testCmd() {
  let s = loadState();
  if (s.status === 'done') s = saveState({ ...s, status: 'running', phase: 'verify' });
  if (s.status !== 'running' || !['test-run', 'verify'].includes(s.phase)) return console.log(T.testNonFase(s));
  const scaduto = timeLimitReached();
  if (scaduto) return console.log(scaduto);
  await bootstrap();
  const n = await timed(() => executeTests(s));
  if (n.status === 'done') return console.log(T.esitoFinito);
  if (n.status === 'blocked') return console.log(T.esitoBloccato);
  if (s.phase === 'verify') return console.log(T.esitoVerificaKo(n.milestone));
  console.log(n.milestone !== s.milestone ? T.esitoOk : T.esitoKo);
}
// Cambia lo stato di una task e lo scrive subito in PLAN.md.
// "blocca" segna la task [✘] e ferma subito il loop: serve una decisione dell'utente, non un tentativo di correzione.
function task() {
  const [, nArg, verbo, ...resto] = args;
  const n = Number(nArg);
  const blocca = verbo === 'blocca';
  const stato = blocca ? 'error' : VERBI_TASK[verbo];
  if (!Number.isInteger(n) || n < 1 || !stato) throw new Error(T.taskUso);
  const motivo = resto.join(' ').trim();
  if (blocca && !motivo) throw new Error(T.bloccaSenzaMotivo);
  const s = loadState();
  if (s.status !== 'running' || !['dev', 'fix'].includes(s.phase)) throw new Error(T.taskFaseErrata(s));
  setTask(s.milestone, n, stato);
  if (!blocca) return console.log(T.taskOk(s.milestone, n, stato));
  markMilestone(s.milestone, MS_BLOCCATA);
  saveState({ ...s, status: 'blocked', decisione: T.decisione(s.milestone, n, currentMilestone(s).tasks[n - 1].text, motivo) });
  console.log(T.taskBloccata(s.milestone, n));
}

// --- utilità per l'utente ---
function approve() {
  const r = readiness();
  if (r && r.startsWith('NON PRONTO')) return console.log(r);
  fs.mkdirSync(A(), { recursive: true });
  fs.writeFileSync(APPROVED_FILE, new Date().toISOString());
  console.log(T.approvato);
}
function printStatus() {
  const s = loadState(false);
  const { ms } = readPlan();
  console.log(`status=${s.status} milestone=${s.milestone ?? '-'} fase=${s.phase ?? '-'} correzioni=${s.attempt}/${MAX_FIX_ATTEMPTS} tempo=${formatDuration(readTime().usatoMs)}/${(() => { try { return formatDuration(project().limiteMs); } catch { return '?'; } })()}`);
  ms.forEach((m) => {
    console.log(`  ${m.done ? MS_OK : m.blocked ? MS_BLOCCATA : '·'} ${m.id} ${m.title} (${m.tasks.filter((t) => t.state === 'done').length}/${m.tasks.length})`);
    if (m.id === s.milestone) m.tasks.forEach((t) => console.log(`      ${t.n}. [${STATI[t.state]}] ${t.text}`));
  });
}
function resetAttempts() {
  const s = loadState();
  const open = readPlan().ms.find((m) => !m.done);
  if (!open) {
    if (s.phase !== 'verify' || s.status !== 'blocked') return console.log(T.resetNiente);
    saveState({ ...s, status: 'running' }); // dopo l'intervento manuale si rifà la verifica finale
    return console.log(T.resetOk(T.verificaNome, true));
  }
  // Dopo l'intervento dell'utente: le task [✘] tornano da fare e la milestone riparte.
  markMilestone(open.id, null);
  reopenErrorTasks(open.id);
  const daFare = readPlan().ms.find((m) => m.id === open.id).tasks.some((t) => t.state !== 'done');
  const rilancia = !daFare && (isFixMs(open) || exists(specOf(open.id)));
  saveState({ status: 'running', milestone: open.id, phase: rilancia ? 'test-run' : 'dev', attempt: 0, verificato: s.verificato, completed: s.completed, requirements: requirementsOf(readPlan().ms.find((m) => m.id === open.id)) });
  console.log(T.resetOk(open.id, s.status === 'blocked'));
}

// =====================================================================
// 13. AVVIO
// =====================================================================
const COMANDI = {
  supervise,
  next,
  done,
  test: testCmd,
  task,
  approve,
  status: printStatus,
  'reset-attempts': resetAttempts,
};
try {
  if (cmd === 'supervise') await supervise();
  else if (cmd === 'status') printStatus();
  else if (cmd === 'run' || COMANDI[cmd]) {
    const release = acquireLock(COMMAND_LOCK_FILE);
    try {
      checkOrchestrator();
      ownedLockFile = COMMAND_LOCK_FILE;
      await waitForOrphans();
      if (cmd !== 'approve' && !gate()) process.exitCode = 2;
      else if (cmd === 'run') {
        acquireLock(LOCK_FILE);
        ownedLockFile = LOCK_FILE;
        release(); // I comandi task del processo figlio devono poter aggiornare lo stato.
        process.exitCode = await run();
      } else await COMANDI[cmd]();
    } finally { release(); }
  } else { console.error(T.comandoSconosciuto); process.exitCode = 1; }
} catch (e) {
  console.error(`[loop] ${e.message}`);
  process.exit(e.exitCode ?? 1);
}
