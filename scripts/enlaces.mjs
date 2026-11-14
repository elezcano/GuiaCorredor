// Comprueba que todos los enlaces y recursos internos de dist/ existen.
// Uso: node scripts/enlaces.mjs  (tras build; respeta BASE_PATH igual que build)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from './lib.mjs';

const DIST = path.join(ROOT, 'dist');
const site = readJSON('data/site.json');
const base = (process.env.BASE_PATH ? (process.env.BASE_PATH === '/' ? '' : process.env.BASE_PATH) : site.basePath || '').replace(/\/$/, '');
const html = [];
(function recorrer(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) recorrer(p);
    else if (f.name.endsWith('.html')) html.push(p);
  }
})(DIST);

const rotos = [];
const ids = new Map(); // archivo -> Set de ids
const idsDe = (archivo) => {
  if (!ids.has(archivo)) ids.set(archivo, new Set([...fs.readFileSync(archivo, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return ids.get(archivo);
};
const resolver = (url) => {
  let p = url.split('#')[0].split('?')[0];
  if (base && !p.startsWith(base + '/') && p !== base) return null;
  p = decodeURIComponent(p.slice(base.length)) || '/';
  const destino = path.join(DIST, p);
  if (p.endsWith('/')) return path.join(destino, 'index.html');
  if (fs.existsSync(destino) && fs.statSync(destino).isDirectory()) return path.join(destino, 'index.html');
  return destino;
};
for (const archivo of html) {
  const src = fs.readFileSync(archivo, 'utf8');
  for (const m of src.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|tel:|data:|javascript:)/.test(url)) continue;
    if (url.startsWith('#')) {
      if (url.length > 1 && !idsDe(archivo).has(url.slice(1))) rotos.push(`${path.relative(DIST, archivo)} → ${url} (ancla inexistente)`);
      continue;
    }
    if (!url.startsWith('/')) continue; // relativos de Markdown: los resuelve el navegador
    const destino = resolver(url);
    if (!destino) {
      rotos.push(`${path.relative(DIST, archivo)} → ${url} (fuera de la ruta base "${base}")`);
      continue;
    }
    if (!fs.existsSync(destino)) {
      rotos.push(`${path.relative(DIST, archivo)} → ${url}`);
      continue;
    }
    const ancla = url.split('#')[1];
    if (ancla && destino.endsWith('.html') && !idsDe(destino).has(ancla)) rotos.push(`${path.relative(DIST, archivo)} → ${url} (ancla inexistente)`);
  }
  // Enlaces relativos de las fichas (../sico/ etc.)
  for (const m of src.matchAll(/\shref="(\.\.?\/[^"#?]*)"/g)) {
    const destino = path.resolve(path.dirname(archivo), m[1]);
    const final = m[1].endsWith('/') ? path.join(destino, 'index.html') : destino;
    if (!fs.existsSync(final)) rotos.push(`${path.relative(DIST, archivo)} → ${m[1]}`);
  }
}
console.log(`${html.length} páginas revisadas, ${rotos.length} enlaces rotos.`);
rotos.forEach((r) => console.log(`ROTO  ${r}`));
process.exit(rotos.length ? 1 : 0);
