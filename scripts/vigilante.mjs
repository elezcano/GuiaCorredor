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
// No cambia datos ni publica nada: solo avisa. El estado («Abierto/Cerrado») de esas páginas se
// carga en el navegador y no se puede leer aquí; la incidencia enlaza a la página para mirarlo.
//
// Uso:
//   node scripts/vigilante.mjs                 lee las páginas y muestra qué avisaría (sin tocar GitHub)
//   node scripts/vigilante.mjs --github        además abre o completa las incidencias (necesita GITHUB_TOKEN)
//   node scripts/vigilante.mjs --github --prueba   abre una incidencia de prueba con lo leído, para comprobar el correo
//   node scripts/vigilante.mjs --autoprueba    comprueba el lector con un ejemplo, sin red
import fs from 'node:fs';

const PAGINAS = [
  { paso: 'jama', fuente: 'ar-seguridad-paso-jama' },
  { paso: 'sico', fuente: 'ar-seguridad-paso-sico' },
  { paso: 'pozo-hondo', fuente: 'ar-seguridad-paso-mision-la-paz' },
];
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

function autoprueba() {
  const ejemplo = `<h2>Información provista por</h2><ul>
    <li>Gendarmería Nacional <span>(última actualización 15/11/2026 - 09:50 h)</span></li>
    <li>Vialidad&nbsp;Nacional (&uacute;ltima actualizaci&oacute;n 12/11/2026 - 8:30 h)</li>
    <li>Servicio Meteorológico Nacional (última actualización 15/11/2026 - 15:00 h)</li></ul>`;
  const r = leerActualizaciones(ejemplo);
  const ok =
    r.length === 2 &&
    r[0].emisor === 'Gendarmería Nacional' && r[0].dia === '2026-11-15' && r[0].hora === '09:50' && r[0].instante.toISOString() === '2026-11-15T12:50:00.000Z' &&
    r[1].emisor === 'Vialidad Nacional' && r[1].dia === '2026-11-12' && r[1].hora === '08:30';
  const paso = { horarios: [{ apertura: '09:00', cierre: '19:15', zona: 'America/Argentina/Jujuy' }] };
  const okHorario =
    dentroDeHorario(paso, new Date('2026-11-17T12:30:00Z')).dentro === true && // 09:30 AR
    dentroDeHorario(paso, new Date('2026-11-17T07:21:00Z')).dentro === false && // 04:21 AR
    dentroDeHorario(paso, new Date('2026-11-17T23:30:00Z')).dentro === false && // 20:30 AR
    dentroDeHorario({ horarios: [] }).dentro === true;
  console.log(okHorario ? '✓ Vigilante: solo avisa dentro del horario del paso (hora de Argentina).' : '✗ Vigilante: el filtro de horario falla.');
  if (!okHorario) process.exit(1);
  let e = {};
  const t0 = new Date('2026-11-17T12:00:00Z');
  for (let k = 0; k < 4; k++) e = actualizarEstado(e, [{ fuente: 'f', nombre: 'F', url: 'u', ok: k === 0, error: k ? 'HTTP 500' : null }], new Date(t0.getTime() + k * 36e5));
  const okEstado = e.fuentes.f.fallosSeguidos === 3 && e.fuentes.f.ultimaLecturaBuena === '2026-11-17T12:00:00.000Z' && fuentesCiegas(e).length === 1 &&
    fuentesCiegas(actualizarEstado(e, [{ fuente: 'f', nombre: 'F', url: 'u', ok: false, error: 'x' }])).length === 0 &&
    actualizarEstado(e, [{ fuente: 'f', nombre: 'F', url: 'u', ok: true }]).fuentes.f.fallosSeguidos === 0;
  console.log(okEstado ? '✓ Vigilante: el estado avisa una vez al tercer fallo seguido.' : `✗ Vigilante: estado inesperado ${JSON.stringify(e)}`);
  if (!okEstado) process.exit(1);
  console.log(ok ? '✓ Vigilante: el lector entiende el formato de la página oficial.' : `✗ Vigilante: lectura inesperada ${JSON.stringify(r)}`);
  process.exit(ok ? 0 : 1);
}

/** Último parte cargado de un organismo en un paso (lado AR). */
function ultimoParte(paso, emisor) {
  const partes = (paso.partes || []).filter((x) => x.lado === 'AR' && x.emisor.toLowerCase().startsWith(emisor.toLowerCase()));
  return partes
    .map((x) => ({ ...x, instante: new Date(`${x.publicado}T${x.hora || '00:00'}:00${DESFASE_AR}`) }))
    .sort((a, b) => b.instante - a.instante)[0];
}

const fmt = (dia, hora) => `${dia.split('-').reverse().join('/')} ${hora} h`;

async function revisar() {
  const pasos = json('data/pasos.json');
  const lista = pasos.pasos || pasos;
  const fuentes = json('data/fuentes.json');
  const fuentePorId = Object.fromEntries((fuentes.fuentes || fuentes).map((f) => [f.id, f]));
  const avisos = [];
  const lecturas = [];
  const errores = [];
  const resultados = [];
  for (const { paso: id, fuente } of PAGINAS) {
    const paso = lista.find((p) => p.id === id);
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
    const act = leerActualizaciones(html);
    const sinFormato = 'no aparece «última actualización» de Gendarmería ni de Vialidad (¿ha cambiado la página?)';
    if (!act.length) errores.push({ paso, url, error: sinFormato });
    resultados.push({ fuente, nombre: `${paso.nombre} (Ministerio de Seguridad)`, url, ok: act.length > 0, error: act.length ? null : sinFormato });
    for (const a of act) {
      const ult = ultimoParte(paso, a.emisor);
      lecturas.push({ paso, url, ...a, cargado: ult ? fmt(ult.publicado, ult.hora || '--:--') : null });
      if (!ult || a.instante > ult.instante) avisos.push({ paso, url, ...a, cargado: ult ? fmt(ult.publicado, ult.hora || 'sin hora') : null });
    }
  }
  return { avisos, lecturas, errores, resultados };
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

const PIE = '\n\n---\nAviso automático del vigilante (`scripts/vigilante.mjs`). No cambia datos: mira el parte y, si procede, dile a Claude «confirmo …» para cargarlo. Claude la cierra cuando el parte esté revisado.\n\nOjo desde España: la cuenta atrás de la web oficial («cierra en…», «abre en…») usa la hora de tu móvil, no la de Argentina. Fíate del horario, del recuadro «Atención» y de la lista «Información provista por».';

async function principal() {
  if (args.has('--autoprueba')) return autoprueba();
  const { avisos, lecturas, errores, resultados } = await revisar();
  // HU-129: estado de la vigilancia (si se indica dónde guardarlo).
  const archivoEstado = process.env.VIGILANCIA_ARCHIVO;
  let estado = null;
  if (archivoEstado) {
    let previo = {};
    try {
      previo = json(archivoEstado);
    } catch {}
    estado = actualizarEstado(previo, resultados);
    fs.writeFileSync(archivoEstado, JSON.stringify(estado, null, 1) + '\n');
    for (const [id, f] of Object.entries(estado.fuentes)) console.log(`Estado ${id}: ${f.fallosSeguidos ? `${f.fallosSeguidos} fallos seguidos` : 'lectura buena'}`);
  }
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Salta' });

  for (const l of lecturas) console.log(`${l.paso.nombre} · ${l.emisor}: en la web ${fmt(l.dia, l.hora)} · cargado ${l.cargado || 'ninguno'}`);
  for (const e of errores) console.log(`⚠ ${e.paso.nombre}: ${e.error}`);
  if (!avisos.length) console.log('Sin partes nuevos.');

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

  // Un aviso por paso y día; los partes nuevos del mismo día se añaden como comentario.
  const porPaso = new Map();
  for (const a of avisos) porPaso.set(a.paso.id, [...(porPaso.get(a.paso.id) || []), a]);
  const { ar, es } = horasAhora();
  for (const [, lista] of porPaso) {
    const { paso, url } = lista[0];
    const hor = dentroDeHorario(paso);
    if (!hor.dentro) {
      console.log(`${paso.nombre}: parte nuevo fuera del horario (${hor.horario}, hora AR); se avisará tras la apertura.`);
      continue;
    }
    const lineas = lista.map((a) => `**${a.emisor}**: parte del ${fmt(a.dia, a.hora)} (cargado: ${a.cargado || 'ninguno'})`);
    await abrirOCompletar(
      `Vigilante · ${paso.nombre}: parte nuevo (${hoy})`,
      `**Hora en Argentina: ${ar}** (en España: ${es}). Horario del paso: ${hor.horario ? `${hor.horario}, hora de Argentina` : 'sin horario cargado'}.\n\nHay partes más recientes que los cargados en la Guía:\n\n${lineas.map((l) => `- ${l}`).join('\n')}\n\nPágina oficial: ${url}${PIE}`,
      lineas.join(' · ')
    );
  }
  // HU-129: si una fuente falla 3 pasadas seguidas, el vigilante está ciego con ella: un aviso.
  // Sin estado guardado (ejecución suelta), se avisa al primer fallo, como antes.
  const ciegas = estado ? fuentesCiegas(estado).map(([, f]) => `${f.nombre}: ${FALLOS_PARA_AVISAR} lecturas seguidas fallidas; última buena ${f.ultimaLecturaBuena ? new Date(f.ultimaLecturaBuena).toLocaleString('es-ES', { timeZone: 'America/Argentina/Salta' }) + ' (hora AR)' : 'nunca'}. Error: ${f.ultimoError} (${f.url})`) : errores.map((e) => `${e.paso.nombre}: ${e.error} (${e.url})`);
  if (ciegas.length) {
    await abrirOCompletar(`Vigilante · fuentes oficiales sin leer (${hoy})`, `El vigilante no puede leer estas fuentes. Mientras tanto, la web no puede decir «sin incidencias» para ellas.\n\n${ciegas.map((l) => `- ${l}`).join('\n')}${PIE}`, ciegas.join(' · '));
  }
}

await principal();
