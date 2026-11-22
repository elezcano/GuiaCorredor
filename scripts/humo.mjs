// Vigía de la web publicada: comprueba que lo que importa funciona de verdad, en la web real.
// Lo lanza .github/workflows/vigia.yml después de cada publicación y cada 6 horas. Si algo falla,
// sale con código 1 y el workflow abre (o actualiza) un issue con el informe.
//
// Uso: node scripts/humo.mjs                      → contra la web publicada (data/site.json → url + basePath)
//      HUMO_URL=http://localhost:4321 node scripts/humo.mjs --sin-externos   → contra una web local, sin Google ni GitHub
// Escribe el informe en vigia.md.
import fs from 'node:fs';

const site = JSON.parse(fs.readFileSync(new URL('../data/site.json', import.meta.url)));
const BASE = (process.env.HUMO_URL || site.url.replace(/\/$/, '') + (site.basePath || '')).replace(/\/$/, '');
const SIN_EXTERNOS = process.argv.includes('--sin-externos');
const ESPERA_VIGILANTE_H = 3; // el vigilante pasa cada hora: 3 h sin pasar ya es un fallo
const ESPERA_PUBLICACION_H = 8; // la web se republica cada 3 h por calendario

const fallos = [];
const bien = [];
const comprobar = (cond, texto, detalle = '') => (cond ? bien.push(texto) : fallos.push(detalle ? `${texto}: ${detalle}` : texto));

async function traer(url) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'RadarCorredor-vigia/1.0' } });
  return { estado: r.status, texto: await r.text() };
}
const horasDesde = (iso) => (Date.now() - Date.parse(iso)) / 36e5;

const PAGINAS = [
  ['/', 'Portada'],
  ['/pasos/', 'Fronteras'],
  ['/guia/pasos/jama/', 'Ficha de Jama'],
  ['/guia/pasos/sico/', 'Ficha de Sico'],
  ['/guia/pasos/pozo-hondo/', 'Ficha de Pozo Hondo'],
  ['/guia/pasos/carmelo-peralta-porto-murtinho/', 'Ficha del Puente de la Bioceánica'],
  ['/planificador/', 'Rutas'],
  ['/avisos/', 'Avisos'],
  ['/cotizar/', 'Pedir cotización'],
  ['/anunciate/', 'Anunciarme'],
  ['/sobre/', 'Cómo trabajamos'],
  ['/pt/', 'Portada en portugués'],
];

const html = {};
for (const [ruta, nombre] of PAGINAS) {
  try {
    const r = await traer(BASE + ruta);
    html[ruta] = r.texto;
    comprobar(r.estado === 200, `${nombre} responde`, `HTTP ${r.estado} en ${ruta}`);
  } catch (e) {
    comprobar(false, `${nombre} responde`, e.message);
  }
}

// Contenido que sostiene la decisión: el tablero de pasos con sus 4 pasos y un estado en cada uno.
const portada = html['/'] || '';
const filas = (portada.match(/class="tablero-fila(?! tablero-cab)[^"]*"/g) || []).length;
comprobar(filas >= 4, 'Portada: tablero con los 4 pasos', `${filas} filas`);
comprobar(/class="estado [^"]*op-/.test(portada), 'Portada: cada paso con su estado');
for (const p of ['jama', 'sico']) comprobar(/class="lados-paso"/.test(html[`/guia/pasos/${p}/`] || ''), `Ficha de ${p}: una línea por país`);

// Formularios: envían a su hoja (no a un correo) y el formulario de Google acepta respuestas.
const forms = [
  ['/cotizar/', 'form-cotizar', 'Cotización', site.cotizaciones?.enlacePrellenado],
  ['/anunciate/', 'solicitud', 'Solicitud de empresa', site.solicitudes?.enlacePrellenado],
];
for (const [ruta, id, nombre, enlace] of forms) {
  const h = html[ruta] || '';
  const etiqueta = h.match(new RegExp(`<form[^>]*id="${id}"[^>]*>`))?.[0] || '';
  comprobar(/data-accion="https:\/\/docs\.google\.com\/forms\/[^"]+\/formResponse"/.test(etiqueta), `${nombre}: el formulario envía a su hoja`, etiqueta ? 'sin data-accion (iría por correo)' : 'formulario no encontrado');
  if (enlace && !SIN_EXTERNOS) {
    try {
      const r = await traer(enlace.split('?')[0]);
      comprobar(r.estado === 200 && !/no acepta respuestas|no longer accepting responses|ya no acepta/i.test(r.texto), `${nombre}: el formulario de Google acepta respuestas`, `HTTP ${r.estado}`);
    } catch (e) {
      comprobar(false, `${nombre}: el formulario de Google acepta respuestas`, e.message);
    }
  }
}

// Estadísticas: el script de GoatCounter en todas las páginas publicadas.
if (site.estadisticas?.goatcounter && !process.env.HUMO_URL) {
  const sin = PAGINAS.filter(([r]) => html[r] && !html[r].includes(`data-goatcounter="${site.estadisticas.goatcounter}"`)).map(([r]) => r);
  comprobar(!sin.length, 'Estadísticas: GoatCounter en todas las páginas', `falta en ${sin.join(', ')}`);
}

// Contacto: el de la cuenta del producto, en las páginas de negocio.
comprobar((html['/cotizar/'] || '').includes(site.contacto.email), 'Contacto: el correo del producto en Pedir cotización');

// Frescura: la web se republica y el vigilante pasa.
try {
  const r = await traer(BASE + '/api/v1/indice.json');
  const gen = JSON.parse(r.texto).generado;
  comprobar(horasDesde(gen) < ESPERA_PUBLICACION_H || process.env.HUMO_URL, 'Web republicada en las últimas horas', `última publicación hace ${horasDesde(gen).toFixed(1)} h`);
} catch (e) {
  comprobar(false, 'API: indice.json legible', e.message);
}
if (!SIN_EXTERNOS) {
  try {
    const repo = process.env.GITHUB_REPOSITORY || 'elezcano/GuiaCorredor';
    const r = await traer(`https://raw.githubusercontent.com/${repo}/datos-vigilancia/vigilancia.json`);
    const v = JSON.parse(r.texto);
    comprobar(horasDesde(v.ultimaPasada) < ESPERA_VIGILANTE_H, 'Vigilante: ha pasado en las últimas 3 h', `última pasada hace ${horasDesde(v.ultimaPasada).toFixed(1)} h`);
    const caidas = Object.entries(v.fuentes || {}).filter(([, f]) => f.ultimaLecturaBuena && horasDesde(f.ultimaLecturaBuena) > 6).map(([id]) => id);
    comprobar(!caidas.length, 'Vigilante: todas las fuentes leídas en las últimas 6 h', caidas.join(', '));
  } catch (e) {
    comprobar(false, 'Vigilante: estado legible', e.message);
  }
}

const cuando = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const informe = [
  `# Vigía de la web · ${cuando}`,
  '',
  `Web: ${BASE}`,
  '',
  fallos.length ? `## ✗ ${fallos.length} fallo(s)\n\n${fallos.map((f) => `- ${f}`).join('\n')}` : '## ✓ Todo operativo',
  '',
  `<details><summary>${bien.length} comprobaciones correctas</summary>\n\n${bien.map((b) => `- ${b}`).join('\n')}\n</details>`,
  '',
].join('\n');
fs.writeFileSync('vigia.md', informe);
console.log(informe);
process.exit(fallos.length ? 1 : 0);
