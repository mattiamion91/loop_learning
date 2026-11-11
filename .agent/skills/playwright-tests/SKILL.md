---
name: playwright-tests
description: Scrive test e2e Playwright deterministici per UNA milestone finita della webapp, senza toccare il codice dell'app. Da usare nel passo test-write del loop.
---

# Scrivere i test Playwright della milestone corrente

Input: l'id della milestone (es. `M2`) e la sua lista di task, indicati nel prompt. Leggi `PLAN.md` e `README.md` per il contesto.

## Output
Un solo file: `.agent/tests/e2e/<IdMilestone>.spec.js` (es. `.agent/tests/e2e/M2.spec.js`). Sintassi ES module, `import { test, expect } from '@playwright/test'`.
I test stanno in `.agent/` insieme a Playwright, così la radice del progetto resta pulita.
`baseURL` è già configurato: usa `page.goto('/')` e percorsi relativi.

## Regole
1. Testa solo ciò che le task di QUESTA milestone promettono, dal punto di vista dell'utente: cosa si vede, cosa succede dopo click/digitazione/navigazione. Un `test()` per task o per piccolo gruppo di task, con un titolo chiaro.
2. Selettori, in ordine di preferenza: `getByRole`, `getByLabel`, `getByText`, `getByTestId` (attributo `data-testid`). Niente catene CSS/XPath legate al layout.
3. Usa asserzioni web-first che aspettano da sole (`await expect(locator).toBeVisible()` ecc.). MAI `waitForTimeout` o attese fisse.
4. I test sono indipendenti e deterministici: nessuna dipendenza dall'ordine, nessuna rete reale, nessuna casualità, nessuna data non controllata. Ogni test parte da uno stato pulito (nuova pagina; svuota `localStorage` in `beforeEach` se l'app lo usa).
5. Verifica anche che non ci siano errori di pagina non gestiti: raccogli `page.on('pageerror')` e controlla che la lista sia vuota.
6. Se la milestone aggiunge una pagina o una vista, includi un controllo di base: si carica con il titolo/heading giusto.
7. NON modificare il codice dell'app, `PLAN.md`, le configurazioni o i test di altre milestone. Se all'app manca un `data-testid`, preferisci un selettore per ruolo/testo; se è impossibile, scrivi comunque il test: un test che fallisce è il segnale corretto e il passo di fix aggiungerà l'attributo.
8. Non avviare un server di sviluppo. Puoi lanciare una sola volta, dentro `.agent/`, `npx playwright test tests/e2e/<IdMilestone>.spec.js --config skills/<stack>/playwright.config.mjs` per controllare la sintassi, ma non cambiare il codice dell'app in base al risultato.

## Stile
Breve e leggibile, nessun helper se non usato almeno 3 volte. File sotto le 150 righe circa. Titoli dei test e commenti in italiano.
