# Test

Elenco dei test e2e, aggiornato dal loop a ogni esecuzione: non modificarlo a mano.
`- [ ]` da fare · `- [➤]` in lavorazione · `- [✔]` passata · `- [✘]` fallita

## M1 — Scheletro, design token e autenticazione
- [✔] M1 — scheletro, design e autenticazione › la radice porta alla pagina di accesso
- [✔] M1 — scheletro, design e autenticazione › la pagina usa lingua e design token di DESIGN.md
- [✔] M1 — scheletro, design e autenticazione › una vista protetta senza sessione riporta al login
- [✔] M1 — scheletro, design e autenticazione › l’accesso riuscito porta al questionario
- [✔] M1 — scheletro, design e autenticazione › credenziali errate mostrano un errore in italiano
- [✔] M1 — scheletro, design e autenticazione › la registrazione con conferma email mostra un avviso

## M2 — Questionario a 5 domande e salvataggio su Supabase
- [✔] M2 — questionario e salvataggio › mostra la prima domanda con l’avanzamento
- [✔] M2 — questionario e salvataggio › chiede una risposta prima di avanzare
- [✔] M2 — questionario e salvataggio › naviga avanti e indietro mantenendo la scelta
- [✔] M2 — questionario e salvataggio › invia le risposte e mostra il ringraziamento

## M3 — Flusso "già completato", logout e rifiniture
- [✔] M3 — già completato, logout e rifiniture › chi ha già compilato vede solo il ringraziamento
- [✔] M3 — già completato, logout e rifiniture › l’intestazione mostra l’email e l’uscita riporta al login
- [✔] M3 — già completato, logout e rifiniture › mostra lo stato di caricamento durante la verifica
- [✔] M3 — già completato, logout e rifiniture › se la verifica fallisce lo segnala e lascia compilare
- [✔] M3 — già completato, logout e rifiniture › la barra di avanzamento è accessibile e si aggiorna
