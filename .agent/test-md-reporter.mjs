// Reporter Playwright che tiene aggiornato TEST.md nella radice del progetto, test per test:
// [ ] da fare quando la corsa parte, [➤] mentre il test gira, [✔] passata o [✘] fallita appena finisce.
// Ogni cambio di stato viene scritto subito su disco. Un errore qui non deve mai far fallire i test.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_FILE = path.join(ROOT, 'TEST.md');
const PLAN_FILE = path.join(ROOT, 'PLAN.md');

const SIMBOLI = { todo: ' ', doing: '➤', passed: '✔', failed: '✘' };
const INTESTAZIONE = [
  '# Test',
  '',
  'Elenco dei test e2e, aggiornato dal loop a ogni esecuzione: non modificarlo a mano.',
  '`- [ ]` da fare · `- [➤]` in lavorazione · `- [✔]` passata · `- [✘]` fallita',
];
const RE_SEZIONE = /^##\s+(M\d+)\b/;
const RE_TEST = /^- \[( |➤|✔|✘)\]\s+(.*)$/u;

// Id della milestone dal file di test: ".../M2.spec.js" → "M2".
const milestoneOf = (file) => path.basename(file).replace(/\.spec\.[cm]?[jt]sx?$/, '');
// Nome leggibile del test: describe › titolo (senza progetto e file).
const nameOf = (test) => test.titlePath().slice(3).join(' › ');

// Titoli delle milestone presi da PLAN.md, senza i segni ✔/✘ del loop.
function planTitles() {
  const titles = new Map();
  try {
    for (const line of fs.readFileSync(PLAN_FILE, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^##\s+(M\d+)\s*[—–-]\s*(.+?)\s*$/);
      if (m) titles.set(m[1], m[2].replace(/\s*(✔|✘)\s*$/u, ''));
    }
  } catch { /* PLAN.md mancante: si usano solo gli id */ }
  return titles;
}

// TEST.md → Map(id milestone → Map(nome test → simbolo)), nell'ordine del file.
function readSections() {
  const sections = new Map();
  let current = null;
  let text = '';
  try { text = fs.readFileSync(TEST_FILE, 'utf8'); } catch { return sections; }
  for (const line of text.split(/\r?\n/)) {
    const s = line.match(RE_SEZIONE);
    if (s) { current = new Map(); sections.set(s[1], current); continue; }
    const t = current && line.match(RE_TEST);
    if (t) current.set(t[2], t[1]);
  }
  return sections;
}

function writeSections(sections) {
  const titles = planTitles();
  const ids = [...sections.keys()].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const lines = [...INTESTAZIONE];
  for (const id of ids) {
    lines.push('', titles.has(id) ? `## ${id} — ${titles.get(id)}` : `## ${id}`);
    for (const [name, symbol] of sections.get(id)) lines.push(`- [${symbol}] ${name}`);
  }
  const temporary = `${TEST_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, lines.join('\n') + '\n');
  fs.renameSync(temporary, TEST_FILE);
}

export default class TestMdReporter {
  constructor() { this.sections = new Map(); }

  // La corsa parte: le sezioni dei file che girano vengono riscritte con i test attuali, tutti da fare.
  onBegin(config, suite) {
    this.safely(() => {
      this.sections = readSections();
      const fresh = new Map();
      for (const test of suite.allTests()) {
        const id = milestoneOf(test.location.file);
        if (!fresh.has(id)) fresh.set(id, new Map());
        fresh.get(id).set(nameOf(test), SIMBOLI.todo);
      }
      for (const [id, tests] of fresh) this.sections.set(id, tests);
    });
  }

  onTestBegin(test) { this.set(test, SIMBOLI.doing); }

  onTestEnd(test, result) {
    const symbol = result.status === 'passed' ? SIMBOLI.passed
      : result.status === 'skipped' || result.status === 'interrupted' ? SIMBOLI.todo
        : SIMBOLI.failed;
    this.set(test, symbol);
  }

  // Corsa interrotta: nessun test resta "in lavorazione".
  onEnd() {
    this.safely(() => {
      for (const tests of this.sections.values()) {
        for (const [name, symbol] of tests) if (symbol === SIMBOLI.doing) tests.set(name, SIMBOLI.todo);
      }
    });
  }

  set(test, symbol) {
    this.safely(() => {
      const id = milestoneOf(test.location.file);
      if (!this.sections.has(id)) this.sections.set(id, new Map());
      this.sections.get(id).set(nameOf(test), symbol);
    });
  }

  safely(fn) {
    try {
      fn();
      writeSections(this.sections);
    } catch (error) {
      process.stderr.write(`[TEST.md] aggiornamento non riuscito: ${error.message}\n`);
    }
  }

  printsToStdio() { return false; }
}
