---
name: supabase
description: Come usare Supabase (database Postgres, autenticazione, storage) in una webapp del loop. Da seguire in ogni passo quando README.md ha "skills: supabase". Con l'MCP di Supabase le modifiche al database si applicano da lì; senza, si scrivono in db.sql.
---

# Sottoskill: Supabase

## Prima di toccare il database: c'è l'MCP di Supabase?
Controlla i tuoi strumenti: l'MCP di Supabase espone strumenti con "supabase" nel nome (per esempio `apply_migration`, `execute_sql`, `list_tables`).

- **Con l'MCP:** applica ogni modifica allo schema come migrazione con lo strumento dedicato (`apply_migration`), con un nome descrittivo (es. `m2_crea_prodotti`). Prima leggi lo schema attuale (`list_tables`) per non ricreare ciò che esiste già. Non usare `execute_sql` per cambiare lo schema.
- **Senza l'MCP:** non puoi eseguire query. Scrivi tutto in **`db.sql`** nella radice del progetto: è il file che l'utente eseguirà nell'editor SQL di Supabase.

In entrambi i casi annota in README.md, sezione "Note tecniche", quali tabelle usa l'app.

## Regole per `db.sql`
- Un solo file, in coda: ogni milestone **aggiunge** una sezione, senza riscrivere le precedenti già eseguite.
  ```sql
  -- =====================================================================
  -- M2 — Catalogo prodotti
  -- =====================================================================
  ```
- Le query devono poter essere rieseguite senza errori: `create table if not exists`, `create index if not exists`, `alter table ... add column if not exists`, `drop policy if exists ...` prima di `create policy`, `create or replace function`.
- Ogni tabella esposta all'app ha **Row Level Security attiva** (`alter table ... enable row level security;`) e policy esplicite per ciò che l'app deve leggere o scrivere. Niente tabelle aperte "per comodità".
- Commenti brevi in italiano per spiegare il perché di ogni policy.
- Niente dati personali o segreti nel file. I dati di esempio, se servono, in una sezione separata e marcata come facoltativa.
- Quando una milestone aggiunge una sezione, scrivilo nel riepilogo finale del passo: l'utente deve eseguirla prima di provare l'app.

## Chiavi e configurazione
- Nel frontend si usano solo l'URL del progetto e la chiave **anon** (pubblica, protetta dalla RLS). La chiave `service_role` non va mai nel codice dell'app né in un file versionato.
- **Stack modern:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` in `.env` (ignorato da git), lette con `import.meta.env`. Crea `.env.example` con le stesse variabili vuote. Client in `src/lib/supabase.js`, unico punto di accesso.
- **Stack static:** scarica una volta la build UMD di supabase-js (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js`) in `assets/js/vendor/supabase.js` e caricala con uno script classico prima degli script dell'app. Così l'app e i test non dipendono dalla rete per la libreria. URL e chiave anon in `assets/js/config.js`, client creato in `assets/js/supabase.js` ed esposto come `App.supabase`. Niente `import`.
- Tutto il codice che parla con Supabase sta in un solo modulo o file (`src/lib/` oppure `assets/js/supabase.js`): il resto dell'app chiama funzioni come `caricaProdotti()`, mai il client direttamente.

## Errori e stati
- Ogni chiamata controlla `error` nella risposta e mostra all'utente uno stato di errore comprensibile; gestisci anche caricamento e lista vuota.
- Con l'autenticazione, l'interfaccia deve funzionare sia da utente anonimo sia da utente collegato, secondo il PLAN.

## Test
I test e2e non usano mai il database reale: intercetta le chiamate a Supabase con `page.route('**/rest/v1/**', ...)` (e `**/auth/v1/**` se serve) e rispondi con dati finti. Così i test sono deterministici e funzionano anche se `db.sql` non è ancora stato eseguito.
