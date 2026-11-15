// Vigilante de webs oficiales (HU-77).
//
// Lee la página oficial de cada paso del Ministerio de Seguridad de Argentina y la hora de
// «última actualización» de cada organismo (Gendarmería Nacional, Vialidad Nacional). Si es más
// reciente que el último parte cargado en data/pasos.json → partes, abre (o completa) una incidencia
// en GitHub asignada al responsable editorial, que recibe el aviso por correo.
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
      continue;
    }
    const act = leerActualizaciones(html);
    if (!act.length) errores.push({ paso, url, error: 'no aparece «última actualización» de Gendarmería ni de Vialidad (¿ha cambiado la página?)' });
    for (const a of act) {
      const ult = ultimoParte(paso, a.emisor);
      lecturas.push({ paso, url, ...a, cargado: ult ? fmt(ult.publicado, ult.hora || '--:--') : null });
      if (!ult || a.instante > ult.instante) avisos.push({ paso, url, ...a, cargado: ult ? fmt(ult.publicado, ult.hora || 'sin hora') : null });
    }
  }
  return { avisos, lecturas, errores };
}

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

const PIE = '\n\n---\nAviso automático del vigilante (`scripts/vigilante.mjs`). No cambia datos: mira el parte y, si procede, dile a Claude «confirmo …» para cargarlo. Cierra la incidencia cuando esté revisado.';

async function principal() {
  if (args.has('--autoprueba')) return autoprueba();
  const { avisos, lecturas, errores } = await revisar();
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
  for (const [, lista] of porPaso) {
    const { paso, url } = lista[0];
    const lineas = lista.map((a) => `**${a.emisor}**: parte del ${fmt(a.dia, a.hora)} (cargado: ${a.cargado || 'ninguno'})`);
    await abrirOCompletar(
      `Vigilante · ${paso.nombre}: parte nuevo (${hoy})`,
      `Hay partes más recientes que los cargados en la Guía:\n\n${lineas.map((l) => `- ${l}`).join('\n')}\n\nPágina oficial: ${url}${PIE}`,
      lineas.join(' · ')
    );
  }
  // Si una página no se puede leer, un aviso al día para saber que el vigilante está ciego.
  if (errores.length) {
    const lineas = errores.map((e) => `${e.paso.nombre}: ${e.error} (${e.url})`);
    await abrirOCompletar(`Vigilante · no se pudieron leer páginas oficiales (${hoy})`, `${lineas.map((l) => `- ${l}`).join('\n')}${PIE}`, lineas.join(' · '));
  }
}

await principal();
