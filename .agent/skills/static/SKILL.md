---
name: static
description: Come realizzare una webapp statica in HTML, CSS e JavaScript plain, senza build né framework. Da seguire in ogni passo del loop quando README.md ha "stack: static".
---

# Sottoskill: webapp statica (HTML, CSS, JavaScript plain)

Nessun build, nessun framework, nessuna dipendenza npm a runtime. L'app deve funzionare servita da qualsiasi file server statico.

## Struttura
```
index.html              pagina d'ingresso (altre pagine: pages/<nome>.html)
assets/
  css/                  base.css (reset, variabili, tipografia), layout.css, components.css, <pagina>.css
  js/                   un file per funzionalità (carrello.js ...) e app.js, che avvia tutto
  img/                  immagini e icone
  fonts/                font locali (se servono)
```
Mantieni questa struttura: CSS, JavaScript e immagini stanno **solo** in `assets/`. I file nuovi vanno nella sottocartella corrispondente.

## HTML
- Elementi semantici HTML5 (`header nav main section article footer`), un solo `<h1>` per pagina, titoli in ordine.
- `<!doctype html>`, `lang`, `meta charset`, `meta viewport`, un `<title>` unico per pagina.
- Fogli di stile con `<link rel="stylesheet" href="assets/css/<file>.css">`, immagini da `assets/img/`.
- Ogni `img` ha `alt`; ogni campo di form ha una `<label>`; i bottoni sono `<button>`, i link sono `<a href>`.
- Indentazione a 2 spazi, tag e attributi minuscoli, virgolette doppie. Niente stili inline, niente gestori di eventi inline.
- `data-testid="kebab-case"` su elementi interattivi e regioni chiave.

## CSS
- Design token come custom property su `:root` (colori, scala delle spaziature, raggi, dimensioni dei font). Mai lo stesso valore scritto due volte. Se esiste `DESIGN.md`, i token ne derivano.
- Mobile first; media query `min-width`; unità relative (`rem`, `%`, `clamp()`); flexbox/grid per il layout.
- Classi in kebab-case stile BEM (`card`, `card__title`, `card--active`). Niente ID per lo stile, niente `!important`.
- Stili `:focus-visible` visibili; rispetta `prefers-reduced-motion`; contrasto AA.
- Tema chiaro/scuro solo se lo chiede README o DESIGN.md.

## JavaScript
- **Niente `import`/`export` e niente `type="module"`.** Script classici caricati con `<script src="assets/js/<file>.js" defer></script>`, in ordine di dipendenza: prima i file di funzionalità, per ultimo `app.js`.
- Ogni file è racchiuso in una funzione che si esegue subito, `(function () { 'use strict'; ... })();`, e condivide ciò che serve solo tramite un unico oggetto globale: `const App = (window.App = window.App || {});`. Nessun'altra variabile globale.
- `const`/`let`, uguaglianza stretta, niente `var`.
- Funzioni piccole e pure; una responsabilità per file; codice DOM separato da logica e storage.
- **Seleziona gli elementi solo con `querySelector` e `querySelectorAll`**, tramite attributi `data-` o hook semantici. Mai `getElementById`, `getElementsByClassName`, `getElementsByTagName` o `getElementsByName`.
- Aggiorna il DOM con `textContent` o `createElement`, mai con `innerHTML` e dati dell'utente.
- Event delegation per le liste. Proteggiti dagli elementi mancanti.
- `try/catch` attorno a `fetch`, `JSON.parse` e `localStorage`; mostra sempre all'utente uno stato di errore comprensibile.
- Nomi: `camelCase` per funzioni e variabili, `UPPER_SNAKE` per le costanti, file in kebab-case.
- Commenti brevi, in italiano, solo per spiegare il "perché". Niente codice morto, niente `console.log` lasciati.

## Soglia di qualità
Nessun errore in console al caricamento. Funziona a 360px e a 1280px di larghezza. Usabile da tastiera.
