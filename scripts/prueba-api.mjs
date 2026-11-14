// Prueba de coherencia (P0.5): la web y api/v1 muestran el mismo estado para cada paso y tramo.
// Ejecutar después de build: node scripts/prueba-api.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from './lib.mjs';

const DIST = path.join(ROOT, 'dist');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(DIST, 'api/v1', f), 'utf8'));
const fallos = [];
const indice = leer('indice.json');
for (const r of indice.recursos) {
  const f = path.join(DIST, 'api/v1', `${r.recurso}.json`);
  if (!fs.existsSync(f)) fallos.push(`falta api/v1/${r.recurso}.json`);
  else if (leer(`${r.recurso}.json`).registros.length !== r.registros) fallos.push(`${r.recurso}: el índice no cuadra con el archivo.`);
}
// Pasos: estado de la ficha de la guía (fila "Estado") frente a la API.
const rutas = readJSON('data/rutas.json');
const guiaDe = Object.fromEntries(rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).filter(Boolean).map((p) => [p.id, p.guia]));
for (const p of leer('pasos.json').registros) {
  const html = fs.readFileSync(path.join(DIST, 'guia', guiaDe[p.id], 'index.html'), 'utf8');
  const fila = html.match(/<div class="dato-estado">\s*<span class="estado estado-([a-z-]+)"/);
  if (!fila) fallos.push(`paso ${p.id}: la ficha no muestra la fila de estado.`);
  else if (fila[1] !== p.estado.mostrar.valor) fallos.push(`paso ${p.id}: la web muestra "${fila[1]}" y la API "${p.estado.mostrar.valor}".`);
  if (p.estado.mostrar.confirmado && p.estado.nivel !== 'verificado') fallos.push(`paso ${p.id}: confirmado sin verificación.`);
}
// Tramos: datos del planificador frente a la API.
const plan = fs.readFileSync(path.join(DIST, 'planificador/index.html'), 'utf8');
const datos = JSON.parse(plan.match(/<script type="application\/json" id="datos-rutas">([\s\S]*?)<\/script>/)[1]);
for (const t of leer('tramos.json').registros) {
  const w = datos.tramos.find((x) => x.id === t.id);
  if (!w) fallos.push(`tramo ${t.id}: no está en el planificador.`);
  else if (w.vista.valor !== t.estado.mostrar.valor) fallos.push(`tramo ${t.id}: el planificador muestra "${w.vista.valor}" y la API "${t.estado.mostrar.valor}".`);
  if (t.distancia.km === null && w && typeof w.km === 'number') fallos.push(`tramo ${t.id}: distancia distinta.`);
}
// Nada verificado sin verificación humana.
for (const r of indice.recursos) {
  const txt = fs.readFileSync(path.join(DIST, 'api/v1', `${r.recurso}.json`), 'utf8');
  const o = JSON.parse(txt);
  JSON.stringify(o, (k, v) => {
    if (v && typeof v === 'object' && v.nivel === 'verificado' && !v.verificacion) fallos.push(`${r.recurso}: registro con nivel verificado sin verificacion.`);
    return v;
  });
}
for (const f of fallos) console.log(`FALLO  ${f}`);
console.log(`Prueba api/v1: ${fallos.length} fallos.`);
process.exit(fallos.length ? 1 : 0);
