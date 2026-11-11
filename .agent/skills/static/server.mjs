// Server statico locale per i test Playwright, senza dipendenze e senza cache.
// Serve la radice del progetto (tre cartelle sopra questo file). Uso: node .agent/skills/static/server.mjs [porta]

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PORT = process.argv[2] === undefined ? 4173 : Number(process.argv[2]);

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.vtt': 'text/vtt; charset=utf-8',
  '.pdf': 'application/pdf',
};

function rispondi(res, codice, corpo, tipo = 'text/plain; charset=utf-8') {
  res.writeHead(codice, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
  res.end(corpo);
}

export function createStaticServer(root = ROOT) {
  const base = fs.realpathSync(root);
  const interno = new Set(['readme.md', 'plan.md', 'agents.md', 'design.md', 'test.md', 'db.sql', 'skill.md', 'package.json', 'package-lock.json']);
  return http.createServer(async (req, res) => {
    let percorso;
    try { percorso = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return rispondi(res, 400, 'Richiesta non valida'); }
    const parti = percorso.split(/[\\/]/).filter(Boolean);
    if (parti.some((parte) => parte.startsWith('.') || parte.toLowerCase() === 'node_modules') || interno.has(parti[0]?.toLowerCase())) return rispondi(res, 403, 'Vietato');
    try {
      let file = path.join(base, ...parti);
      if ((await fs.promises.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      file = await fs.promises.realpath(file);
      if (!file.startsWith(base + path.sep)) return rispondi(res, 403, 'Vietato');
      const relative = path.relative(base, file).split(path.sep);
      if (relative.some((parte) => parte.startsWith('.') || parte.toLowerCase() === 'node_modules') || interno.has(relative[0]?.toLowerCase())) return rispondi(res, 403, 'Vietato');
      const tipo = TIPI[path.extname(file).toLowerCase()];
      if (!tipo) return rispondi(res, 403, 'Vietato');
      rispondi(res, 200, await fs.promises.readFile(file), tipo);
    } catch {
      rispondi(res, 404, 'Non trovato');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createStaticServer();
  server.listen(PORT, '127.0.0.1', () => console.log(`server statico su http://127.0.0.1:${server.address().port} (radice: ${ROOT})`));
}
