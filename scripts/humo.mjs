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
// Lote 3 (auditoría, cambio 8): el vigilante pasa cada hora de 06 a 21 h de Argentina. Dentro de ese horario, más de
// 2 h sin pasar es una pasada perdida; de noche no pasa, así que el límite es el de la noche (12 h).
const ESPERA_VIGILANTE_H = 2;
const ESPERA_VIGILANTE_NOCHE_H = 12;
const horaArgentina = () => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Argentina/Salta' }).format(new Date()));
// Desde las 08:00 ya debe haber pasado al menos dos veces (la primera es hacia las 06:17); hasta las 22:59, la de las 21.
const enHorarioVigilante = () => { const h = horaArgentina(); return h >= 8 && h <= 22; };
const ESPERA_PUBLICACION_H = 8; // la web se republica cada 3 h por calendario

const fallos = [];
const atrasadas = []; // fuentes oficiales que responden pero no publican (aviso, no fallo)
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
if (!SIN_EXTERNOS || process.env.HUMO_VIGILANCIA) {
  try {
    const repo = process.env.GITHUB_REPOSITORY || 'elezcano/GuiaCorredor';
    // HUMO_VIGILANCIA: un vigilancia.json local, para probar el Vigía sin red (pruebas/vigia.cjs).
    const v = process.env.HUMO_VIGILANCIA ? JSON.parse(fs.readFileSync(process.env.HUMO_VIGILANCIA, 'utf8')) : JSON.parse((await traer(`https://raw.githubusercontent.com/${repo}/datos-vigilancia/vigilancia.json`)).texto);
    const limite = enHorarioVigilante() ? ESPERA_VIGILANTE_H : ESPERA_VIGILANTE_NOCHE_H;
    comprobar(horasDesde(v.ultimaPasada) < limite, `Vigilante: sin pasadas perdidas (última hace menos de ${limite} h${enHorarioVigilante() ? ', dentro de su horario' : ', de noche'})`, `última pasada hace ${horasDesde(v.ultimaPasada).toFixed(1)} h`);
    // Igual que el vigilante: el DNIT (Brasil) corta a ratos y publica cuando hay alertas, así que tiene más margen.
    const margen = (id) => (id === 'br-dnit-alertas' ? 12 : 6);
    // 26/11/2026 (decisión 42): «atrasada» = la fuente responde pero el organismo no publica nada nuevo. No es un fallo
    // nuestro: no pone el Vigía en rojo; abre su propio aviso («Fuente oficial atrasada: …») y se cierra solo.
    const fuentes = Object.entries(v.fuentes || {});
    const caidas = fuentes.filter(([id, f]) => !f.atrasada && f.ultimaLecturaBuena && horasDesde(f.ultimaLecturaBuena) > margen(id)).map(([id, f]) => `${id} (última buena hace ${horasDesde(f.ultimaLecturaBuena).toFixed(1)} h${f.ultimoError ? `: ${f.ultimoError}` : ''})`);
    comprobar(!caidas.length, 'Vigilante: todas las fuentes responden (6 h; DNIT, 12 h)', caidas.join(', '));
    for (const [id, f] of fuentes.filter(([, f]) => f.atrasada)) {
      const desde = f.ultimaPublicacion ? new Date(f.ultimaPublicacion).toISOString().slice(0, 10).split('-').reverse().join('/') : 'fecha desconocida';
      atrasadas.push({ id, nombre: f.nombre || id, url: f.url || '', desde, error: f.ultimoError || '' });
    }
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
  ...(atrasadas.length ? [`### Fuentes oficiales atrasadas (aviso, no es un fallo de la web)\n\n${atrasadas.map((a) => `- ${a.nombre}: sin publicar nada nuevo desde el ${a.desde}`).join('\n')}`, ''] : []),
  `<details><summary>${bien.length} comprobaciones correctas</summary>\n\n${bien.map((b) => `- ${b}`).join('\n')}\n</details>`,
  '',
].join('\n');
fs.writeFileSync('vigia.md', informe);
// Firma de los fallos: el issue solo recibe un comentario nuevo cuando cambia la lista, no en cada pasada.
fs.writeFileSync('vigia-firma.txt', fallos.map((f) => f.replace(/[\d.]+ h\b/g, 'N h')).sort().join('\n'));
fs.writeFileSync('vigia-atrasadas.json', JSON.stringify(atrasadas));
console.log(informe);
process.exit(fallos.length ? 1 : 0);
