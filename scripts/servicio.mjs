// Cómo de fiables somos (decisión 39): métricas de nuestro propio servicio, no de la frontera.
// · Cobertura: de las horas de apertura de cada paso vigilado, cuántas tuvieron una lectura buena de la web oficial.
//   Sale del registro diario del vigilante (vigilancia.json → diario, desde el 17/11/2026).
// · Retraso: desde que Gendarmería publica un parte nuevo hasta que lo leemos. Sale del registro por ejecución
//   (lote 3, registro/AAAA-MM-DD.jsonl). Solo se da con un mínimo de muestras.
// · Errores reconocidos: la bitácora de docs/regla-estado-pasos.md (una sola fuente: no se copia).
// Puro: no lee ficheros salvo leerRegistro y leerBitacora, que reciben la ruta.
import fs from 'node:fs';
import path from 'node:path';

export const OBJETIVO_COBERTURA = 0.95;
export const VENTANA_DIAS = 30;
export const MUESTRAS_MINIMAS = 5;

const aMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const sumarDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Horas en punto dentro del horario (el vigilante pasa cada hora): 09:00–19:00 → 11. */
export const horasEsperadas = (h) => {
  if (!h?.apertura || !h?.cierre) return 0;
  let n = 0;
  for (let t = Math.ceil(aMin(h.apertura) / 60) * 60; t <= aMin(h.cierre); t += 60) n++;
  return n;
};

/**
 * Cobertura de un paso en la ventana: días completos desde el día siguiente al primero registrado (el primero empezó a
 * medias) hasta ayer. Un día sin entrada es «sin parte oficial del día» (el organismo no publicó o no lo leímos).
 */
export function cobertura(diarioPaso = {}, horario, hoy, ventana = VENTANA_DIAS) {
  const dias = Object.keys(diarioPaso).sort();
  const esperadas = horasEsperadas(horario);
  if (!dias.length || !esperadas) return null;
  const ayer = sumarDias(hoy, -1);
  const desde = [sumarDias(dias[0], 1), sumarDias(hoy, -ventana)].sort().pop();
  if (desde > ayer) return { desde, hasta: ayer, dias: 0, conParte: 0, sinParte: 0, horas: 0, cubiertas: 0, pct: null };
  let total = 0, conParte = 0, horas = 0, cubiertas = 0;
  for (let d = desde; d <= ayer; d = sumarDias(d, 1)) {
    total++;
    const e = diarioPaso[d];
    if (!e) continue;
    conParte++;
    horas += esperadas;
    cubiertas += Math.min(e.lecturas || 0, esperadas);
  }
  return { desde, hasta: ayer, dias: total, conParte, sinParte: total - conParte, horas, cubiertas, pct: horas ? cubiertas / horas : null };
}

/** Lee los JSONL del registro por ejecución (carpeta), en orden. Líneas malas se ignoran. */
export function leerRegistro(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort()
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }))
    .filter(Boolean);
}

/**
 * Retraso de lectura por paso: para cada parte nuevo de Gendarmería que aparece mientras vigilamos (no el que ya estaba
 * en la primera lectura), minutos entre la hora del parte (Argentina, UTC−3) y nuestra primera lectura que lo trae.
 */
export function retrasos(lineas, hoy, ventana = VENTANA_DIAS) {
  const desde = sumarDias(hoy, -ventana);
  const porPaso = {};
  for (const l of lineas.filter((x) => x.http === 'ok' && x.lectura?.parte && x.consultado).sort((a, b) => a.consultado.localeCompare(b.consultado))) {
    const p = (porPaso[l.paso] ||= { visto: new Set(), primero: true, muestras: [] });
    const parte = l.lectura.parte;
    if (p.visto.has(parte)) continue;
    p.visto.add(parte);
    if (p.primero) { p.primero = false; continue; }
    const [dia, hora] = parte.split(' ');
    if (dia < desde) continue;
    const min = (Date.parse(l.consultado) - Date.parse(`${dia}T${hora}:00-03:00`)) / 6e4;
    if (min >= 0 && min < 24 * 60) p.muestras.push(min);
  }
  return Object.fromEntries(
    Object.entries(porPaso).map(([id, p]) => {
      const m = [...p.muestras].sort((a, b) => a - b);
      const mediana = m.length ? (m.length % 2 ? m[(m.length - 1) / 2] : (m[m.length / 2 - 1] + m[m.length / 2]) / 2) : null;
      return [id, { muestras: m.length, mediana: m.length >= MUESTRAS_MINIMAS ? Math.round(mediana) : null }];
    })
  );
}

/** Filas de la bitácora de la regla («| Fecha | Qué pasó | Qué se decidió | PR |»), de la más reciente a la más antigua. */
export function leerBitacora(archivo) {
  const t = fs.existsSync(archivo) ? fs.readFileSync(archivo, 'utf8') : '';
  const sec = t.split(/\n## Bitácora\n/)[1] || '';
  const filas = sec
    .split('\n')
    .filter((l) => /^\|\s*\d/.test(l))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter((c) => c.length >= 4)
    .map(([fecha, paso, decision, pr]) => ({ fecha, paso, decision, pr }));
  const clave = (f) => { const m = f.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
  return filas.sort((a, b) => clave(b.fecha).localeCompare(clave(a.fecha)));
}
