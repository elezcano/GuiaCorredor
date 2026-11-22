// HU-97: fiabilidad de cada paso — cuántos días se ha cerrado (en total y solo para carga) en los
// últimos 30 y 90 días.
//
// Reglas (data/site.json → fiabilidad):
// - Solo cuentan registros VERIFICADOS del historial del paso y su estado actual. Los que siguen
//   «por verificar» no cuentan, pero se informa de cuántos hay.
// - Un registro vale para su día y se arrastra a los días siguientes hasta el próximo registro, como
//   mucho `vigenciaDias` días. Más allá, el día cuenta como «sin datos», nunca como abierto.
// - Un día con varios registros (p. ej. cierre por la mañana y reapertura por la tarde) toma el peor.
import fs from 'node:fs';
import path from 'node:path';
import { OPERATIVA, operativaDe } from './lib.mjs';

// 22/11/2026: registro diario del vigilante. Cada pasada dentro del horario del paso, con lectura buena de la web
// oficial, apunta el estado del día (el peor visto). Vive en el estado de la vigilancia (rama datos-vigilancia,
// copiada en data/vigilancia-estado.json al publicar) y, para los días anteriores, en data/diario-pasos-semilla.json
// (reconstruido de las lecturas guardadas). Es un registro verificado: sale de lecturas de la web oficial.
let DIARIO = null;
export function diarioDe(id) {
  if (!DIARIO) {
    DIARIO = {};
    for (const f of ['diario-pasos-semilla.json', 'vigilancia-estado.json']) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', f), 'utf8'));
        for (const [paso, dias] of Object.entries(d.diario || d.pasos || {})) Object.assign((DIARIO[paso] ||= {}), dias);
      } catch {}
    }
  }
  return DIARIO[id] || {};
}

const ORDEN = { cerrado: 4, carga: 3, restricciones: 2, abierto: 1 };
const sumarDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);

/** Clase de un registro: cerrado (todo el tránsito), carga (cerrado solo para carga), restricciones o abierto. */
function clase(valor, afecta) {
  if (!valor) return null;
  const op = operativaDe(valor, 'paso');
  if (op === 'cerrado') return afecta === 'carga' ? 'carga' : 'cerrado';
  if (op === 'restricciones') return 'restricciones';
  if (op === 'abierto') return 'abierto';
  return null;
}

/** Registros con estado (historial + estado actual), ordenados por fecha y hora. */
function registros(paso) {
  const lista = (paso.historial || [])
    .filter((h) => h.valor)
    .map((h) => ({ fecha: h.fecha, hora: h.hora || '12:00', clase: clase(h.valor, h.afecta), verificado: !!h.verificado, texto: h.texto }));
  // Los partes de cada organismo con estado también son observaciones de ese día.
  for (const x of paso.partes || []) if (x.valor && x.publicado) lista.push({ fecha: x.publicado, hora: x.hora || '12:00', clase: clase(x.valor, x.afecta), verificado: !!x.verificado, texto: x.texto });
  for (const [fecha, d] of Object.entries(paso.diario || diarioDe(paso.id))) if (d?.clase) lista.push({ fecha, hora: '12:00', clase: d.clase, verificado: true, texto: `Lectura diaria de la web oficial (${d.lecturas} lecturas, ${d.desde}–${d.hasta})` });
  const e = paso.estado;
  if (e?.valor && e.publicado) lista.push({ fecha: e.publicado, hora: '23:59', clase: clase(e.valor, e.afecta), verificado: !!e.verificado, texto: e.texto, actual: true });
  // El estado actual verificado también vale para el día en que se verificó.
  if (e?.valor && typeof e.verificado === 'string' && e.verificado > (e.publicado || '')) lista.push({ fecha: e.verificado, hora: '23:59', clase: clase(e.valor, e.afecta), verificado: true, texto: e.texto, actual: true });
  return lista.filter((r) => r.clase).sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? -1 : 1));
}

/** Estado de cada día de la ventana [hoy-dias+1, hoy]. */
export function diasDelPaso(paso, hoy, dias, vigenciaDias = 7) {
  const regs = registros(paso).filter((r) => r.verificado);
  // Desde que el vigilante lleva registro diario de este paso, un día sin lectura buena dentro del horario es «sin datos»:
  // no hereda el día anterior (si Gendarmería no publicó la apertura, no sabemos si abrió).
  const diasDiario = Object.keys(paso.diario || diarioDe(paso.id)).sort();
  const desdeDiario = diasDiario[0] || null;
  const salida = [];
  for (let i = dias - 1; i >= 0; i--) {
    const dia = sumarDias(hoy, -i);
    // Un día con partes propios se juzga por ellos; sin partes, hereda el último (como mucho vigenciaDias).
    const delDia = regs.filter((r) => r.fecha === dia).map((r) => r.clase);
    const previo = [...regs].reverse().find((r) => r.fecha < dia);
    if (!delDia.length && previo && diasEntre(previo.fecha, dia) <= vigenciaDias && !(desdeDiario && dia >= desdeDiario)) delDia.push(previo.clase);
    const peor = delDia.sort((a, b) => ORDEN[b] - ORDEN[a])[0] || 'sin-datos';
    salida.push({ dia, clase: peor });
  }
  return salida;
}

/** Resumen de la ventana: días de cada clase y registros pendientes de verificar en ella. */
export function fiabilidad(paso, hoy, dias, vigenciaDias = 7) {
  const lista = diasDelPaso(paso, hoy, dias, vigenciaDias);
  const cuenta = (c) => lista.filter((d) => d.clase === c).length;
  const desde = sumarDias(hoy, -(dias - 1));
  const pendientes = registros(paso).filter((r) => !r.verificado && r.fecha >= desde && r.fecha <= hoy).length;
  return {
    dias,
    desde,
    hasta: hoy,
    cerrado: cuenta('cerrado'),
    soloCarga: cuenta('carga'),
    restricciones: cuenta('restricciones'),
    abierto: cuenta('abierto'),
    sinDatos: cuenta('sin-datos'),
    pendientesDeVerificar: pendientes,
    porDia: lista,
  };
}

export const ETIQUETAS_DIA = {
  cerrado: 'No habilitado',
  carga: 'No habilitado para carga',
  restricciones: 'Con restricciones',
  abierto: 'Habilitado',
  'sin-datos': 'Sin datos',
};
export { OPERATIVA };
