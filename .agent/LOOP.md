# Come usare il loop

Tutti i comandi si lanciano dalla radice del progetto. La radice resta dell'app: loop, Playwright, test e log stanno in `.agent/`.

1. Copia il template della skill (tutto tranne `SKILL.md`, compresa `.agent`) in un nuovo progetto.
2. Compila `README.md` (scopo, `stack: static|modern`, eventuali `skills:`) e `PLAN.md` (milestone `## M1 — Titolo` con task `- [ ]`).
3. Rileggi i due file e conferma con `node .agent/loop.mjs approve`. Finché non lo fai (o se sono ancora i template) `run` e `next` si rifiutano di partire.
4. Scegli l'harness in `.agent/harness.json` (`active`) oppure passa `--harness codex`.
5. Avvia: `node .agent/loop.mjs`.

## Limite di tempo
In `tempo:` nel front-matter di README.md (default `2h`; accetta per esempio `90m`, `1h30m`, `4h` o `nessuno`). Il loop somma la durata dei passi dell'agente e dei test su tutto il progetto, salvandola in `.agent/tempo.json`, e prima di ogni passo controlla il limite. Raggiunto il limite si ferma (exit 2) con `LIMITE DI TEMPO RAGGIUNTO`, senza interrompere un passo già avviato. Per continuare alza `tempo:` e rilancia lo stesso comando: riparte da dove era. `node .agent/loop.mjs status` mostra tempo usato e limite.

## Requisiti
- **Node 18+ e npm:** obbligatori.
- **Git:** facoltativo. Se c'è, il loop fa `git init` e un commit per ogni milestone superata. Se manca, lo dice all'avvio e funziona lo stesso, senza cronologia; l'impronta dei file per la verifica finale viene calcolata leggendo le cartelle.
- **Playwright e Chromium:** li installa il loop al primo avvio, in `.agent/node_modules` e nella cache dei browser di Playwright (circa 200 MB, una volta sola). Prima di ogni corsa controlla che il Chromium richiesto sia scaricato per intero e, se manca, lo riscarica. Se il download fallisce (rete assente o lenta) è un problema d'ambiente: nessun tentativo consumato, il loop si ferma e basta rilanciare lo stesso comando. Per usare una cache già esistente imposta `PLAYWRIGHT_BROWSERS_PATH`.

## Cosa succede per ogni milestone
`dev` (l'agente implementa, una task alla volta) → `test-write` (l'agente scrive il test seguendo la sottoskill `playwright-tests`) → `test-run` (lo script lancia Playwright; l'exit code decide).
Se fallisce: `fix` con l'errore nel prompt, fino a 3 tentativi, poi il loop si ferma (✘, exit 2). Se passa: commit git, ✔ nel PLAN, prossima milestone.
Se l'agente ha bisogno di una tua decisione, lancia `task <n> blocca "motivo"`: il loop si ferma subito e mostra il motivo. Decidi (correggi il codice o cambia PLAN.md), poi `node .agent/loop.mjs reset-attempts`.
Se i test non partono per un problema della macchina (porta occupata, browser mancante), non si consumano tentativi: il loop prova a rimediare, riprova 3 volte, poi si ferma e ti dice cosa sistemare.

L'esito di Git viene controllato. Un commit fallito lascia la milestone aperta e ferma il loop. Risolvi l'errore Git e riprendi con lo stesso comando. Il commit comprende tutti i file non ignorati della cartella dedicata al progetto.

## Verifica finale
Quando tutte le milestone sono ✔, il loop rilancia tutti i test da capo. Se qualcosa fallisce, aggiunge al PLAN una milestone "Correzioni dalla verifica finale" con una task per ogni test fallito e riparte; questa milestone non scrive test nuovi ma deve far passare tutta la suite. Ha gli stessi 3 tentativi di fix delle altre milestone. Il loop genera al massimo 3 milestone di correzione consecutive in fondo al piano; oltre questa soglia una nuova verifica fallita richiede un intervento manuale (exit 2).

La verifica finale registra l'impronta dei file versionati e dei nuovi file non ignorati. Modifiche successive richiedono una nuova verifica. Puoi anche richiederla esplicitamente con `node .agent/loop.mjs test` dopo `FINITO`.

## PLAN.md come memoria
Ogni task ha uno stato: `[ ]` da fare, `[➤]` in lavorazione, `[✔]` completata, `[✘]` non completata o con errori. L'agente lo cambia con `node .agent/loop.mjs task <n> inizia|fatta|errore`, che scrive subito su disco e permette una sola task in lavorazione. Se tutto si ferma, la task `[➤]` dice dove si era arrivati.

## TEST.md
Nella radice, elenca i test e2e per milestone con il loro esito: `[ ]` da fare, `[➤]` in lavorazione, `[✔]` passata, `[✘]` fallita. Lo aggiorna in tempo reale un reporter di Playwright (`.agent/test-md-reporter.mjs`) a ogni corsa dei test, compresa la verifica finale.

## Supabase
Con `skills: supabase` nel README, l'agente usa l'MCP di Supabase se è disponibile. Altrimenti scrive le query in `db.sql` nella radice, una sezione per milestone: eseguile nell'editor SQL di Supabase prima di provare l'app. Le chiavi vanno in `.env` (ignorato da git).

## Sottoskill
In `.agent/skills/`: `static`, `modern`, `playwright-tests`. Per aggiungerne una crea `.agent/skills/<nome>/SKILL.md` e scrivi il nome in `skills:` nel front-matter di README.

## Se si interrompe
Rilancia lo stesso comando: riparte dal punto salvato in `.agent/state.json` e `PLAN.md`. `node .agent/loop.mjs` ha già un supervisor che riavvia da solo dopo un crash (backoff 5s → 5min). Un limite d'uso/rate limit o un errore temporaneo del provider (502, risposta vuota…) viene riconosciuto e il loop attende 15 minuti senza consumare tentativi. Le frasi riconosciute sono in `rateLimitPatterns` di `.agent/harness.json`.
Per ripartire anche dopo un riavvio del PC (Windows):
```
schtasks /create /tn "WebappLoop" /sc onlogon /tr "cmd /c cd /d C:\percorso\progetto && node .agent/loop.mjs"
```

## Comandi
| Comando | Effetto |
|---|---|
| `node .agent/loop.mjs approve` | conferma README e PLAN, sblocca il loop |
| `node .agent/loop.mjs` | loop orchestrato con auto-restart |
| `node .agent/loop.mjs status` | milestone, fase, tentativi, stato delle task |
| `node .agent/loop.mjs test` | esegue il passo di test corrente oppure ripete la verifica finale dopo `FINITO` |
| `node .agent/loop.mjs task <n> inizia\|fatta\|errore` | cambia lo stato di una task della milestone corrente |
| `node .agent/loop.mjs task <n> blocca "motivo"` | ferma il loop chiedendo una decisione all'utente |
| `node .agent/loop.mjs reset-attempts` | sblocca una milestone ✘ dopo un tuo intervento (le task ✘ tornano da fare) |

## Modalità senza CLI (qualsiasi agente/IDE/modello)
Apri il progetto con l'agente e digli: "Segui AGENTS.md". Userà `node .agent/loop.mjs next` → fa il passo → `node .agent/loop.mjs done` oppure `node .agent/loop.mjs test`, con la stessa logica di retry (max 3) e ripresa. Una nuova sessione riparte con `node .agent/loop.mjs next`.

La presenza del file di test non chiude `test-write`. Dopo un'interruzione, l'agente completa la suite e conferma con `done`. `status` è di sola lettura. I comandi che modificano lo stato sono serializzati; durante l'orchestrazione sono ammessi solo gli aggiornamenti `task` del suo agente.

L'approvazione persiste per il progetto. Concorda con l'utente le modifiche agli obiettivi o al piano prima di applicarle. Tutti i comandi operativi richiedono l'approvazione iniziale.

## Sicurezza
Gli agenti vengono lanciati in modalità non interattiva con permessi ampi (modifica file, shell). Usa il loop solo in cartelle di progetto dedicate e controllate da git.

Il server statico dei test ascolta su `127.0.0.1` e serve asset pubblici. Blocca file nascosti, dipendenze, documenti del loop e link che escono dalla radice.

## Test del loop
Esegui `node --test .agent/tests/loop.test.mjs` dalla radice, oppure `npm test` dentro `.agent/`. I test usano copie temporanee, Git reale e un runner Playwright simulato. La prova dei link esterni richiede il permesso di creare link simbolici o junction.
