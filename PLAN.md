# Piano

Memoria del progetto: cosa è fatto e cosa resta.
Una milestone = un risultato visibile e testabile nel browser, piccolo (3-5 task, 30-90 min di lavoro).
Le milestone aggiungono funzionalità usando i punti di estensione creati in M1. Le modifiche necessarie alle precedenti vanno indicate esplicitamente nelle task del piano da approvare, preservando gli altri comportamenti completati.
Titoli: `## M<numero> — Titolo`. Il loop aggiunge ✔ (superata) o ✘ (bloccata), e a fine piano può aggiungere milestone "Correzioni dalla verifica finale".

Stati delle task (cambiali con `node .agent/loop.mjs task <n> inizia|fatta|errore`, mai a mano):
`- [ ]` da fare · `- [➤]` in lavorazione (al massimo una) · `- [✔]` completata · `- [✘]` non completata o con errori

## M1 — Scheletro, design token e autenticazione ✔
- [✔] Setup Vite + React nella radice (script `dev`, `build`, `preview`) e struttura cartelle `src/components`, `src/pages`, `src/hooks`, `src/lib`, `src/styles`
- [✔] Design token da DESIGN.md come custom property in `src/styles/global.css` + reset e layout base desktop-first (max-width 1280px)
- [✔] Client Supabase in `src/lib/supabase.js` (da `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), `.env.example`, modulo `src/lib/auth.js` e hook `src/hooks/useAuth.js`
- [✔] Pagina di accesso `src/pages/Login.jsx`: form email+password con registrazione e login, stati di caricamento ed errore in italiano
- [✔] Punti di estensione: rotte dichiarate in `src/App.jsx` (login, questionario, ringraziamento), moduli `lib/` per le funzionalità successive

## M2 — Questionario a 5 domande e salvataggio su Supabase ✔
- [✔] Le 5 domande a risposta singola definite in `src/lib/questions.js` (testo della domanda e opzioni in italiano)
- [✔] Migrazione Supabase: tabella `survey_responses` (`q1`…`q5`, `submitted_at`), unicità su `user_id`, RLS attiva con policy select/insert sulle proprie righe
- [✔] `src/lib/survey.js`: `caricaRispostaUtente()` e `salvaRisposte()`, con controllo di `error` e messaggi comprensibili
- [✔] Pagina `src/pages/Questionario.jsx`: una domanda per schermata, barra di avanzamento (1/5), radio, Avanti/Indietro, validazione della risposta, pulsante Invia
- [✔] Pagina `src/pages/Grazie.jsx` di ringraziamento mostrata dopo il salvataggio riuscito

## M3 — Flusso "già completato", logout e rifiniture
- [ ] Modifica al routing di `src/App.jsx` e alla pagina Questionario: se l'utente ha già una risposta salvata, viene portato direttamente a Grazie (solo pagina di ringraziamento)
- [ ] Header con email del dipendente collegato e pulsante Esci (logout) su tutte le viste autenticate
- [ ] Stati di caricamento, vuoto ed errore coerenti su tutte le viste asincrone
- [ ] Accessibilità e rifiniture desktop-first: label sui campi, focus visibile, contrasto AA, spaziature e hover secondo DESIGN.md
