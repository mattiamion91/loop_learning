---
stack: modern
skills: supabase
tempo: 2h
---

# Sondaggio Dipendenti

## Obiettivo
Webapp desktop-first che permette ai dipendenti di un'azienda di accedere con email e password e compilare un sondaggio di 5 domande a risposta multipla sul servizio che stanno usando; le risposte vengono salvate su Supabase e chi ha già completato il sondaggio vede solo la pagina di ringraziamento.

## Funzionalità principali
- Registrazione e accesso con email e password (Supabase Auth).
- Questionario di 5 domande a risposta singola (radio), una domanda per schermata con barra di avanzamento e pulsanti Avanti/Indietro.
- Salvataggio delle risposte su Supabase: una sola compilazione per dipendente.
- Pagina di ringraziamento finale; chi ha già risposto vede solo quella pagina.
- Header con l'email del dipendente collegato e pulsante Esci (logout).
- Interfaccia interamente in italiano.

## Vincoli
- Lingua dell'interfaccia: italiano.
- Browser/dispositivi target: desktop-first (layout pensato per 1280px e oltre), senza overflow orizzontale; utilizzabile anche a 360px.
- Cose da NON fare: nessuna area/dashboard di amministrazione dei risultati (le risposte si consultano solo su Supabase); nessuna raccolta di dati personali oltre all'email; nessuna modifica delle domande dall'interfaccia.

## Design
Vedi DESIGN.md

## Note tecniche
- Stack: React + Vite (JavaScript + JSX), CSS Modules, design token come custom property CSS.
- Supabase:
  - autenticazione email/password (registrazione libera);
  - tabella `survey_responses`: una riga per dipendente con le colonne `q1`…`q5` (testo) e `submitted_at`; vincolo di unicità su `user_id` per impedire doppie compilazioni;
  - Row Level Security attiva con policy di `select` e `insert` limitate alle proprie righe (`auth.uid() = user_id`).
  - Le modifiche allo schema sono applicate come migrazioni tramite l'MCP di Supabase.
- **Attenzione al progetto Supabase condiviso:** il progetto usato ha già un trigger `on_auth_user_created` che, a ogni nuovo utente, scrive anche in `public.bookclub_users` (residuo di un'altra app). Di conseguenza ogni dipendente che si registra crea una riga in `bookclub_users`: se non è voluto, va rimosso il trigger oppure va usato un progetto Supabase dedicato a questo sondaggio. L'app del sondaggio non usa `bookclub_users` e non ne dipende.
- Configurazione: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` in `.env` (ignorato da git), con esempio in `.env.example`.
- Tutto il codice che parla con Supabase sta in `src/lib/`: `supabase.js` è l'unico punto di accesso al client, `auth.js` gestisce l'autenticazione e `survey.js` le risposte.
- I test e2e non usano mai il database reale: intercettano le chiamate a `**/auth/v1/**` e `**/rest/v1/**` e rispondono con dati finti.
