// Control de verificaciones en Pull Requests (P0.1).
// Lista los registros que pasan a "verificado" respecto a la rama base. Si hay alguno, el PR
// necesita la etiqueta "revision-editorial", que solo pone el responsable editorial tras revisarlos.
// Uso: node scripts/verificaciones.mjs origin/main   (REVISION_EDITORIAL=true si el PR tiene la etiqueta)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';
import { ARCHIVOS } from './datos.mjs';

const base = process.argv[2] || 'origin/main';
// Decisión 46: los partes de un canal oficial que Ernesto envía por el chat ya los verifica él al enviarlos;
// no necesitan la etiqueta. Solo los partes (`.partes[…]`) de las fuentes de site.canalesParte.<país>.fuentesParte.
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const FUENTES_PARTE = new Set(Object.values(site.canalesParte || {}).flatMap((c) => (c && c.fuentesParte) || []));
const enBase = (f) => {
  try {
    return execFileSync('git', ['show', `${base}:${f}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
const verificados = (txt, f) => {
  const s = new Set();
  if (!txt) return s;
  if (f.endsWith('.md')) {
    if (/^validacion:\s*verificado\s*$/m.test(txt)) s.add(`${f} (ficha)`);
    return s;
  }
  const recorrer = (o, ruta) => {
    if (Array.isArray(o)) return o.forEach((x, i) => recorrer(x, `${ruta}[${x?.id ?? i}]`));
    if (!o || typeof o !== 'object') return;
    if (o.validacion === 'verificado' && /\.partes\[[^\]]+\]$/.test(ruta) && FUENTES_PARTE.has(o.fuente)) return;
    if (o.validacion === 'verificado') s.add(`${f}${ruta} (${o.verificacion?.fecha || 'sin fecha'})`);
    for (const [k, v] of Object.entries(o)) recorrer(v, `${ruta}.${k}`);
  };
  recorrer(JSON.parse(txt), '');
  return s;
};
const archivos = [
  ...Object.values(ARCHIVOS).map(([f]) => `data/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'content/guia'), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => `content/guia/${f}`),
];
const nuevos = [];
for (const f of archivos) {
  const antes = verificados(enBase(f), f);
  const ahora = verificados(fs.readFileSync(path.join(ROOT, f), 'utf8'), f);
  for (const x of ahora) if (!antes.has(x)) nuevos.push(x);
}
if (!nuevos.length) {
  console.log('Verificaciones: ningún registro nuevo pasa a "verificado".');
  process.exit(0);
}
console.log(`Verificaciones nuevas respecto a ${base}:\n${nuevos.map((x) => `  - ${x}`).join('\n')}`);
if (process.env.REVISION_EDITORIAL === 'true') {
  console.log('El PR tiene la etiqueta "revision-editorial": verificaciones aceptadas.');
  process.exit(0);
}
console.log('\nERROR  Solo el responsable editorial verifica datos. Revisa estos registros y añade la etiqueta "revision-editorial" al PR.');
process.exit(1);
