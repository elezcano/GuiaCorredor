// HU-115: trazado por carretera y kilómetros de cada tramo, calculados con OSRM sobre datos de OpenStreetMap.
// Es un CÁLCULO, no un dato oficial: la web lo muestra como «calculado con OpenStreetMap», aparte de los km con fuente.
// Se ejecuta a mano desde GitHub Actions (workflow «Trazados»), que deja el resultado en una rama para revisarlo.
// Uso: node scripts/trazados.mjs   → escribe data/trazados.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON } from './lib.mjs';

const OSRM = process.env.OSRM_URL || 'https://router.project-osrm.org';
const rutas = readJSON('data/rutas.json');
const pasos = readJSON('data/pasos.json').pasos;
const nodo = Object.fromEntries(rutas.nodos.map((n) => [n.id, n.coordenadas ? { lon: n.coordenadas.lon, lat: n.coordenadas.lat } : null]));
const paso = Object.fromEntries(pasos.map((p) => [p.id, p.ubicacion?.coordenadas?.lat != null ? { lon: p.ubicacion.coordenadas.lon, lat: p.ubicacion.coordenadas.lat } : null]));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Distancia en línea recta (km), para descartar rutas absurdas (p. ej. un puente que aún no existe en OSM).
const recta = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
async function ruta(pts) {
  const url = `${OSRM}/route/v1/driving/${pts.map((p) => `${p.lon},${p.lat}`).join(';')}?overview=simplified&geometries=geojson`;
  const r = await fetch(url, { headers: { 'User-Agent': 'GuiaCorredor-trazados (+https://github.com/elezcano/GuiaCorredor)' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`OSRM ${r.status}`);
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes?.[0]) throw new Error(`OSRM ${j.code}`);
  return j.routes[0];
}
const salida = { nota: 'Cálculo de ruta por carretera con OSRM sobre datos de OpenStreetMap. No es un dato oficial.', fuente: { nombre: 'OSRM sobre datos de OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', licencia: 'ODbL' }, generado: new Date().toISOString().slice(0, 10), tramos: {}, descartados: {} };
for (const t of rutas.tramos) {
  for (const via of t.alternativa ? [t.paso, t.alternativa] : [t.paso || null]) {
    const clave = `${t.id}${via ? `@${via.id}` : ''}`;
    const pts = [nodo[t.desde], ...(via && paso[via.id] ? [paso[via.id]] : []), nodo[t.hasta]];
    if (pts.some((p) => !p)) {
      salida.descartados[clave] = 'faltan coordenadas con fuente';
      continue;
    }
    try {
      const r = await ruta(pts);
      const km = Math.round(r.distance / 100) / 10;
      const directa = pts.slice(1).reduce((s, p, i) => s + recta(pts[i], p), 0);
      const oficial = typeof t.km === 'number' && t.kmTipo === 'fuente' ? t.km : null; // solo km publicados tal cual, no restas ni cálculos
      if (oficial && Math.abs(km - oficial) / oficial > 0.15) {
        salida.descartados[clave] = `ruta de ${km} km frente a ${oficial} km con fuente: no cuadra (rodeo por una carretera aún no trazada en OpenStreetMap o puntos distintos); manda el dato con fuente`;
      } else if (km > Math.max(3 * directa, directa + 150)) {
        salida.descartados[clave] = `ruta de ${km} km para ${Math.round(directa)} km en línea recta: probablemente da un rodeo (camino aún no abierto en OpenStreetMap)`;
      } else {
        salida.tramos[clave] = { km, geometria: r.geometry.coordinates.map(([lo, la]) => [Math.round(lo * 1e4) / 1e4, Math.round(la * 1e4) / 1e4]) };
      }
      console.log(`${clave}: ${salida.tramos[clave] ? `${km} km` : salida.descartados[clave]}`);
    } catch (e) {
      salida.descartados[clave] = `error: ${e.message}`;
      console.log(`${clave}: ${e.message}`);
    }
    await espera(1100); // servidor de demostración de OSRM: como mucho una petición por segundo
  }
}
fs.writeFileSync(path.join(ROOT, 'data', 'trazados.json'), JSON.stringify(salida, null, 1) + '\n');
console.log(`Listo: ${Object.keys(salida.tramos).length} trazados, ${Object.keys(salida.descartados).length} descartados.`);
