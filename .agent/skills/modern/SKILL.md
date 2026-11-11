---
name: modern
description: Come realizzare una webapp moderna con React e Vite. Da seguire in ogni passo del loop quando README.md ha "stack: modern".
---

# Sottoskill: webapp moderna (React + Vite)

## Setup (solo milestone M1)
Crea Vite + React nella radice del progetto (senza sottocartella). Il `package.json` della radice è dell'app: script richiesti `dev`, `build`, `preview`. Usa JavaScript con JSX, a meno che README.md chieda TypeScript. Non toccare `.agent/` (ha il suo `package.json` per Playwright), `AGENTS.md`, `PLAN.md`, `README.md`, `DESIGN.md`.
Usa versioni stabili correnti e compatibili con Node di react, react-dom, vite e @vitejs/plugin-react.

## Struttura
```
index.html
src/main.jsx            ingresso
src/App.jsx             layout radice e rotte
src/components/         UI riutilizzabile (Button/Button.jsx + Button.module.css)
src/pages/              un componente per rotta
src/hooks/              hook personalizzati (useXxx)
src/lib/                funzioni pure, client API, costanti
src/styles/             global.css (token, reset)
```

## React
- Solo componenti a funzione e hook. Un componente per file, `PascalCase.jsx`; hook `useCamelCase.js`; altri file `camelCase.js`.
- Componenti piccoli (circa 100 righe al massimo); sposta la logica in hook e in `lib/`.
- Stato: prima `useState`/`useReducer` locali; solleva lo stato solo se serve; Context solo per stato davvero globale. Aggiungi una libreria di stato solo se README lo richiede.
- Deriva i valori durante il render invece di duplicare lo stato. `key` stabili (mai l'indice per liste dinamiche). `useEffect` solo per sincronizzarsi con sistemi esterni, con cleanup.
- Props destrutturate nella firma; niente prop drilling oltre 2 livelli (usa composizione o context).
- Gestisci stati di caricamento, vuoto ed errore per ogni vista asincrona.
- Routing (se serve): `react-router-dom`, rotte dichiarate in `App.jsx`.

## Stile grafico
- CSS Modules per componente (`X.module.css`) + design token come custom property CSS in `src/styles/global.css`. Se esiste `DESIGN.md`, i token ne derivano. Mobile first, unità relative, stili di focus visibili, contrasto AA. Niente stili inline se non per valori dinamici.

## Stile del codice
- ES module, `const`/`let`, uguaglianza stretta, export con nome per gli helper dei componenti, export default per il file del componente.
- Indentazione a 2 spazi, apici singoli, punto e virgola, virgole finali. Niente import inutilizzati, niente `console.log`, niente codice commentato.
- Commenti brevi, in italiano, solo per spiegare il "perché".
- Accessibilità: elementi semantici, label sugli input, `alt` sulle immagini, bottoni per le azioni.
- Aggiungi `data-testid="kebab-case"` a elementi interattivi e regioni chiave.
- Non chiamare mai API di terze parti reali in modo da rendere l'app inutilizzabile offline; isola il codice di rete in `src/lib/` per poterlo sostituire.

## Soglia di qualità
`npm run build` riesce senza warning; nessun errore in console a runtime; funziona a 360px e a 1280px.
