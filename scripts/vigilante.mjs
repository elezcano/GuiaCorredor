// Vigilante de webs oficiales (HU-77).
//
// Lee la página oficial de cada paso del Ministerio de Seguridad de Argentina y la hora de
// «última actualización» de cada organismo (Gendarmería Nacional, Vialidad Nacional). Si es más
// reciente que el último parte cargado en data/pasos.json → partes, abre (o completa) una incidencia
// en GitHub asignada al responsable editorial, que recibe el aviso por correo.
//
// HU-129: guarda en la rama «datos-vigilancia» (vigilancia.json) cuándo leyó bien cada fuente por última
// vez. Si una fuente falla 3 pasadas seguidas, abre un aviso: el vigilante está ciego con esa fuente.
//
// HU-130 (decisión 22): lo leído de la web oficial se publica al momento, sin esperar confirmación.
// La página trae escrito por el servidor el estado que pone Gendarmería (estadoPrioridad), el de
// Vialidad (estadoVialidad), el horario (fechaSchema) y el recuadro «Atención». La etiqueta
// «Abierto/Cerrado» y la cuenta atrás que se ven en pantalla las calcula el navegador con la hora del
// dispositivo: no se usan. Reglas:
//   1. Hora de Argentina siempre (America/Argentina/Salta).
//   2. «Cerrado» de Gendarmería fuera del horario es el cierre de cada noche: no es una incidencia.
//      Dentro del horario (o con el parte publicado dentro del horario) es un cierre: se publica en rojo.
//   3. Nunca marcha atrás: si la web sirve una copia más antigua que lo publicado, se descarta.
//   4. Vialidad «Restringida» o «Corte total» con el paso abierto: con restricciones (ámbar).
//   5. El vigilante solo reabre lo que él mismo cerró; lo cargado a mano lo revisa el responsable.
//
// Uso:
//   node scripts/vigilante.mjs                 lee las páginas y muestra qué avisaría (sin tocar GitHub)
//   node scripts/vigilante.mjs --github        además abre o completa las incidencias (necesita GITHUB_TOKEN)
//   node scripts/vigilante.mjs --escribir      HU-130: escribe en data/pasos.json lo leído y deja el resumen
//                                              en VIGILANCIA_CAMBIOS (el flujo lo comprueba, publica y avisa)
//   node scripts/vigilante.mjs --github --avisar-publicado   avisa de lo publicado (lee VIGILANCIA_CAMBIOS)
//   node scripts/vigilante.mjs --github --prueba   abre una incidencia de prueba con lo leído, para comprobar el correo
//   node scripts/vigilante.mjs --autoprueba    comprueba el lector con un ejemplo, sin red
import fs from 'node:fs';
import { aplicar, antiguedadHoras, CHILE, CORRESPONDENCIAS, configTablaAR, incidenciaAR, incidenciaCL, kmALinea, leerAR, leerCL } from './carreteras.mjs';
import { cargar as cargarCSV, configuracion, parseCSV, validar } from './fuentes-vigilancia.mjs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { CARPETA_MOPC, FUENTE_MOPC, PAGINA_MOPC, archivoMOPC, candidatosMOPC, carpetaDelMes, incidenciasMOPC, leerInformeMOPC, listadoDrive, masReciente, mopcAtrasado } from './mopc.mjs';
import { DIAS_ALERTA_ABIERTA, FUENTE_DNIT, PAGINA_DNIT, alertaDNIT, clasificarDNIT, incidenciasDNIT, listaDNIT, rodoviasDe } from './dnit.mjs';

// HU-136: las páginas de pasos que se leen salen del CSV de fuentes (filas «activa» con lector gendarmeria-paso).
const PAGINAS = configuracion().pasosAR;
// Organismos que publican partes en esas páginas. El SMN (clima) queda fuera hasta la fase de clima (#69).
const ORGANISMOS = ['Gendarmería Nacional', 'Vialidad Nacional'];
const DESFASE_AR = '-03:00'; // Argentina no aplica horario de verano.
const ETIQUETA = 'vigilante';

const args = new Set(process.argv.slice(2));
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Texto plano de una página HTML: sin etiquetas, scripts ni entidades comunes. */
export function textoPlano(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** «Gendarmería Nacional (última actualización 15/11/2026 - 09:50 h)» → { emisor, instante } */
export function leerActualizaciones(html) {
  const t = textoPlano(html);
  const res = [];
  for (const emisor of ORGANISMOS) {
    const re = new RegExp(`${emisor}\\s*\\(\\s*[úu]ltima actualizaci[óo]n\\s*(\\d{1,2})/(\\d{1,2})/(\\d{4})\\s*-\\s*(\\d{1,2}):(\\d{2})\\s*h?\\s*\\)`, 'i');
    const m = t.match(re);
    if (m) {
      const [, d, mes, a, h, min] = m;
      const dia = `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
      const hora = `${h.padStart(2, '0')}:${min}`;
      res.push({ emisor, dia, hora, instante: new Date(`${dia}T${hora}:00${DESFASE_AR}`) });
    }
  }
  return res;
}

// ---------- HU-130: lo que publica el servidor en la página oficial ----------
const varJS = (html, nombre) => html.match(new RegExp(`var\\s+${nombre}\\s*=\\s*(['"])(.*?)\\1\\s*;`))?.[2] ?? null;

/** Recuadro «Atención»: [{ emisor, texto }]. «<b>Vialidad Nacional informa:</b> RN 52 …» y los párrafos que le siguen. */
export function leerAtencion(html) {
  const i = html.search(/>\s*Atenci(?:ó|&oacute;)n\s*<\/p>/i);
  if (i < 0) return [];
  const fin = html.indexOf('divisor', i);
  const bloque = html.slice(i, fin > i ? fin : i + 4000);
  const res = [];
  for (const [, p] of bloque.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const em = p.match(/<span[^>]*fw-bold[^>]*>\s*([^<]+?)\s+informa:?\s*<\/span>/i);
    const texto = textoPlano(p.replace(/<span[^>]*fw-bold[^>]*>[\s\S]*?<\/span>/i, '')).trim();
    if (em) res.push({ emisor: textoPlano(em[1]).trim(), texto });
    else if (texto && res.length && !/^Atenci[óo]n$/i.test(texto)) res[res.length - 1].texto += `. ${texto}`;
  }
  return res.map((a) => ({ ...a, texto: a.texto.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim() })).filter((a) => a.texto);
}

/** Todo lo que el vigilante usa de la página oficial de un paso. null en estado = la página ha cambiado de formato. */
export function leerPagina(html) {
  const horarioCrudo = varJS(html, 'fechaSchema');
  const m = horarioCrudo?.match(/^\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/);
  return {
    estado: varJS(html, 'estadoPrioridad')?.toUpperCase() || null, // ABIERTO | CERRADO (lo pone Gendarmería)
    vialidad: varJS(html, 'estadoVialidad')?.toUpperCase() || null, // HABILITADA | RESTRINGIDA | CORTE TOTAL | ''
    horario: m ? { apertura: m[1], cierre: m[2] } : null,
    horarioCrudo,
    atencion: leerAtencion(html),
    actualizaciones: leerActualizaciones(html),
  };
}

const ZONA_AR = 'America/Argentina/Salta';
const diaAR = (d) => d.toLocaleDateString('sv-SE', { timeZone: ZONA_AR });
const horaAR = (d) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_AR }).format(d);
const entre = (hhmm, h) => !!h && aMin(hhmm) >= aMin(h.apertura) && aMin(hhmm) <= aMin(h.cierre);
const fechaCortaAR = (dia) => dia.split('-').slice(1).reverse().join('/');

function sello(fuente, ahora, que) {
  return {
    fuente,
    publicado: null,
    actualizado: diaAR(ahora),
    evidencia: 'oficial',
    validacion: 'verificado',
    verificacion: { verificadoPor: 'vigilante', rol: 'vigilante', fecha: diaAR(ahora), alcance: `Leído automáticamente de la web oficial el ${fechaCortaAR(diaAR(ahora))} a las ${horaAR(ahora)} (hora de Argentina): ${que}.` },
  };
}
const aHistorial = (e) => ({ fecha: e.publicado, valor: e.valor, texto: e.texto, fuente: e.fuente, publicado: e.publicado, actualizado: e.actualizado, evidencia: e.evidencia, validacion: e.validacion, verificacion: e.verificacion });

/**
 * HU-130. Decide qué publicar en un paso a partir de lo leído. Puro: devuelve { paso, cambios, avisos }
 * sin tocar el original. cambios = lo publicado; avisos = lo que el responsable debe mirar.
 */
export function decidir(original, lectura, fuente, ahora = new Date()) {
  const paso = structuredClone(original);
  const cambios = [];
  const avisos = [];
  const partes = (paso.partes ||= []);
  const gen = lectura.actualizaciones.find((a) => a.emisor === 'Gendarmería Nacional');
  const vial = lectura.actualizaciones.find((a) => a.emisor === 'Vialidad Nacional');
  const horario = lectura.horario || (paso.horarios || []).find((x) => x.apertura && x.cierre) || null;
  const horTxt = horario ? `${horario.apertura}–${horario.cierre}` : null;
  const cargadoG = ultimoParte(paso, 'Gendarmería');
  const cargadoV = ultimoParte(paso, 'Vialidad');

  // Regla 3: una copia más antigua que lo publicado no cuenta (el servidor oficial a veces sirve copias viejas).
  if (gen && cargadoG && gen.instante < cargadoG.instante) {
    avisos.push(`copia antigua de la web (Gendarmería ${fmt(gen.dia, gen.hora)}; publicado ${fmt(cargadoG.publicado, cargadoG.hora)}): descartada`);
    return { paso: original, cambios, avisos, descartada: true };
  }
  if (!lectura.estado) {
    avisos.push('la página no trae el estado de Gendarmería (¿ha cambiado de formato?): no se publica nada');
    return { paso: original, cambios, avisos };
  }
  const cerradoGendarmeria = lectura.estado === 'CERRADO';
  // Regla 2: cierre real si Gendarmería lo marca dentro del horario (ahora, o al publicar su parte).
  const cierre = cerradoGendarmeria && (!horario || entre(horaAR(ahora), horario) || (gen && entre(gen.hora, horario)));
  const restringida = ['RESTRINGIDA', 'CORTE TOTAL'].includes(lectura.vialidad);
  const quitar = (emisor) => {
    for (let k = partes.length - 1; k >= 0; k--) if (partes[k].lado === 'AR' && partes[k].emisor.startsWith(emisor)) partes.splice(k, 1);
  };
  const textoGen = () =>
    cierre
      ? 'Cerrado por Gendarmería: la web oficial marca el paso cerrado dentro de su horario, sin motivo publicado.'
      : cerradoGendarmeria
        ? `Cierre de la jornada (fuera del horario ${horTxt}, hora de Argentina).`
        : horTxt
          ? `Abierto, horario ${horTxt} (hora de Argentina).`
          : `Abierto. Horario publicado: ${lectura.horarioCrudo || 'sin horario'}.`;
  const valorGen = () => (cierre ? 'cerrado' : cerradoGendarmeria ? null : 'operativo');

  // Partes: solo cuando el organismo publica una actualización más reciente que la cargada.
  if (gen && (!cargadoG || gen.instante > cargadoG.instante)) {
    quitar('Gendarmería');
    partes.push({ lado: 'AR', emisor: 'Gendarmería Nacional', organismo: 'ar-pasos', valor: valorGen(), texto: textoGen(), hora: gen.hora, ...sello(fuente, ahora, `estado de Gendarmería «${lectura.estado}», horario ${lectura.horarioCrudo}`), publicado: gen.dia });
    cambios.push(`Gendarmería (${fmt(gen.dia, gen.hora)}): ${textoGen()}`);
  }
  if (vial && (!cargadoV || vial.instante > cargadoV.instante)) {
    const at = lectura.atencion.filter((a) => /vialidad/i.test(a.emisor)).map((a) => a.texto).join('. ');
    const valor = lectura.vialidad === 'CORTE TOTAL' ? 'cerrado' : lectura.vialidad === 'RESTRINGIDA' ? 'restricciones' : null;
    const etiqueta = { 'CORTE TOTAL': 'Corte total', RESTRINGIDA: 'Circulación restringida' }[lectura.vialidad];
    const texto = [etiqueta, at].filter(Boolean).join(': ') || `Ruta ${(lectura.vialidad || 'sin estado').toLowerCase()} según Vialidad Nacional; la web oficial no da más detalle.`;
    quitar('Vialidad');
    partes.push({ lado: 'AR', emisor: 'Vialidad Nacional', valor, texto: /[.!?]$/.test(texto) ? texto : texto + '.', hora: vial.hora, ...sello(fuente, ahora, `aviso de Vialidad «${lectura.vialidad || 'sin estado'}»${at ? `: ${at}` : ''}`), publicado: vial.dia });
    cambios.push(`Vialidad Nacional (${fmt(vial.dia, vial.hora)}): ${texto}`);
  }
  // Si el cierre llega con un parte ya cargado (p. ej. publicado antes de abrir), se rehace ese parte.
  const pg = partes.find((x) => x.lado === 'AR' && x.emisor.startsWith('Gendarmería'));
  if (cierre && pg && pg.valor !== 'cerrado' && gen && pg.hora === gen.hora && pg.publicado === gen.dia) Object.assign(pg, { valor: 'cerrado', texto: textoGen(), ...sello(fuente, ahora, 'estado de Gendarmería «CERRADO» dentro del horario'), publicado: gen.dia });

  // Estado del paso.
  const e = paso.estado;
  const delVigilante = e?.verificacion?.verificadoPor === 'vigilante';
  const cuando = gen ? `parte del ${fechaCortaAR(gen.dia)}, ${gen.hora}` : 'sin hora de parte';
  const nuevoEstado = (valor, texto) => {
    (paso.historial ||= []).push(aHistorial(e));
    paso.estado = { valor, texto, ...sello(fuente, ahora, `estado de Gendarmería «${lectura.estado}», Vialidad «${lectura.vialidad || '—'}»`), publicado: gen?.dia || diaAR(ahora) };
    cambios.push(`Estado del paso: ${texto}`);
  };
  if (cierre && e.valor !== 'cerrado') {
    nuevoEstado('cerrado', `Cerrado por Gendarmería (${cuando}, hora de Argentina): la web oficial lo marca cerrado dentro de su horario${horTxt ? ` (${horTxt})` : ''}, sin motivo publicado.`);
  } else if (!cerradoGendarmeria && restringida && e.valor === 'operativo') {
    const at = lectura.atencion.map((a) => `${a.emisor}: ${a.texto}`).join('. ');
    nuevoEstado('restricciones', `Abierto${horTxt ? ` de ${horTxt}` : ''} (hora de Argentina), con ${lectura.vialidad === 'CORTE TOTAL' ? 'corte total' : 'circulación restringida'} según Vialidad Nacional${at ? `. ${at}` : ''}.`);
  } else if (!cerradoGendarmeria && !restringida && ['cerrado', 'restricciones'].includes(e.valor)) {
    if (delVigilante) nuevoEstado('operativo', `Abierto${horTxt ? ` de ${horTxt}` : ''} (hora de Argentina), según Gendarmería (${cuando}).`);
    // Unas restricciones cargadas a mano suelen ser estructurales (un puente, la carga): no se avisan a diario.
    else if (e.valor === 'cerrado') avisos.push('la web oficial lo da abierto, pero en la Guía está «cerrado» cargado a mano: revísalo (el vigilante solo reabre lo que cerró él)');
  }
  // El horario cambia: se avisa (el horario estructurado del paso lo revisa el responsable).
  const hc = (paso.horarios || []).find((x) => x.apertura && x.cierre);
  if (lectura.horario && hc && (hc.apertura !== lectura.horario.apertura || hc.cierre !== lectura.horario.cierre))
    avisos.push(`la web oficial publica horario ${lectura.horario.apertura}–${lectura.horario.cierre} y la Guía tiene ${hc.apertura}–${hc.cierre}`);
  return { paso: cambios.length ? paso : original, cambios, avisos };
}

function autoprueba() {
  let fallos = 0;
  const ok = (cond, msg) => {
    console.log(`${cond ? '✓' : '✗'} Vigilante: ${msg}`);
    if (!cond) fallos++;
  };
  const ejemplo = `<h2>Información provista por</h2><ul>
    <li>Gendarmería Nacional <span>(última actualización 15/11/2026 - 09:50 h)</span></li>
    <li>Vialidad&nbsp;Nacional (&uacute;ltima actualizaci&oacute;n 12/11/2026 - 8:30 h)</li>
    <li>Servicio Meteorológico Nacional (última actualización 15/11/2026 - 15:00 h)</li></ul>`;
  const r = leerActualizaciones(ejemplo);
  ok(r.length === 2 && r[0].dia === '2026-11-15' && r[0].hora === '09:50' && r[0].instante.toISOString() === '2026-11-15T12:50:00.000Z' && r[1].emisor === 'Vialidad Nacional' && r[1].hora === '08:30', 'el lector entiende «Información provista por».');
  const paso0 = { horarios: [{ apertura: '09:00', cierre: '19:15', zona: 'America/Argentina/Jujuy' }] };
  ok(dentroDeHorario(paso0, new Date('2026-11-17T12:30:00Z')).dentro && !dentroDeHorario(paso0, new Date('2026-11-17T07:21:00Z')).dentro && !dentroDeHorario(paso0, new Date('2026-11-17T23:30:00Z')).dentro && dentroDeHorario({ horarios: [] }).dentro, 'el horario se mira en hora de Argentina.');
  let e = {};
  const t0 = new Date('2026-11-17T12:00:00Z');
  for (let k = 0; k < 4; k++) e = actualizarEstado(e, [{ fuente: 'f', nombre: 'F', url: 'u', ok: k === 0, error: k ? 'HTTP 500' : null }], new Date(t0.getTime() + k * 36e5));
  ok(e.fuentes.f.fallosSeguidos === 3 && e.fuentes.f.ultimaLecturaBuena === '2026-11-17T12:00:00.000Z' && fuentesCiegas(e).length === 1 && fuentesCiegas(actualizarEstado(e, [{ fuente: 'f', ok: false, error: 'x' }])).length === 0, 'el estado avisa una vez al tercer fallo seguido.');

  // HU-130: páginas oficiales guardadas el 17/11/2026 (pruebas/vigilante/).
  const pag = (n) => fs.readFileSync(new URL(`../pruebas/vigilante/${n}-2026-11-17.html`, import.meta.url), 'utf8');
  const jama = leerPagina(pag('jama'));
  ok(jama.estado === 'ABIERTO' && jama.vialidad === 'HABILITADA' && jama.horario?.apertura === '09:00' && jama.horario?.cierre === '19:15', 'Jama: estado de Gendarmería, de Vialidad y horario.');
  ok(jama.atencion.length === 1 && jama.atencion[0].emisor === 'Vialidad Nacional' && jama.atencion[0].texto === 'RN 52 tramo Susques - Lte. con Chile', `Jama: recuadro «Atención» (${JSON.stringify(jama.atencion)}).`);
  const sico = leerPagina(pag('sico'));
  ok(sico.atencion[0]?.texto === 'RN 51 tramo San Antonio De Los Cobres - Paso De Sico. Transitar con precaución maquinas trabjando en badenes con material' && sico.horario?.cierre === '19:00', `Sico: aviso de Vialidad con su detalle (${JSON.stringify(sico.atencion)}).`);
  const ph = leerPagina(pag('pozo-hondo'));
  ok(ph.estado === 'ABIERTO' && ph.vialidad === null && ph.atencion.length === 0 && ph.horario?.apertura === '07:00' && ph.actualizaciones.length === 1, 'Misión La Paz: sin Vialidad ni «Atención».');
  ok(leerPagina('<html>otra cosa</html>').estado === null, 'una página con otro formato no da estado.');

  // Decisiones, sobre un paso de ejemplo (no sobre los datos reales, que cambian).
  const parte = (emisor, hora, valor = 'operativo') => ({ lado: 'AR', emisor, valor, texto: 'x', hora, fuente: 'f', publicado: '2026-11-17', actualizado: '2026-11-17', evidencia: 'oficial', validacion: 'verificado', verificacion: null });
  const base = {
    id: 'jama', horarios: [{ apertura: '09:00', cierre: '19:15', zona: 'America/Argentina/Jujuy' }],
    estado: { valor: 'operativo', texto: 'Abierto', fuente: 'f', publicado: '2026-11-17', actualizado: '2026-11-17', evidencia: 'oficial', validacion: 'verificado', verificacion: null },
    partes: [parte('Gendarmería Nacional', '16:13'), parte('Vialidad Nacional', '09:00', null), { ...parte('Unidad de Pasos Fronterizos de Chile', '18:25', 'cerrado'), lado: 'CL' }],
    historial: [],
  };
  const conPag = (cambios) => {
    let h = pag('jama');
    for (const [a, b] of cambios) h = h.replace(a, b);
    return leerPagina(h);
  };
  const A = (hhmm) => new Date(`2026-11-17T${hhmm}:00-03:00`);
  let d = decidir(base, jama, 'f', A('17:00'));
  ok(d.cambios.length === 0 && d.paso === base, 'sin partes nuevos no publica nada.');
  const cerrado = conPag([['"ABIERTO"', '"CERRADO"'], ['17/11/2026 - 16:13', '17/11/2026 - 17:30']]);
  d = decidir(base, cerrado, 'f', A('17:40'));
  const pg = d.paso.partes.find((x) => x.emisor.startsWith('Gend'));
  ok(d.paso.estado.valor === 'cerrado' && pg.valor === 'cerrado' && pg.hora === '17:30' && d.paso.estado.verificacion.verificadoPor === 'vigilante' && d.paso.historial.length === 1 && d.paso.partes.some((x) => x.lado === 'CL'), '«Cerrado» de Gendarmería dentro del horario: se publica el cierre.');
  ok(base.estado.valor === 'operativo' && base.partes[0].hora === '16:13', 'decidir no toca el paso original.');
  const cerradoDespues = d.paso;
  const noche = conPag([['"ABIERTO"', '"CERRADO"'], ['17/11/2026 - 16:13', '17/11/2026 - 19:40']]);
  d = decidir(base, noche, 'f', A('19:50'));
  ok(d.paso.estado.valor === 'operativo' && d.paso.partes.find((x) => x.emisor.startsWith('Gend')).valor === null, '«Cerrado» fuera del horario es el cierre de cada noche: no cambia el estado.');
  d = decidir(d.paso, noche, 'f', new Date('2026-11-18T09:20:00-03:00'));
  ok(d.paso.estado.valor === 'cerrado', 'si a la hora de abrir sigue «Cerrado», ya es un cierre.');
  const vieja = conPag([['17/11/2026 - 16:13', '17/11/2026 - 15:00']]);
  d = decidir(base, vieja, 'f', A('17:00'));
  ok(d.descartada && d.paso === base, 'nunca marcha atrás: una copia más antigua se descarta.');
  const reabre = conPag([['17/11/2026 - 16:13', '17/11/2026 - 18:00']]);
  d = decidir(cerradoDespues, reabre, 'f', A('18:05'));
  ok(d.paso.estado.valor === 'operativo' && d.paso.historial.length === 2, 'el vigilante reabre lo que él cerró.');
  const manual = { ...base, estado: { ...base.estado, valor: 'cerrado' } };
  d = decidir(manual, reabre, 'f', A('18:05'));
  ok(d.paso.estado.valor === 'cerrado' && d.avisos.some((a) => /cargado a mano/.test(a)), 'lo cerrado a mano no lo reabre: avisa.');
  const corte = conPag([['"HABILITADA"', '"CORTE TOTAL"'], ['17/11/2026 - 9:00', '17/11/2026 - 17:10']]);
  d = decidir(base, corte, 'f', A('17:15'));
  const pv = d.paso.partes.find((x) => x.emisor.startsWith('Vial'));
  ok(d.paso.estado.valor === 'restricciones' && pv.valor === 'cerrado' && pv.texto === 'Corte total: RN 52 tramo Susques - Lte. con Chile.', `corte total de Vialidad con el paso abierto: con restricciones (${pv.texto}).`);
  const otroHorario = conPag([["'09:00-19:15'", "'08:00-20:00'"]]);
  ok(decidir(base, otroHorario, 'f', A('17:00')).avisos.some((a) => /08:00–20:00/.test(a)), 'un cambio de horario se avisa.');

  // HU-130 fase 2: carreteras, con las copias de las fuentes del 17/11/2026.
  const fx = (n) => JSON.parse(fs.readFileSync(new URL(`../pruebas/vigilante/${n}-2026-11-17.json`, import.meta.url), 'utf8'));
  const ar = fx('vialidad-ar');
  const incAR = leerAR(ar).map((r) => incidenciaAR(r, 'ar')).filter(Boolean);
  const lipan = incAR.find((i) => /Cuesta de Lipan/.test(i.descripcion));
  ok(incAR.length === 9 && incAR.every((i) => i.gravedad === 'info') && new Set(incAR.map((i) => i.id)).size === 9, `Vialidad Nacional: 9 avisos informativos en las rutas del corredor (${incAR.length}).`);
  ok(lipan?.paso === 'jama' && lipan.descripcion.startsWith('RN 52 (Purmamarca - Emp. RP 79): Circular con extrema precaución') && lipan.horaFuente === '2026-11-17T12:00:00.000Z', `RN 52, Cuesta de Lipán: en la variante por Jama, con hora de la fuente (${lipan?.descripcion?.slice(0, 60)}).`);
  ok(incAR.filter((i) => i.paso === 'sico').length === 3 && incAR.filter((i) => i.tramos?.[0] === 'pozo-hondo').length === 5, 'RN 51 → Sico; RN 34 → Pozo Hondo.');
  const arCorte = structuredClone(ar);
  arCorte.values.find((r) => r[1] === '52' && /Susques - Lte/.test(r[2]))[3] = "<span class='label'>CORTE TOTAL</span>";
  const corteAR = leerAR(arCorte).map((r) => incidenciaAR(r, 'ar')).filter(Boolean).find((i) => /Susques/.test(i.ubicacion));
  ok(corteAR?.gravedad === 'rojo' && corteAR.tipo === 'corte' && corteAR.paso === 'jama', 'corte total de Vialidad Nacional: rojo.');
  let cambiada = false;
  try {
    leerAR({ values: [['a', 'b'], ['c']] });
  } catch {
    cambiada = true;
  }
  ok(cambiada, 'si la tabla cambia de columnas, la lectura falla (no se publica nada).');
  const cfg = configTablaAR(`ponchoTable({"hojaNombre":"tablavisible","idSpread":"17AqjqeNvM4nG6cOUsUFKFaKXMiNmztYfzHIxeM9FcXk"})`, 'gapi_key:"AIzaSyCq2wEEKL9-6RmX-TkW23qJsrmnFHFf5tY",gapi_uri');
  ok(cfg.hoja?.startsWith('17Aq') && cfg.pestana === 'tablavisible' && cfg.clave?.startsWith('AIza'), 'la hoja, la pestaña y la clave se leen de la página oficial.');
  const trazados = JSON.parse(fs.readFileSync(new URL('../data/trazados.json', import.meta.url), 'utf8')).tramos;
  const ahoraCL = new Date('2026-11-17T21:00:00Z');
  const cl = fx('vialidad-cl');
  const incCL = leerCL(cl, trazados).map((x) => incidenciaCL(x, 'cl', ahoraCL));
  ok(cl.features.length === 14 && incCL.length === 2 && incCL.every((i) => i.tramos?.[0] === 'calama-iquique'), `Vialidad Chile: de 14 emergencias en Tarapacá y Antofagasta, 2 caen sobre el corredor (ramal de Iquique: Ruta 1 y Ruta 16) (${incCL.map((i) => i.tramo).join(', ')}).`);
  ok(incCL.every((i) => i.gravedad === 'ambar' && /puede estar ya resuelto/.test(i.descripcion)), 'cortes sin novedades de Vialidad en más de 14 días: ámbar y «confírmalo», no bloquean.');
  ok(!leerCL(cl, trazados).some((x) => /^[A-Z]{1,2}-\d/.test(x.a.ROL)), 'los caminos secundarios que salen de la ruta (A-750, A-730…) no cuentan aunque estén a menos de 3 km.');
  const enJama = trazados['andes@jama'].geometria.find(([lon]) => lon < -67.6);
  const emerg = (extra) => ({ features: [{ geometry: { x: enJama[0] + 0.01, y: enJama[1] }, attributes: { OBJECTID: 1, CORRELATIVO: '62X', ROL: '27-CH', NOMBRE_CAMINO: 'San Pedro de Atacama - Paso Jama', KM_INICIO_SEGMENTO: 100, KM_FIN_SEGMENTO: 120, TRANSITO: 'Parcialmente Operativo', RESTRICCION: null, RESUMEN_EMERGENCIA: 'Nieve en calzada', FECHA_EMERGENCIA: Date.parse('2026-11-16T10:00:00Z'), FECHA: Date.parse('2026-11-16T15:00:00Z'), last_edited_date: Date.parse('2026-11-16T15:00:00Z'), ...extra } }] });
  const uno = (extra) => incidenciaCL(leerCL(emerg(extra), trazados)[0], 'cl', ahoraCL);
  const peso = uno({ RESTRICCION: 'Peso Restringido' });
  ok(peso.paso === 'jama' && peso.gravedad === 'rojo' && peso.afecta === 'carga' && peso.tipo === 'peso' && /^27-CH \(km 100–120\): No habilitado para carga/.test(peso.descripcion), `«Peso restringido» reciente junto al trazado de Jama: no habilitado para carga (${peso.descripcion.slice(0, 70)}).`);
  ok(uno({}).gravedad === 'ambar' && uno({ TRANSITO: 'No Operativo' }).gravedad === 'rojo', 'reciente: parcialmente operativo, ámbar; no operativo, rojo.');
  ok(leerCL(emerg({ ROL: 'B-241' }), trazados).length === 0 && leerCL({ features: [{ ...emerg({}).features[0], geometry: { x: -70.4, y: -25.4 } }] }, trazados).length === 0, 'un camino secundario, o una ruta lejos del trazado, no se asigna.');
  ok(kmALinea([0.01, 0], [[0, -1], [0, 1]]) > 1.0 && kmALinea([0.01, 0], [[0, -1], [0, 1]]) < 1.2, 'distancia punto–trazado en km.');
  // Aplicar sobre data/incidencias.json.
  const aMano = { id: incAR[0].id, descripcion: 'a mano', estado: 'activa', fuente: 'ar', verificacion: null };
  const t1 = new Date('2026-11-17T20:00:00Z');
  let r1 = aplicar([aMano], incAR, 'ar', t1);
  ok(r1.cambios.length === 8 && r1.incidencias.find((i) => i.id === aMano.id).descripcion === 'a mano', 'publica los avisos nuevos y no toca lo cargado a mano.');
  ok(r1.incidencias.filter((i) => i.verificacion?.verificadoPor === 'vigilante').length === 8, 'lo publicado va firmado por el vigilante.');
  ok(aplicar(r1.incidencias, incAR, 'ar', t1).cambios.length === 0, 'releer lo mismo no cambia nada.');
  const r2a = aplicar(r1.incidencias, incAR.slice(0, 5), 'ar', t1);
  ok(r2a.cambios.length === 0 && r2a.tocado && r2a.incidencias.filter((i) => i.estado === 'activa' && i.ausencias === 1).length === 4, 'una sola lectura sin el aviso no lo retira (puede ser una lectura a medias).');
  ok(aplicar(r2a.incidencias, incAR, 'ar', t1).incidencias.every((i) => !i.ausencias), 'si vuelve a aparecer, se olvida la ausencia.');
  const r2 = aplicar(r2a.incidencias, incAR.slice(0, 5), 'ar', t1);
  ok(r2.cambios.filter((c) => c.startsWith('Resuelto')).length === 4 && r2.incidencias.filter((i) => i.estado === 'resuelta').length === 4, 'lo que la fuente deja de listar en dos pasadas seguidas se da por resuelto.');
  let vacia = false;
  try {
    leerCL({ features: [] }, trazados);
  } catch {
    vacia = true;
  }
  ok(vacia, 'una capa de Chile vacía es un fallo de lectura, no «sin incidencias».');
  const viejas = incAR.map((i) => ({ ...i, descripcion: 'otra', horaFuente: '2026-11-10T12:00:00.000Z' }));
  ok(aplicar(r1.incidencias, viejas, 'ar', t1).descartada === true, 'nunca marcha atrás: una copia más antigua de la fuente se descarta.');
  ok(aplicar(r2.incidencias, incAR, 'ar', new Date('2026-12-20T12:00:00Z')).incidencias.filter((i) => i.estado === 'resuelta').length === 0, 'las resueltas se retiran a los 15 días.');

  // HU-134: informe diario del MOPC, con las copias del 17 y el 18/11/2026.
  const tx = (n) => fs.readFileSync(new URL(`../pruebas/vigilante/mopc-${n}.txt`, import.meta.url), 'utf8');
  const m17 = leerInformeMOPC(tx('2026-11-17'));
  ok(m17.dia === '2026-11-17' && m17.hora === '07:00' && m17.instante === '2026-11-17T10:00:00.000Z', `MOPC: fecha y hora del informe (${m17.dia} ${m17.hora}).`);
  ok(m17.puentes.length === 13 && m17.clausurados.filter((r) => !r.nota).length === 2, `MOPC 17/11: 13 puentes inhabilitados y 2 rutas clausuradas (${m17.puentes.length}, ${m17.clausurados.filter((r) => !r.nota).length}).`);
  const boq = m17.localidades.find((l) => /BOQUERON/i.test(l.localidad));
  ok(boq?.estado === 'Habilitada', `MOPC 17/11: «BOQUERON – Ramales: Habilitada» (${boq?.estado}).`);
  const corrPY = CORRESPONDENCIAS.py;
  ok(corrPY.length === 2 && corrPY.some((c) => c.guia.tramo === 'me-ph') && corrPY.some((c) => c.guia.tramo === 'cp-me'), 'CSV de fuentes: el MOPC vigila Carmelo Peralta → Mariscal y Mariscal → Pozo Hondo.');
  ok(incidenciasMOPC(m17, corrPY).length === 0, 'MOPC 17/11: nada cerrado en la PY15 ni en Boquerón (los cierres de la Transchaco y Alto Paraguay no cuentan).');
  const sim = leerInformeMOPC(tx('2026-11-17').replace(/(BOQUERON-\s+Ramales\s+\S+\s+)Habilitada/, '$1Clausurada      P/V/P'));
  const [carga] = incidenciasMOPC(sim, corrPY);
  ok(carga?.tramos?.[0] === 'me-ph' && carga.gravedad === 'rojo' && carga.afecta === 'carga' && carga.tipo === 'peso' && carga.fuente === FUENTE_MOPC && carga.horaFuente === '2026-11-17T10:00:00.000Z' && /No habilitado para carga/.test(carga.descripcion) && /07:00/.test(carga.descripcion), `MOPC: «Boquerón – Ramales: Clausurada P/V/P» → Mariscal–Pozo Hondo, no habilitado para carga, con fuente y hora (${carga?.descripcion}).`);
  const total = incidenciasMOPC(leerInformeMOPC(tx('2026-11-17').replace(/(BOQUERON-\s+Ramales\s+\S+\s+)Habilitada/, '$1Clausurada')), corrPY)[0];
  ok(total?.gravedad === 'rojo' && total.tipo === 'corte' && !total.afecta, 'MOPC: «Clausurada» sin P/V/P → corte para todos.');
  const prec = incidenciasMOPC(leerInformeMOPC(tx('2026-11-17').replace('.: PTE. HAYES – TRAMO POZO COLORADO – CONCEPCION', '.: BOQUERON – TRAMO MCAL. ESTIGARRIBIA – POZO HONDO')), corrPY);
  ok(prec.length === 2 && prec.every((i) => i.gravedad === 'ambar') && prec.some((i) => i.tramos[0] === 'me-ph'), `MOPC: «transitar con precaución» en una nota al pie → ámbar en los tramos que la nombran (${prec.map((i) => i.tramos[0]).join(', ')}).`);
  const m18a = { ...leerInformeMOPC(tx('2026-11-18-1')), numero: 1 };
  const m18b = { ...leerInformeMOPC(tx('2026-11-18-2')), numero: 2 };
  ok(m18a.hora === '07:00' && m18b.hora === '13:00' && masReciente([m18b, m18a, { ...m17, numero: 0 }]) === m18b, 'MOPC: gana el informe con la hora más reciente (el 18/11 el «(1)» es el de las 07:00 y el «(2)» el de las 13:00).');
  ok(masReciente([{ ...m18b, numero: 1 }, { ...m18b, numero: 2 }]).numero === 2, 'MOPC: a igual hora, gana el número de archivo más alto (una corrección).');
  ok(archivoMOPC('ESTADOS DE LAS RUTAS NACIONALES DEL 09 DE NOVIEMBRE DEL 2026 (2).pdf')?.dia === '2026-11-09' && archivoMOPC('ESTADOS DE LAS RUTAS NACIONALES DEL 09 DE NOVIEMBRE DEL 2026 (2).pdf').numero === 2, 'MOPC: fecha y número del nombre del archivo.');
  const cand = candidatosMOPC([{ tipo: 'archivo', id: 'a', nombre: 'ESTADOS DE LAS RUTAS NACIONALES DEL 17 DE NOVIEMBRE DEL 2026.pdf' }, { tipo: 'archivo', id: 'b', nombre: 'ESTADOS DE LAS RUTAS NACIONALES DEL 18 DE NOVIEMBRE DEL 2026 (1).pdf' }, { tipo: 'archivo', id: 'c', nombre: 'ESTADOS DE LAS RUTAS NACIONALES DEL 18 DE NOVIEMBRE DEL 2026 (2).pdf' }]);
  ok(cand.map((c) => c.id).join() === 'c,b', 'MOPC: se descargan solo los informes del último día.');
  let roto = false;
  try {
    leerInformeMOPC(tx('2026-11-17').replace('RUTAS Y TRAMOS CLAUSURADOS', 'OTRA COSA'));
  } catch (e) {
    roto = /cambiado de formato/.test(e.message);
  }
  ok(roto, 'MOPC: si falta una de las tres partes, la lectura falla y no se publica nada.');
  // HU-138: Alertas DNIT, con copias del 18/11/2026 (lista y alertas reales de otros estados; las de MS, simuladas).
  const dn = (n) => fs.readFileSync(new URL(`../pruebas/vigilante/dnit-${n}-2026-11-18.html`, import.meta.url), 'utf8');
  const listaBR = listaDNIT(dn('lista-1'));
  ok(listaBR.length === 30 && listaBR[0].instante === '2026-11-18T21:18:00.000Z' && listaBR[0].estados[0] === 'Santa Catarina' && rodoviasDe(listaBR[0].titulo)[0]?.br === 'BR-280', `DNIT: 30 alertas por página, con fecha, hora, estado y rodovía (${listaBR[0].titulo.slice(0, 50)}).`);
  const corrBR = CORRESPONDENCIAS.br;
  ok(corrBR.length === 2 && corrBR.every((c) => c.uf === 'MS' && c.guia.tramo === 'cg-pm') && corrBR.some((c) => c.rodovias.includes('BR-060')) && corrBR.some((c) => c.rodovias.includes('BR-267')), 'CSV de fuentes: el DNIT vigila la BR-060 y la BR-267 en MS (Campo Grande → Porto Murtinho).');
  const conTexto = (n, cambio = (s) => s) => {
    const h = cambio(dn(`alerta-${n}`));
    return { ...alertaDNIT(h), url: `${PAGINA_DNIT}/${n}`, estados: [] };
  };
  const ahoraBR = new Date('2026-11-18T22:00:00Z');
  const reales = ['total', 'paresiga', 'restricao', 'parcial'].map((n) => conTexto(n));
  ok(incidenciasDNIT(reales, corrBR, ahoraBR).inc.length === 0, 'DNIT: las alertas de otras rodovías y estados (BR-471/RS, BR-280/SC…) no cuentan.');
  const enMS = (n, br = 'BR-267/MS') => conTexto(n, (s) => s.replace(/BR-\d{3}\/[A-Z]{2}/g, br).replace(/br-\d{3}-[a-z]{2}/g, br.toLowerCase().replace('/', '-')));
  const totalMS = enMS('total');
  const [rojoBR] = incidenciasDNIT([totalMS], corrBR, ahoraBR).inc;
  ok(rojoBR?.tramos?.[0] === 'cg-pm' && rojoBR.gravedad === 'rojo' && rojoBR.tipo === 'obra' && rojoBR.fuente === FUENTE_DNIT && rojoBR.horaFuente === '2026-11-17T17:16:00.000Z' && /^BR-267\/MS: Interdicción total, según el DNIT \(alerta del 17\/11\/2026, 14:16/.test(rojoBR.descripcion) && /«O DNIT alerta que o tráfego/.test(rojoBR.descripcion) && rojoBR.enlace, `DNIT: interdicción total en la BR-267/MS → Campo Grande–Porto Murtinho en rojo, con el texto oficial y la hora (${rojoBR?.descripcion?.slice(0, 90)}).`);
  ok(incidenciasDNIT([enMS('total', 'BR-267/MG')], corrBR, ahoraBR).inc.length === 0, 'DNIT: la misma rodovía en otro estado (BR-267/MG) no cuenta.');
  const cargaBR = incidenciasDNIT([enMS('restricao', 'BR-060/MS')], corrBR, new Date('2026-11-13T12:00:00Z')).inc[0];
  ok(cargaBR?.afecta === 'carga' && cargaBR.gravedad === 'rojo', 'DNIT: restricción por peso («acima de 36 toneladas») → no habilitado para carga.');
  ok(incidenciasDNIT([enMS('paresiga')], corrBR, ahoraBR).inc[0]?.gravedad === 'ambar', 'DNIT: «pare e siga» → ámbar.');
  ok(incidenciasDNIT([totalMS], corrBR, new Date('2026-11-21T18:00:00Z')).inc.length === 0, 'DNIT: una alerta cuenta 3 días desde su publicación.');
  const abierta = { ...totalMS, texto: totalMS.texto.replace('será totalmente bloqueado', 'será totalmente bloqueado a partir de segunda-feira') };
  ok(incidenciasDNIT([abierta], corrBR, new Date('2026-11-30T18:00:00Z')).inc.length === 1 && incidenciasDNIT([abierta], corrBR, new Date('2026-12-20T18:00:00Z')).inc.length === 0, 'DNIT: «a partir de» (sin fecha de fin) cuenta hasta 30 días.');
  const lib = { ...enMS('liberacao'), instante: '2026-11-18T12:00:00.000Z', dia: '2026-11-18' };
  ok(incidenciasDNIT([abierta, lib], corrBR, ahoraBR).inc.length === 0, 'DNIT: una «liberação» posterior de la misma rodovía cierra lo anterior.');
  const raro = { ...totalMS, titulo: 'DNIT informa sobre obras na BR-267/MS', texto: 'O DNIT informa sobre a manutenção na BR-267/MS.' };
  const sinClase = incidenciasDNIT([raro], corrBR, ahoraBR);
  ok(sinClase.inc.length === 0 && sinClase.revisar.length === 1, 'DNIT: lo que no se sabe clasificar no se publica: queda para revisar a mano.');
  let rotoBR = false;
  try {
    alertaDNIT(dn('alerta-total').replace('rnews:articleBody', 'otra-cosa'));
  } catch (e) {
    rotoBR = /cambiado de formato/.test(e.message);
  }
  ok(rotoBR, 'DNIT: si la página de la alerta cambia de formato, la lectura falla.');
  // Antigüedad: sin informes el fin de semana; el lunes, hasta las 10:00 vale el del viernes.
  ok(!mopcAtrasado('2026-11-13', new Date('2026-11-15T15:00:00Z')) && !mopcAtrasado('2026-11-13', new Date('2026-11-16T12:59:00Z')) && mopcAtrasado('2026-11-13', new Date('2026-11-16T13:01:00Z')), 'MOPC: el fin de semana no cuenta; el lunes a las 10:00 (hora de Paraguay) ya tiene que estar el informe del día.');
  // Un informe ya aplicado no se vuelve a aplicar: la retirada cuenta informes, no pasadas.
  const rM1 = aplicar([], [carga], FUENTE_MOPC, t1);
  ok(rM1.incidencias.length === 1 && rM1.incidencias[0].verificacion?.verificadoPor === 'vigilante', 'MOPC: la incidencia va firmada por el vigilante (sello «Web oficial»).');
  try {
    const pdf = textoDePDF(fs.readFileSync(new URL('../pruebas/vigilante/mopc-2026-11-17.pdf', import.meta.url)));
    ok(leerInformeMOPC(pdf).localidades.length === m17.localidades.length, 'MOPC: el PDF se pasa a texto con pdftotext y se lee igual que la copia de texto.');
  } catch (e) {
    if (/falta pdftotext/.test(e.message)) console.log('  (sin pdftotext en esta máquina: no se prueba el paso de PDF a texto)');
    else ok(false, `MOPC: PDF a texto: ${e.message}`);
  }
  // HU-136: el CSV de fuentes manda.
  {
    const csv = fs.readFileSync('data/fuentes-vigilancia.csv', 'utf8');
    const base = cargarCSV(csv);
    const cfg = configuracion(base);
    ok(cfg.pasosAR.map((x) => x.paso).sort().join() === 'jama,pozo-hondo,sico' && cfg.correspondenciasAR.length >= 6 && cfg.chile?.km === 3, 'CSV de fuentes: 3 pasos, las rutas de Vialidad y los parámetros de Chile.');
    const sinSico = configuracion({ filas: base.filas.map((f) => (f.id === 'ar-paso-sico' || f.id === 'ar-rn51-salta' ? { ...f, estado: 'pausada' } : f)) });
    ok(!sinSico.pasosAR.some((x) => x.paso === 'sico') && !sinSico.correspondenciasAR.some((m) => m.ruta === '51'), 'CSV de fuentes: una fila pausada no se lee.');
    const movida = configuracion({ filas: base.filas.map((f) => (f.id === 'ar-rn66-jujuy' ? { ...f, destino: 'paso:jama' } : f)) });
    const rn66 = { values: [['filtro-provincia', 'filtro-ruta', 'filtro-tramo', 'estado', 'calzada', 'observaciones', 'actualizado'], [], ['Jujuy', '66', 'Perico - Jujuy', 'CORTE TOTAL', '', '', '18/11/2026 10:00']] };
    ok(leerAR(rn66, movida.correspondenciasAR)[0]?.guia.paso === 'jama', 'CSV de fuentes: mover una ruta de tramo cambia dónde cuenta su aviso.');
    ok(parseCSV('a,b\n"x, con coma","dice ""hola"""\n')[1].join('/') === 'x, con coma/dice "hola"', 'CSV de fuentes: comas y comillas dentro de un campo.');
    ok(validar({ cabecera: base.cabecera, filas: [{ ...base.filas[0], estado: 'activa', lector: 'mopc-pdf' }] }).length > 0, 'CSV de fuentes: una fila activa que el vigilante no sabe leer es un error.');
  }
  process.exit(fallos ? 1 : 0);
}

/** Último parte cargado de un organismo en un paso (lado AR). */
function ultimoParte(paso, emisor) {
  const partes = (paso.partes || []).filter((x) => x.lado === 'AR' && x.emisor.toLowerCase().startsWith(emisor.toLowerCase()));
  return partes
    .map((x) => ({ ...x, instante: new Date(`${x.publicado}T${x.hora || '00:00'}:00${DESFASE_AR}`) }))
    .sort((a, b) => b.instante - a.instante)[0];
}

const fmt = (dia, hora) => `${dia.split('-').reverse().join('/')} ${hora} h`;

async function revisar(ahora = new Date()) {
  const pasos = json('data/pasos.json');
  const lista = pasos.pasos || pasos;
  const fuentes = json('data/fuentes.json');
  const fuentePorId = Object.fromEntries((fuentes.fuentes || fuentes).map((f) => [f.id, f]));
  const lecturas = [];
  const errores = [];
  const resultados = [];
  const publicados = []; // HU-130: { paso, url, cambios, avisos }
  for (const { paso: id, fuente } of PAGINAS) {
    const k = lista.findIndex((p) => p.id === id);
    const paso = lista[k];
    const url = fuentePorId[fuente]?.url;
    if (!paso || !url) continue;
    let html;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'GuiaCorredor-vigilante (+https://elezcano.github.io/GuiaCorredor/)' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      html = await r.text();
    } catch (e) {
      errores.push({ paso, url, error: e.message });
      resultados.push({ fuente, nombre: `${paso.nombre} (Ministerio de Seguridad)`, url, ok: false, error: e.message });
      continue;
    }
    const lectura = leerPagina(html);
    const act = lectura.actualizaciones;
    const fallo = !act.length ? 'no aparece «última actualización» de Gendarmería ni de Vialidad (¿ha cambiado la página?)' : !lectura.estado ? 'no aparece el estado de Gendarmería (estadoPrioridad): ¿ha cambiado la página?' : null;
    if (fallo) errores.push({ paso, url, error: fallo });
    resultados.push({ fuente, nombre: `${paso.nombre} (Ministerio de Seguridad)`, url, ok: !fallo, error: fallo });
    for (const a of act) {
      const ult = ultimoParte(paso, a.emisor);
      lecturas.push({ paso, url, ...a, cargado: ult ? fmt(ult.publicado, ult.hora || '--:--') : null });
    }
    console.log(`${paso.nombre}: Gendarmería «${lectura.estado}», Vialidad «${lectura.vialidad || '—'}», horario ${lectura.horarioCrudo}${lectura.atencion.length ? `, Atención: ${lectura.atencion.map((x) => `${x.emisor}: ${x.texto}`).join(' / ')}` : ''}`);
    if (fallo) continue;
    const d = decidir(paso, lectura, fuente, ahora);
    if (d.cambios.length) lista[k] = d.paso;
    if (d.cambios.length || d.avisos.length) publicados.push({ paso: { id: paso.id, nombre: paso.nombre }, url, cambios: d.cambios, avisos: d.avisos });
  }
  return { lecturas, errores, resultados, publicados, pasos };
}

// ---------- HU-130 fase 2: carreteras ----------
const UA = { 'User-Agent': 'GuiaCorredor-vigilante (+https://elezcano.github.io/GuiaCorredor/)' };
const traer = async (url, opciones = {}) => {
  const r = await fetch(url, { ...opciones, headers: { ...UA, ...(opciones.headers || {}) }, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url.split('?')[0]}`);
  return r;
};
// Chile publica una vez a la semana (lunes): más de 8 días sin cambios es que la fuente se ha parado.
const MAX_HORAS = { 'cl-vialidad-siemop': CHILE?.maxHoras ?? 8 * 24, [FUENTE_DNIT]: 7 * 24 }; // HU-138: el DNIT publica alertas de todo Brasil casi a diario
const CL_CAPA = 'https://rest-sit.mop.gob.cl/arcgis/rest/services/VIALIDAD/Emergencias_Vialidad/MapServer/0/query';

async function leerFuenteAR() {
  const pagina = 'https://www.argentina.gob.ar/transporte/vialidad-nacional/estado-de-rutas';
  const html = await (await traer(pagina)).text();
  const js = [...html.matchAll(/<script[^>]+src="([^"]*poncho[^"]*\.js[^"]*)"/g)].map((m) => new URL(m[1], pagina).href);
  let codigo = '';
  for (const u of js) {
    try {
      codigo += await (await traer(u)).text();
    } catch {}
  }
  const { hoja, pestana, clave } = configTablaAR(html, codigo);
  if (!hoja || !pestana || !clave) throw new Error(`no encuentro la tabla en la página de Vialidad Nacional (hoja ${!!hoja}, pestaña ${!!pestana}, clave ${!!clave})`);
  const datos = await (await traer(`https://sheets.googleapis.com/v4/spreadsheets/${hoja}/values/${encodeURIComponent(pestana)}?key=${clave}&alt=json`, { headers: { Referer: 'https://www.argentina.gob.ar/' } })).json();
  return leerAR(datos).map((r) => incidenciaAR(r, 'ar-vialidad-estado-rutas')).filter(Boolean);
}
async function leerFuenteCL() {
  const regiones = (CHILE?.regiones || ['01', '02']).map((r) => `'${r}'`).join(',');
  const q = `${CL_CAPA}?where=${encodeURIComponent(`REGION IN (${regiones})`)}&outFields=*&returnGeometry=true&outSR=4326&f=json`;
  const datos = await (await traer(q)).json();
  if (datos.error) throw new Error(`ArcGIS: ${JSON.stringify(datos.error).slice(0, 200)}`);
  // La antigüedad se mide sobre toda la región (aunque hoy no haya nada en el corredor).
  const region = (datos.features || []).map((f) => f.attributes?.last_edited_date).filter(Boolean).sort().pop();
  const trazados = json('data/trazados.json').tramos;
  return { inc: leerCL(datos, trazados).map((x) => incidenciaCL(x, 'cl-vialidad-siemop', new Date())), ultimaEdicion: region ? new Date(region).toISOString() : null };
}

// HU-134: informe diario del MOPC (Paraguay). Carpeta pública de Drive → carpeta del mes → PDF del último día
// (todos sus «(n)») → texto con pdftotext → el más reciente por la hora de dentro.
const DRIVE_LISTA = (id) => `https://drive.google.com/embeddedfolderview?id=${id}`;
const DRIVE_PDF = (id) => `https://drive.google.com/uc?export=download&id=${id}`;
export function textoDePDF(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mopc-'));
  const f = path.join(dir, 'informe.pdf');
  fs.writeFileSync(f, buf);
  try {
    return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'falta pdftotext (poppler-utils) para leer el PDF del MOPC' : `pdftotext: ${e.message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function leerFuenteMOPC(ahora = new Date()) {
  const raiz = listadoDrive(await (await traer(DRIVE_LISTA(CARPETA_MOPC))).text());
  if (!raiz.length) throw new Error('la carpeta de Drive del MOPC no lista nada (¿ha cambiado de sitio?)');
  const hoyPY = ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Asuncion' });
  const antes = new Date(`${hoyPY.slice(0, 7)}-01T12:00:00Z`);
  antes.setUTCDate(0);
  let candidatos = [];
  // La carpeta del mes; a principios de mes, si aún no hay nada, la del mes anterior.
  for (const nombre of [carpetaDelMes(hoyPY), carpetaDelMes(antes.toISOString().slice(0, 10))]) {
    const c = raiz.find((x) => x.tipo === 'carpeta' && x.nombre.toUpperCase().replace(/\s+/g, ' ').trim() === nombre);
    if (!c) continue;
    candidatos = candidatosMOPC(listadoDrive(await (await traer(DRIVE_LISTA(c.id))).text()));
    if (candidatos.length) break;
  }
  if (!candidatos.length) throw new Error(`no encuentro informes en las carpetas «${carpetaDelMes(hoyPY)}» ni del mes anterior`);
  const informes = [];
  for (const a of candidatos.slice(0, 4)) {
    const buf = Buffer.from(await (await traer(DRIVE_PDF(a.id))).arrayBuffer());
    if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error(`«${a.nombre}» no es un PDF (Drive ha devuelto otra cosa)`);
    informes.push({ ...leerInformeMOPC(textoDePDF(buf)), numero: a.numero, archivo: a.nombre });
  }
  const inf = masReciente(informes);
  return { inc: incidenciasMOPC(inf, CORRESPONDENCIAS.py, FUENTE_MOPC), ultimaEdicion: inf.instante, informe: inf.instante, dia: inf.dia, resumen: `informe del ${inf.dia.split('-').reverse().join('/')} de las ${inf.hora} («${inf.archivo}»)` };
}

// HU-138: Alertas DNIT. Se recorre la lista (30 por página) hasta 30 días atrás y se abren solo las alertas de nuestras
// rodovías y estado.
async function leerFuenteDNIT(ahora = new Date()) {
  const lista = [];
  for (let p = 0; p < 8; p++) {
    const pag = listaDNIT(await (await traer(p ? `${PAGINA_DNIT}?b_start:int=${p * 30}` : PAGINA_DNIT)).text());
    lista.push(...pag);
    const vieja = pag.map((a) => a.instante).filter(Boolean).sort()[0];
    if (vieja && (ahora - new Date(vieja)) / 864e5 > DIAS_ALERTA_ABIERTA) break;
  }
  const nuestras = lista.filter((a) => a.instante && (ahora - new Date(a.instante)) / 864e5 <= DIAS_ALERTA_ABIERTA && rodoviasDe(a.titulo).some((r) => CORRESPONDENCIAS.br.some((c) => c.rodovias.includes(r.br) && (!r.uf || r.uf === c.uf))));
  const alertas = [];
  for (const a of nuestras) alertas.push({ ...a, ...(clasificarDNIT(a.titulo)?.liberacao ? { texto: '' } : alertaDNIT(await (await traer(a.url)).text())), url: a.url, estados: a.estados });
  const { inc, revisar } = incidenciasDNIT(alertas, CORRESPONDENCIAS.br, ahora, FUENTE_DNIT);
  const ultima = lista.map((a) => a.instante).filter(Boolean).sort().pop();
  return { inc, revisar, ultimaEdicion: ultima, resumen: `${lista.length} alertas leídas (${nuestras.length} de nuestras rodovías)` };
}

/** Lee las fuentes de carreteras y decide los cambios en data/incidencias.json. */
async function revisarCarreteras(ahora = new Date(), previo = {}) {
  const archivo = json('data/incidencias.json');
  let lista = archivo.incidencias;
  const resultados = [];
  const publicados = [];
  let hayQueEscribir = false;
  // HU-136: cada fuente de carreteras se lee solo si tiene alguna fila activa en el CSV.
  const fuentes = [
    CORRESPONDENCIAS.ar.length && { id: 'ar-vialidad-estado-rutas', nombre: 'Carreteras de Argentina (Vialidad Nacional)', url: 'https://www.argentina.gob.ar/transporte/vialidad-nacional/estado-de-rutas', leer: async () => ({ inc: await leerFuenteAR() }) },
    CORRESPONDENCIAS.py.length && { id: FUENTE_MOPC, nombre: 'Carreteras de Paraguay (MOPC)', url: PAGINA_MOPC, leer: () => leerFuenteMOPC(ahora) },
    CORRESPONDENCIAS.br.length && { id: FUENTE_DNIT, nombre: 'Carreteras de Brasil (DNIT)', url: PAGINA_DNIT, leer: () => leerFuenteDNIT(ahora) },
    CHILE && { id: 'cl-vialidad-siemop', nombre: 'Carreteras de Chile (Vialidad, MOP)', url: 'https://sitministerial.maps.arcgis.com/apps/webappviewer/index.html?id=500fa188342a4b6cb9acd7b96d5a12d0', leer: leerFuenteCL },
  ].filter(Boolean);
  for (const f of fuentes) {
    let leido;
    try {
      leido = await f.leer();
    } catch (e) {
      console.log(`${process.env.GITHUB_EVENT_NAME === 'pull_request' ? '::warning::' : ''}⚠ ${f.nombre}: ${e.message}`);
      resultados.push({ fuente: f.id, nombre: f.nombre, url: f.url, ok: false, error: e.message });
      continue;
    }
    const horas = leido.ultimaEdicion ? (ahora - new Date(leido.ultimaEdicion)) / 36e5 : antiguedadHoras(leido.inc, ahora);
    // HU-134: el MOPC no publica los fines de semana; está parado si falta el informe del último día laborable.
    const parada = f.id === FUENTE_MOPC ? mopcAtrasado(leido.dia, ahora) : MAX_HORAS[f.id] && horas != null && horas > MAX_HORAS[f.id];
    const error = parada ? (f.id === FUENTE_MOPC ? `el último informe del MOPC es del ${leido.dia.split('-').reverse().join('/')}: falta el del último día laborable` : `la fuente no se actualiza desde hace ${Math.floor(horas / 24)} días`) : null;
    resultados.push({ fuente: f.id, nombre: f.nombre, url: f.url, ok: !parada, error, ...(leido.informe ? { informe: leido.informe } : {}) });
    // HU-134: un informe ya aplicado (o más viejo) no se vuelve a aplicar: «falta en dos informes seguidos» cuenta
    // informes, no pasadas del vigilante (el MOPC publica dos veces al día y el vigilante pasa cada hora).
    const yaVisto = previo.fuentes?.[f.id]?.ultimoInforme;
    if (leido.informe && yaVisto && leido.informe <= yaVisto) {
      console.log(`${f.nombre}: ${leido.resumen}, ya aplicado.${error ? ` ⚠ ${error}` : ''}`);
      continue;
    }
    const { incidencias, cambios, descartada, tocado } = aplicar(lista, leido.inc, f.id, ahora);
    if (tocado) hayQueEscribir = true;
    // En una PR, la lectura real sale como nota en GitHub (los registros completos no siempre se pueden ver).
    console.log(`${process.env.GITHUB_EVENT_NAME === 'pull_request' ? '::notice::' : ''}${f.nombre}: ${leido.resumen ? `${leido.resumen}, ` : ''}${leido.inc.length} avisos en el corredor${descartada ? ' (copia antigua: descartada)' : ''}${error ? ` · ⚠ ${error}` : ''}`);
    lista = incidencias;
    // HU-138: lo que no se sabe clasificar no se publica: se avisa para revisarlo a mano.
    if (cambios.length || leido.revisar?.length) publicados.push({ paso: { id: f.id, nombre: f.nombre }, url: f.url, cambios, avisos: leido.revisar || [], carretera: true });
  }
  return { archivo: { ...archivo, incidencias: lista }, resultados, publicados, hayQueEscribir };
}

// ---------- Estado de la vigilancia (HU-129) ----------
export const FALLOS_PARA_AVISAR = 3;
/**
 * Nuevo estado a partir del anterior y de lo leído en esta pasada.
 * resultados: [{ fuente, nombre, url, ok, error }]. Puro: no toca disco ni red.
 */
export function actualizarEstado(previo = {}, resultados = [], ahora = new Date()) {
  const iso = ahora.toISOString();
  const fuentes = { ...(previo.fuentes || {}) };
  for (const r of resultados) {
    const a = fuentes[r.fuente] || {};
    fuentes[r.fuente] = {
      nombre: r.nombre,
      url: r.url,
      ultimoIntento: iso,
      ultimaLecturaBuena: r.ok ? iso : a.ultimaLecturaBuena || null,
      fallosSeguidos: r.ok ? 0 : (a.fallosSeguidos || 0) + 1,
      ultimoError: r.ok ? null : r.error,
      ...(r.informe || a.ultimoInforme ? { ultimoInforme: r.informe || a.ultimoInforme } : {}),
    };
  }
  return { nota: 'Estado del vigilante (scripts/vigilante.mjs). Lo escribe cada pasada.', ultimaPasada: iso, fuentes };
}
/** Fuentes que acaban de llegar al umbral de fallos seguidos (se avisa una vez al cruzarlo). */
export const fuentesCiegas = (estado) => Object.entries(estado.fuentes || {}).filter(([, f]) => f.fallosSeguidos === FALLOS_PARA_AVISAR);

// ---------- GitHub ----------
const REPO = process.env.GITHUB_REPOSITORY || 'elezcano/GuiaCorredor';
const AVISAR_A = process.env.AVISAR_A || REPO.split('/')[0];
async function gh(ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`GitHub ${opciones.method || 'GET'} ${ruta}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
async function abrirOCompletar(titulo, cuerpo, linea) {
  const abiertas = await gh(`/issues?state=open&labels=${ETIQUETA}&per_page=100`);
  const ya = abiertas.find((i) => i.title === titulo);
  if (!ya) {
    const i = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: titulo, body: cuerpo, labels: [ETIQUETA], assignees: [AVISAR_A] }) });
    console.log(`Incidencia abierta: #${i.number} ${titulo}`);
    return;
  }
  if ((ya.body || '').includes(linea)) return console.log(`Ya avisado en #${ya.number}.`);
  await gh(`/issues/${ya.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `Nuevo: ${linea}` }) });
  console.log(`Comentario añadido en #${ya.number}.`);
}

/** Hora actual en Argentina y en España, para el correo. */
function horasAhora(ahora = new Date()) {
  const f = (zona) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(ahora);
  return { ar: f('America/Argentina/Salta'), es: f('Europe/Madrid') };
}
/** Minutos desde medianoche en una zona horaria. */
function minutosEn(zona, ahora = new Date()) {
  const [h, m] = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(ahora).split(':').map(Number);
  return h * 60 + m;
}
const aMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/**
 * Solo se avisa dentro del horario conocido del paso (apertura–cierre, hora de Argentina): de noche
 * Gendarmería publica el cierre de la jornada, que no cambia nada. Lo publicado de noche se avisa
 * en la primera pasada tras la apertura. Un paso sin horario estructurado avisa a cualquier hora.
 */
export function dentroDeHorario(paso, ahora = new Date()) {
  const h = (paso.horarios || []).find((x) => x.apertura && x.cierre && x.zona);
  if (!h) return { dentro: true, horario: null };
  const m = minutosEn(h.zona, ahora);
  return { dentro: m >= aMin(h.apertura) && m <= aMin(h.cierre), horario: `${h.apertura}–${h.cierre}` };
}

const PIE = '\n\n---\nAviso automático del vigilante (`scripts/vigilante.mjs`, HU-130). Lo leído de la web oficial ya está publicado en la Guía con el sello «Leído en web oficial» (decisión 22). Si algo no cuadra, dile a Claude qué corregir o retirar.\n\nOjo desde España: la etiqueta «Abierto/Cerrado» y la cuenta atrás de la web oficial usan la hora de tu móvil, no la de Argentina. Fíate del horario, del recuadro «Atención» y de la lista «Información provista por».';

async function principal() {
  if (args.has('--autoprueba')) return autoprueba();
  const archivoCambios = process.env.VIGILANCIA_CAMBIOS;
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA_AR });
  const { ar, es } = horasAhora();

  // HU-130, segundo paso del flujo: ya publicado (comprobado y subido a main), se avisa.
  if (args.has('--avisar-publicado')) {
    const publicados = archivoCambios && fs.existsSync(archivoCambios) ? json(archivoCambios) : [];
    for (const p of publicados) {
      // PUBLICADO=0: la comprobación de datos falló y no se subió nada.
      const pre = process.env.PUBLICADO === '0' ? 'NO publicado (falló la comprobación de datos; mira el registro del vigilante)' : 'Publicado';
      const lineas = [...p.cambios.map((c) => `${pre}: ${c}`), ...p.avisos.map((a) => `Revisa: ${a}`)];
      await abrirOCompletar(
        `Vigilante · ${p.paso.nombre} (${hoy})`,
        `**Hora en Argentina: ${ar}** (en España: ${es}).\n\n${lineas.map((l) => `- ${l}`).join('\n')}\n\nPágina oficial: ${p.url}${PIE}`,
        lineas.join(' · ')
      );
    }
    return;
  }

  const { lecturas, errores, resultados, publicados, pasos } = await revisar();
  // HU-130 fase 2: carreteras (Vialidad Nacional y Vialidad de Chile).
  // HU-129: estado de la vigilancia (si se indica dónde guardarlo). HU-134: se lee antes, para no reaplicar un informe.
  const archivoEstado = process.env.VIGILANCIA_ARCHIVO;
  let previo = {};
  if (archivoEstado)
    try {
      previo = json(archivoEstado);
    } catch {}
  const carreteras = args.has('--sin-carreteras') ? null : await revisarCarreteras(new Date(), previo);
  if (carreteras) resultados.push(...carreteras.resultados), publicados.push(...carreteras.publicados);
  let estado = null;
  if (archivoEstado) {
    estado = actualizarEstado(previo, resultados);
    fs.writeFileSync(archivoEstado, JSON.stringify(estado, null, 1) + '\n');
    for (const [id, f] of Object.entries(estado.fuentes)) console.log(`Estado ${id}: ${f.fallosSeguidos ? `${f.fallosSeguidos} fallos seguidos` : 'lectura buena'}`);
  }

  for (const l of lecturas) console.log(`${l.paso.nombre} · ${l.emisor}: en la web ${fmt(l.dia, l.hora)} · cargado ${l.cargado || 'ninguno'}`);
  for (const e of errores) console.log(`⚠ ${e.paso.nombre}: ${e.error}`);
  for (const p of publicados) for (const c of [...p.cambios, ...p.avisos.map((a) => `(aviso) ${a}`)]) console.log(`→ ${p.paso.nombre}: ${c}`);
  if (!publicados.length) console.log('Nada nuevo que publicar.');

  // HU-130: escribe los datos y el resumen. El flujo comprueba (npm run check), sube a main y publica.
  if (args.has('--escribir')) {
    if (publicados.some((p) => p.cambios.length && !p.carretera)) fs.writeFileSync('data/pasos.json', JSON.stringify(pasos, null, 2) + '\n');
    if (carreteras?.hayQueEscribir) fs.writeFileSync('data/incidencias.json', JSON.stringify(carreteras.archivo, null, 2) + '\n');
    if (archivoCambios) fs.writeFileSync(archivoCambios, JSON.stringify(publicados, null, 1) + '\n');
  }

  if (!args.has('--github')) return;

  if (args.has('--prueba')) {
    const filas = lecturas.map((l) => `| ${l.paso.nombre} | ${l.emisor} | ${fmt(l.dia, l.hora)} | ${l.cargado || 'ninguno'} | [abrir](${l.url}) |`).join('\n');
    const i = await gh('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: `Vigilante · PRUEBA de aviso (${hoy})`,
        labels: [ETIQUETA],
        assignees: [AVISAR_A],
        body: `Esto es una **prueba** para comprobar que el aviso llega por correo. Puedes cerrarla.\n\nLo que el vigilante ha leído ahora en las páginas oficiales:\n\n| Paso | Organismo | Última actualización en la web | Parte cargado | Página |\n|---|---|---|---|---|\n${filas || '| — | — | No se pudo leer ninguna página | — | — |'}\n${errores.length ? `\n**No se pudo leer:** ${errores.map((e) => `${e.paso.nombre} (${e.error})`).join('; ')}` : ''}${PIE}`,
      }),
    });
    console.log(`Incidencia de prueba: #${i.number}`);
    return;
  }

  // Lo que solo hay que revisar (sin cambios publicados) se avisa ya; lo publicado, tras subirlo (--avisar-publicado).
  if (!args.has('--escribir'))
    for (const p of publicados.filter((x) => !x.cambios.length)) {
      const lineas = p.avisos.map((a) => `Revisa: ${a}`);
      await abrirOCompletar(`Vigilante · ${p.paso.nombre} (${hoy})`, `**Hora en Argentina: ${ar}** (en España: ${es}).\n\n${lineas.map((l) => `- ${l}`).join('\n')}\n\nPágina oficial: ${p.url}${PIE}`, lineas.join(' · '));
    }
  // HU-129: si una fuente falla 3 pasadas seguidas, el vigilante está ciego con ella: un aviso.
  // Sin estado guardado (ejecución suelta), se avisa al primer fallo, como antes.
  const ciegas = estado ? fuentesCiegas(estado).map(([, f]) => `${f.nombre}: ${FALLOS_PARA_AVISAR} lecturas seguidas fallidas; última buena ${f.ultimaLecturaBuena ? new Date(f.ultimaLecturaBuena).toLocaleString('es-ES', { timeZone: ZONA_AR }) + ' (hora AR)' : 'nunca'}. Error: ${f.ultimoError} (${f.url})`) : errores.map((e) => `${e.paso.nombre}: ${e.error} (${e.url})`);
  if (ciegas.length) {
    await abrirOCompletar(`Vigilante · fuentes oficiales sin leer (${hoy})`, `El vigilante no puede leer estas fuentes. Mientras tanto, la web no puede decir «sin incidencias» para ellas.\n\n${ciegas.map((l) => `- ${l}`).join('\n')}${PIE}`, ciegas.join(' · '));
  }
}

await principal();
