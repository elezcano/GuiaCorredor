// Uso único (HU-134): baja los informes del MOPC de la carpeta pública de Drive a pruebas/vigilante/mopc/.
import { writeFileSync, mkdirSync } from 'node:fs';
const RAIZ = '16y2lx1eoOwn532O1F0j-g0Ye7YZj0dWD';
const DEST = 'pruebas/vigilante/mopc';
mkdirSync(DEST, { recursive: true });
const ua = { 'user-agent': 'Mozilla/5.0 GuiaCorredor' };
async function listar(id) {
  const h = await (await fetch(`https://drive.google.com/embeddedfolderview?id=${id}`, { headers: ua })).text();
  const out = [];
  const re = /<a href="(https:\/\/drive\.google\.com\/(drive\/folders|file\/d)\/([\w-]+)[^"]*)"[^>]*>[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>[\s\S]*?(?:<div class="flip-entry-last-modified"><div>([^<]*)<\/div>)?/g;
  for (const m of h.matchAll(re)) out.push({ tipo: m[2].startsWith('drive') ? 'carpeta' : 'archivo', id: m[3], nombre: m[4].replace(/&amp;/g, '&').trim(), mod: m[5] || '' });
  if (!out.length) writeFileSync(`${DEST}/listado-${id}.html`, h);
  return out;
}
const indice = [];
const raiz = await listar(RAIZ);
console.log('Raíz:', raiz.map((x) => `${x.tipo} ${x.nombre}`).join(' | '));
indice.push({ carpeta: 'raíz', entradas: raiz });
for (const c of raiz.filter((x) => x.tipo === 'carpeta' && /NOVIEMBRE|OCTUBRE/i.test(x.nombre))) {
  const arch = await listar(c.id);
  indice.push({ carpeta: c.nombre, entradas: arch });
  if (!/NOVIEMBRE/i.test(c.nombre)) continue;
  for (const a of arch.filter((x) => x.tipo === 'archivo')) {
    const r = await fetch(`https://drive.google.com/uc?export=download&id=${a.id}`, { headers: ua });
    const b = Buffer.from(await r.arrayBuffer());
    const nombre = a.nombre.replace(/[^\w .()-]/g, '_');
    writeFileSync(`${DEST}/${nombre}`, b);
    console.log(r.status, b.length, nombre, b.subarray(0, 5).toString());
  }
}
writeFileSync(`${DEST}/indice.json`, JSON.stringify(indice, null, 1));
