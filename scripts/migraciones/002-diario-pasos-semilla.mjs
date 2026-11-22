// Reconstruye el registro diario de los pasos (data/diario-pasos-semilla.json) a partir de lo que ya está guardado:
//  - el estado de la vigilancia de cada pasada (rama datos-vigilancia, una por hora desde el 17/11/2026 20:00 UTC):
//    dice si esa pasada leyó bien la web oficial de cada paso;
//  - data/pasos.json en main justo después de esa pasada: el estado publicado del paso.
// Reglas, las mismas que el vigilante desde el 22/11/2026:
//  - solo cuentan las pasadas con lectura buena y dentro del horario del paso (hora de Argentina);
//  - solo un estado de fuente oficial; «Sin confirmar» no cuenta;
//  - un «Cerrado» publicado de noche (fuera del horario, sin motivo) que el vigilante leyó por la mañana NO es un cierre:
//    esa pasada no cuenta (fue el error de los días 17, 18 y 19/11).
// Uso: git fetch origin datos-vigilancia && node scripts/migraciones/002-diario-pasos-semilla.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { claseDia, actualizarDiario } from '../vigilante.mjs';
import { cargar } from '../fuentes-vigilancia.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ZONA = 'America/Argentina/Salta';
const diaAR = (d) => d.toLocaleDateString('sv-SE', { timeZone: ZONA });
const horaAR = (d) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA }).format(d);
const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const entre = (h, x) => aMin(h) >= aMin(x.apertura) && aMin(h) <= aMin(x.cierre);

const pasos = cargar().filas.filter((f) => f.estado === 'activa' && f.lector === 'gendarmeria-paso').map((f) => ({ paso: f.destino.slice(5), fuente: f.fuente_id }));
const pasadas = git('log', '--reverse', '--format=%H %aI', 'origin/datos-vigilancia').trim().split('\n').map((l) => l.split(' '));
const cacheMain = new Map();
const pasosEn = (iso) => {
  const sha = git('rev-list', '-1', `--before=${new Date(Date.parse(iso) + 15 * 60e3).toISOString()}`, 'origin/main').trim();
  if (!cacheMain.has(sha)) {
    const d = JSON.parse(git('show', `${sha}:data/pasos.json`));
    cacheMain.set(sha, d.pasos || d);
  }
  return cacheMain.get(sha);
};

const lecturas = [];
const descartadas = [];
for (const [sha] of pasadas) {
  let v;
  try {
    v = JSON.parse(git('show', `${sha}:vigilancia.json`));
  } catch {
    continue;
  }
  for (const { paso, fuente } of pasos) {
    const f = v.fuentes?.[fuente];
    if (!f?.ultimaLecturaBuena || f.ultimaLecturaBuena !== f.ultimoIntento) continue; // esa pasada no leyó bien
    const t = new Date(f.ultimaLecturaBuena);
    const p = pasosEn(f.ultimaLecturaBuena).find((x) => x.id === paso);
    const hc = (p?.horarios || []).find((x) => x.apertura && x.cierre);
    if (!p || !hc || !entre(horaAR(t), hc)) continue;
    const e = p.estado;
    // Cierre nocturno leído por la mañana: «Cerrado por Gendarmería (parte del 18/11, 20:19…)» sin motivo y fuera de horario.
    const m = e?.valor === 'cerrado' && !/«/.test(e.texto || '') && /parte del \d\d\/\d\d, (\d\d:\d\d)/.exec(e.texto || '');
    if (m && !entre(m[1], hc)) {
      descartadas.push(`${paso} ${diaAR(t)} ${horaAR(t)}: ${e.texto.slice(0, 80)}…`);
      continue;
    }
    const clase = claseDia(e);
    if (clase) lecturas.push({ paso, dia: diaAR(t), hora: horaAR(t), clase });
  }
}
const diario = actualizarDiario({}, lecturas, new Date(), 400);
const salida = {
  nota: 'Registro diario de los pasos reconstruido el 22/11/2026 con scripts/migraciones/002-diario-pasos-semilla.mjs a partir de las lecturas guardadas (rama datos-vigilancia) y del estado publicado en main. Desde entonces lo lleva el vigilante en el estado de la vigilancia. Clase = el peor estado del día con lectura buena dentro del horario.',
  reconstruido: new Date().toISOString(),
  pasadasRevisadas: pasadas.length,
  lecturasDescartadas: descartadas,
  pasos: diario,
};
fs.writeFileSync('data/diario-pasos-semilla.json', JSON.stringify(salida, null, 1) + '\n');
for (const [p, dias] of Object.entries(diario)) console.log(p, Object.entries(dias).map(([d, x]) => `${d.slice(5)}:${x.clase}(${x.lecturas})`).join(' '));
console.log(`Descartadas por cierre nocturno: ${descartadas.length}`);
descartadas.forEach((d) => console.log('  ' + d));
