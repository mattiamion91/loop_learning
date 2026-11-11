# Regole per l'agente (canoniche, valide per qualsiasi modello e strumento)

Questo progetto è costruito da un loop automatico, una milestone alla volta. Puoi essere qualsiasi modello in qualsiasi strumento.
Tutto il contesto è su disco: non fare affidamento sul ricordo di conversazioni precedenti.

## Prima di tutto: il progetto è approvato?
Se il file `.agent/approved` **non esiste**, l'utente non ha ancora approvato README.md e PLAN.md. In questo caso:
- non scrivere né modificare codice dell'app: lavora solo su README.md e PLAN.md insieme all'utente;
- mostra all'utente i due file, chiedi se li approva e **termina il turno** aspettando la risposta;
- lancia `node .agent/loop.mjs approve` solo dopo un messaggio dell'utente che approva esplicitamente i due file. Le risposte alle domande sul progetto non valgono come approvazione.

## File
- `README.md`: scopo del progetto. Nel front-matter `stack:` (`static` oppure `modern`) e, se presenti, le sottoskill extra in `skills:`.
- `PLAN.md`: la memoria del progetto. Milestone (`## M1 — Titolo`) con task. Un titolo che finisce con ✔ è finito, con ✘ è bloccato.
- `TEST.md`: elenco dei test e del loro esito ([ ] da fare, [➤] in lavorazione, [✔] passata, [✘] fallita). Lo aggiorna il loop: non modificarlo.
- `db.sql` (solo con la sottoskill `supabase` senza MCP): query da eseguire sul database, una sezione per milestone.
- `DESIGN.md` (facoltativo): se esiste, è l'unica fonte di verità per tutta la grafica. Prevale sulla sezione Design di `README.md` e sul tuo gusto. Ti discosti solo se l'utente ha chiesto esplicitamente una modifica, e in quel caso aggiorna `DESIGN.md`.
- `.agent/skills/<nome>/SKILL.md`: sottoskill. Quella dello stack e quelle in `skills:` sono obbligatorie in ogni passo.
- `.agent/state.json`: stato del loop. Non modificarlo a mano: usa `node .agent/loop.mjs`.

## Stati delle task in PLAN.md
| Stato | Significato |
|---|---|
| `- [ ]` | da fare |
| `- [➤]` | in lavorazione |
| `- [✔]` | completata |
| `- [✘]` | non completata o con errori |

- Al massimo **una** task `- [➤]` alla volta.
- Lo stato va scritto su disco nel momento esatto in cui cambia, non a fine sessione. Cambialo solo con:
  - `node .agent/loop.mjs task <n> inizia` prima di iniziare la task n della milestone corrente;
  - `node .agent/loop.mjs task <n> fatta` appena è finita;
  - `node .agent/loop.mjs task <n> errore` se non riesci a completarla;
  - `node .agent/loop.mjs task <n> blocca "motivo"` se per completarla serve una decisione dell'utente. Il loop si ferma subito e mostra il motivo; poi fermati anche tu.
- Se trovi una task `[➤]`, il lavoro si era interrotto lì: riprendi da quella.
- Una task `[✘]` ferma la milestone: non va ai test ma in correzione, e dopo 3 tentativi il loop chiede l'intervento dell'utente. Usa "errore" solo quando davvero non puoi completarla; se il problema è una scelta che spetta all'utente, usa "blocca".
- Non aggiungere ✔/✘ ai titoli: lo fa il loop.

## Regole
1. Lavora su UNA milestone: quella corrente. Non toccare mai le successive.
2. Le milestone aggiungono funzionalità usando i punti di estensione creati in M1 (navigazione, rotte, design token, moduli). Puoi modificare il codice di milestone già ✔ quando la task corrente nel piano approvato lo prevede esplicitamente, quando l'utente lo ha autorizzato oppure durante le milestone "Correzioni dalla verifica finale". Preserva gli altri comportamenti già completati. Per modifiche retroattive indispensabili e prive di autorizzazione, lancia `node .agent/loop.mjs task <n> blocca "motivo"` e fermati.
3. Segui le sottoskill del progetto. Se una regola è in conflitto con una task, segui la regola e annotalo in README.md.
4. Aggiungi `data-testid` agli elementi interattivi e alle regioni chiave.
5. Non lasciare mai server di sviluppo o processi in background.
6. Non indebolire né cancellare i test per farli passare.
7. Non aggiungere dipendenze che la milestone non richiede.
8. Tieni pulita la radice: contiene solo i file dell'app e README, PLAN, AGENTS, DESIGN, TEST e (con Supabase senza MCP) db.sql. Tutto ciò che riguarda il loop (test e2e compresi) sta in `.agent/`; non modificare `.agent/` se non per scrivere i test richiesti.
9. Scrivi in italiano: testi dell'interfaccia (salvo diversa indicazione in README.md), commenti, messaggi di commit e note.

## Se guidi tu il loop (nessun orchestratore attivo)
Ripeti finché ricevi `FINITO` o `BLOCCATO`:
1. `node .agent/loop.mjs next`: stampa l'istruzione esatta del passo corrente.
2. Eseguila. Quando è completa, lancia `node .agent/loop.mjs done`. Se `next` ti dice di lanciare i test, lancia invece `node .agent/loop.mjs test`.
3. Torna al punto 1.

Se `next` stampa `NON PRONTO` o `NON APPROVATO`, fermati: README.md e PLAN.md devono essere compilati e confermati dall'utente. Non lanciare mai `node .agent/loop.mjs approve` da solo, a meno che l'utente te lo abbia appena detto.

Se vieni interrotto o inizi una nuova sessione: lancia `node .agent/loop.mjs next`. Riparte dal passo salvato.
Su `BLOCCATO` o `LIMITE DI TEMPO RAGGIUNTO` fermati e riferisci all'utente; non proseguire.

`status` legge lo stato senza modificarlo. Durante un'orchestrazione attiva, solo i comandi `task` dell'agente avviato dal loop possono aggiornare lo stato. Un file di test parziale va completato prima di chiamare `done`, anche dopo una ripresa.
