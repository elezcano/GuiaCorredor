// Genera la web estática en dist/ a partir de data/ y content/.
// Uso: npm run build   (variables opcionales: SITE_URL, BASE_PATH)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJSON, loadGuia, esc, ESTADOS, SECCIONES, PAISES, OPERATIVA, operativaDe } from './lib.mjs';
import { nivel, peor, estadoMostrable, NIVELES, diasEntre, registroGuia, EVIDENCIAS } from './validacion.mjs';
import { cargar } from './datos.mjs';
import { generarApi } from './api.mjs';
import { aplicarEstimaciones } from './estimaciones.mjs';
import { fiabilidad, ETIQUETAS_DIA } from './fiabilidad.mjs';
import { cargarCruces, configEnvio, TRAMOS_TIEMPO, SENTIDOS, DIAS, MINIMO, CAMPOS_SOLICITUD } from './cruces.mjs';

const require = createRequire(import.meta.url);
let marked;
try {
  ({ marked } = require('marked'));
} catch {
  console.error('Falta la dependencia "marked". Ejecuta: npm install');
  process.exit(1);
}

const DIST = path.join(ROOT, 'dist');
const site = readJSON('data/site.json');
if (process.env.SITE_URL) site.url = process.env.SITE_URL;
if (process.env.BASE_PATH) site.basePath = process.env.BASE_PATH === '/' ? '' : process.env.BASE_PATH;
const B = (site.basePath || '').replace(/\/$/, '');
const u = (p) => `${B}${p}`;
const hayMapLibre = (() => {
  try {
    createRequire(import.meta.url).resolve('maplibre-gl/package.json');
    return true;
  } catch {
    return false;
  }
})();
// HU-115: trazados y km calculados con OpenStreetMap (data/trazados.json), si existen.
const TRAZADOS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'trazados.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const kmCalc = (t, via) => TRAZADOS?.tramos?.[`${t.id}${via ? `@${via.id}` : ''}`]?.km ?? null;
const hayFuente = (() => {
  try {
    createRequire(import.meta.url).resolve('@fontsource-variable/overpass/package.json');
    return true;
  } catch {
    return false;
  }
})();

const D = cargar();
const categorias = D.categorias;
const catNombre = Object.fromEntries(categorias.map((c) => [c.id, c.nombre]));
const rutas = D.rutas;
const nodoNombre = Object.fromEntries(rutas.nodos.map((n) => [n.id, n.nombre]));
const empresas = D.empresas;
empresas.sort((a, b) => Number(b.destacada) - Number(a.destacada) || a.nombre.localeCompare(b.nombre, 'es'));
const empresasEn = (ids = []) => empresas.filter((e) => (e.puntos || []).some((p) => ids.includes(p)));
const novedades = D.novedades.sort((a, b) => b.publicado.localeCompare(a.publicado));

// ---------- datos operativos ----------
const HOY = process.env.FECHA_HOY || new Date().toISOString().slice(0, 10);
const diasDesde = (iso) => (iso ? Math.floor((Date.parse(HOY) - Date.parse(iso)) / 864e5) : Infinity);
const fichaPasos = D.pasos;
const fichaPaso = Object.fromEntries(fichaPasos.map((p) => [p.id, p]));
// Validación: una sola regla para todo el portal (scripts/validacion.mjs).
const metaGuia = Object.fromEntries(loadGuia().map((p) => [`${p.seccion}/${p.slug}`, p.meta]));
const registroFicha = registroGuia;
const nivelFicha = (ruta) => (metaGuia[ruta] ? nivel(registroFicha(metaGuia[ruta]), 'ficha', HOY) : null);
const guiaDePaso = Object.fromEntries(rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).filter(Boolean).map((q) => [q.id, q.guia]));
/** Estado mostrable de un paso: combina la validación del dato y la de su ficha. */
// Decisión del 15/11/2026: lo que importa es la operatividad. El estado de un paso o tramo se confirma
// por su propia verificación; que el texto de la ficha de la guía esté en revisión no lo oculta.
const estadoPaso = (id) => estadoMostrable(fichaPaso[id]?.estado, HOY);
const estadoTramo = (t) => (t.paso?.id ? estadoPaso(t.paso.id) : estadoMostrable(t.reporte, HOY));
// Estimaciones provisionales de distancia (solo tramos sin km con fuente).
aplicarEstimaciones(rutas, fichaPasos, site.estimaciones?.provisionales !== false);
rutas.tramos.forEach((t) => {
  t.vista = estadoTramo(t);
  t.estado = t.vista.valor;
  t.op = t.vista.op = operativaDe(t.estado, t.paso ? 'paso' : 'tramo');
  if (t.alternativa?.id) {
    t.alternativa.vista = estadoPaso(t.alternativa.id);
    t.alternativa.estado = t.alternativa.vista.valor;
    t.alternativa.op = t.alternativa.vista.op = operativaDe(t.alternativa.estado, 'paso');
  }
});
const tramoPorId = Object.fromEntries(rutas.tramos.map((t) => [t.id, t]));
const nombreTramo = (t) => `${nodoNombre[t.desde]} – ${nodoNombre[t.hasta]}`;
const festivosDoc = D.festivos;
const festivos = festivosDoc.festivos.filter((f) => f.fecha >= HOY);
const incidencias = D.incidencias;
const activas = incidencias.filter((i) => i.estado === 'activa');
const avisosMeteo = D.avisos.filter((a) => !a.vigenteHasta || a.vigenteHasta >= HOY);
const organismos = D.organismos;
const organismoPorId = Object.fromEntries(organismos.map((o) => [o.id, o]));
const TIPOS_INCIDENCIA = {
  obra: ['Obra', 'obra'],
  restriccion: ['Restricción', 'restriccion'],
  corte: ['Cortes por clima', 'corte'],
  pendiente: ['Sin habilitar', 'pendiente'],
  peso: ['Límite de peso', 'restriccion'],
  desvio: ['Desvío', 'restriccion'],
  otro: ['Aviso', 'restriccion'], // HU-130: observaciones de Vialidad sobre una ruta habilitada
};
const TIPOS_FESTIVO = { feriado: 'Feriado', 'no-laborable': 'No laborable', facultativo: 'Punto facultativo' };

// Tiempos de cruce
const pasos = rutas.tramos.flatMap((t) => [t.paso, t.alternativa].filter(Boolean));
const pasoPorGuia = Object.fromEntries(pasos.filter((p) => p.guia).map((p) => [p.guia, p]));
let envioCruce = configEnvio(site.cruces?.enlacePrellenado);
if (envioCruce?.error) {
  console.warn(`Aviso: tiempos de cruce sin formulario: ${envioCruce.error}.`);
  envioCruce = null;
}
const cruces = await cargarCruces(site.cruces, new Set(pasos.map((p) => p.id)));
cruces.avisos.forEach((a) => console.warn(`Aviso: ${a}`));
const nombreTiempo = Object.fromEntries(TRAMOS_TIEMPO.map((t) => [t.id, t]));

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const guia = loadGuia().map((p) => {
  const indice = [];
  const html = marked
    .parse(p.body)
    .replace(/href="\/(?!\/)/g, `href="${B}/`)
    .replace(/<h2>(.*?)<\/h2>/g, (_, t) => {
      const id = slugify(t);
      indice.push({ id, t: t.replace(/<[^>]+>/g, '') });
      return `<h2 id="${id}">${t}</h2>`;
    })
    .replace(/<table>/g, '<div class="tabla-marco"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return { ...p, html, indice };
});
const guiaPorRuta = Object.fromEntries(guia.map((p) => [`${p.seccion}/${p.slug}`, p]));
// Estado de una ficha: los pasos lo toman de data/pasos.json (función declarada más abajo).
const vistaGuia = (p) => {
  const ruta = `${p.seccion}/${p.slug}`;
  const id = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.guia === ruta)?.id;
  if (id) return estadoPaso(id);
  const ts = rutas.tramos.filter((t) => t.guia === ruta && !t.paso);
  if (!ts.length) return null; // documentos: sin estado operativo
  // El tramo con el dato más relevante: obras antes que operativo.
  return ts.map((t) => t.vista).sort((a, b) => Number(b.ultimo === 'en-obras') - Number(a.ultimo === 'en-obras'))[0];
};
const estadoGuia = (p) => vistaGuia(p)?.valor || 'sin-estado';
const nivelGuia = (p) => nivelFicha(`${p.seccion}/${p.slug}`);

// ---------- iconos (trazo, 24×24) ----------
const ICONOS = {
  telefono: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z',
  intercambiar: 'M4 8h16M16 4l4 4-4 4M20 16H4M8 12l-4 4 4 4',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  sol: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  luna: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  ruta: 'M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 17V9a4 4 0 0 1 4-4h6M18 7v8a4 4 0 0 1-4 4H8',
  noticias: 'M4 5h16v14H4zM8 9h8M8 13h8M8 17h4',
  guia: 'M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7',
  empresas: 'M4 21V6l8-3v18M12 9l8 3v9M2 21h20M8 9v0M8 13v0M8 17v0M16 15v0M16 18v0',
  chat: 'M4 20l1.5-4.5A8 8 0 1 1 8.5 19z',
  correo: 'M3 5h18v14H3zM3 7l9 6 9-6',
  frontera: 'M5 21V4M5 4h11l-2 4 2 4H5',
  aviso: 'M12 3l10 18H2zM12 10v5M12 18v0',
  calendario: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  papeles: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  imprimir: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  obra: 'M3 21h18M5 21l5-14h4l5 14M8 14h8',
  corte: 'M4 4l16 16M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  restriccion: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM7 12h10',
  pendiente: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
};
const icono = (n, clase = 'icono') =>
  `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;

// ---------- piezas comunes ----------
/** Chip del semáforo operativo: icono + texto (+ detalle del estado si aporta). */
const estado = (e, tipo = 'paso') => {
  const op = operativaDe(e, tipo);
  const det = ESTADOS[e] && !['pendiente', 'operativo', 'restricciones'].includes(e) && ESTADOS[e] !== OPERATIVA[op].texto ? `<span class="estado-detalle">· ${esc(ESTADOS[e])}</span>` : '';
  return `<span class="estado estado-${esc(e)} op-${op}">${OPERATIVA[op].icono}<span class="estado-texto">${esc(OPERATIVA[op].texto)}</span>${det}</span>`;
};
/** «hace 8 días», «hace 5 meses». */
const haceTiempo = (iso) => {
  const d = diasDesde(iso);
  if (!Number.isFinite(d)) return '';
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 31) return `hace ${d} días`;
  const m = Math.round(d / 30.4);
  return m < 12 ? `hace ${m === 1 ? 'un mes' : `${m} meses`}` : `hace ${Math.round(d / 365) === 1 ? 'un año' : `${Math.round(d / 365)} años`}`;
};
// Banderas en SVG (los emojis de bandera no se ven en Windows: salen como «PY»). Accesibles con aria-label.
const BANDERAS = {
  AR: '<rect width="30" height="20" fill="#74ACDF"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#F6B40E"/>',
  BR: '<rect width="30" height="20" fill="#009C3B"/><path d="M15 2.5 27 10 15 17.5 3 10z" fill="#FFDF00"/><circle cx="15" cy="10" r="4" fill="#002776"/>',
  CL: '<rect width="30" height="20" fill="#fff"/><rect y="10" width="30" height="10" fill="#D52B1E"/><rect width="10" height="10" fill="#0039A6"/><path d="m5 2.4 1.1 3.3h3.4l-2.8 2 1.1 3.3L5 9l-2.8 2 1.1-3.3-2.8-2h3.4z" fill="#fff" transform="translate(0 -.4) scale(1) "/>',
  PY: '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#D52B1E"/><rect y="13.33" width="30" height="6.67" fill="#0038A8"/><circle cx="15" cy="10" r="2.3" fill="none" stroke="#1d6b2f" stroke-width=".9"/>',
};
const bandera = (p) =>
  BANDERAS[p]
    ? `<span class="pais pais-bandera" role="img" aria-label="${esc(PAISES[p] || p)}" title="${esc(PAISES[p] || p)}"><svg viewBox="0 0 30 20" width="21" height="14" aria-hidden="true" focusable="false">${BANDERAS[p]}</svg></span>`
    : `<abbr class="pais" title="${esc(PAISES[p] || p)}">${esc(p)}</abbr>`;
/** Sustituye los códigos de país de un texto (AR, BR, CL, PY) por su bandera accesible. */
const conBanderas = (txt = '') => esc(txt).replace(/\b(AR|BR|CL|PY)\b/g, (c) => bandera(c));
const paises = (ps = []) => `<span class="paises">${ps.map((p) => bandera(p)).join('')}</span>`;
const fecha = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
const tiempo = (iso) => `<time class="rel" datetime="${esc(iso)}">${fecha(iso)}</time>`;
const fechaCorta = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  // Con año si no es el año en curso, para que un dato viejo no parezca de este año.
  const conAnio = iso.slice(0, 4) !== HOY.slice(0, 4);
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace('.', '');
};
const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
const otras = (r) => (r?.otrasFuentes?.length ? ` · También: ${r.otrasFuentes.map((f) => fuenteEnlace(f)).join(', ')}` : '');
const fuenteEnlace = (f) => (f?.url ? `<a href="${esc(f.url)}" rel="noopener">${esc(f.nombre)}</a>` : esc(f?.nombre || ''));
const TIPO_FUENTE = { oficial: 'fuente oficial', prensa: 'prensa', referencia: 'obra de referencia', empresa: 'declaración de la empresa', otra: 'otra fuente' };
/** Insignia de validación (texto + icono, no solo color). */
/** HU-107: la insignia dice dónde se comprobó el dato, nunca quién. */
const verificadoEn = (fuente) => (fuente?.leidoAuto ? 'Leído de la web oficial' : fuente?.tipo === 'oficial' ? 'Verificado en fuente oficial' : 'Verificado en la fuente');
/** HU-133 (R3): texto del sello único. «Gendarmería · 18 nov · ✓ Web oficial» / «… · Verificado» / «… · Sin verificar». */
function selloCorto(n, verificado, fuente, publicado) {
  const quien = esc(fuente?.nombre || 'Sin fuente');
  const cuando = n === 'verificado' && verificado ? fechaCorta(verificado) : publicado ? fechaCorta(publicado) : '';
  const marca = n === 'verificado' && verificado ? (fuente?.leidoAuto ? '<span class="sello-ok">✓ Web oficial</span>' : `<span class="sello-ok">✓ ${fuente?.tipo === 'oficial' ? 'Oficial' : 'Verificado'}</span>`) : `<span class="sello-no">${esc(NIVELES[n]?.texto || 'Sin verificar')}</span>`;
  return [quien, cuando, marca].filter(Boolean).join(' · ');
}
function validacionHTML(n, verificado, fuente) {
  const txt = n === 'verificado' && verificado ? `${verificadoEn(fuente)} el ${fechaCorta(verificado)}` : NIVELES[n]?.texto || n;
  return `<span class="val val-${esc(n)}">${esc(txt)}</span>`;
}
/** Estado operativo + línea de contexto: confirmado, o "Por verificar" con el último dato. */
function vistaHTML(v, { corto = false, tipo = 'paso' } = {}) {
  if (v.confirmado) return `${estado(v.valor, tipo)}<span class="estado-fecha sello-linea">${selloCorto('verificado', v.verificado, v.fuente)}</span>`;
  if (!v.ultimo) return `${estado('pendiente')}<span class="estado-fecha">Sin datos</span>`;
  const dias = diasDesde(v.publicado);
  const viejo = dias > 30; // un parte operativo de más de un mes ya no sirve para decidir
  const cuando = v.publicado ? `${corto ? fechaCorta(v.publicado) : fecha(v.publicado)} <span class="edad${viejo ? ' edad-vieja' : ''}">(${haceTiempo(v.publicado)})</span>` : 'sin fecha';
  const origen = !corto && v.fuente?.tipo ? `, ${TIPO_FUENTE[v.fuente.tipo]}` : '';
  const dato = v.ultimo === 'pendiente' ? 'sin estado confirmado' : `último dato: ${esc((ESTADOS[v.ultimo] || v.ultimo).toLowerCase())}`;
  return `${estado('pendiente')}<span class="estado-fecha">${dato[0].toUpperCase() + dato.slice(1)}, ${cuando}${origen}</span>`;
}
const estadoPasoHTML = (id, o) => vistaHTML(estadoPaso(id), o);
const HISTORICO_DIAS = 90;
const esHistorico = (iso) => diasDesde(iso) > HISTORICO_DIAS;
const recientes = novedades.filter((n) => !esHistorico(n.publicado));
const nivelReg = (r, tipo) => nivel(r, tipo, HOY);
/** Incidencias activas de un paso o de cualquiera de sus tramos. */
// Misma regla que el planificador: una incidencia con paso solo cuenta para ese paso; sin paso, para sus tramos.
const incidenciasDe = ({ paso, tramos = [] }) => activas.filter((i) => (i.paso ? i.paso === paso : (i.tramos || []).some((t) => tramos.includes(t))));
const tipoIncidencia = (t) => {
  const [txt, ic] = TIPOS_INCIDENCIA[t] || [t, 'restriccion'];
  return `<span class="tipo-inc tipo-${esc(ic)}">${icono(ic)}${esc(txt)}</span>`;
};
const km = (n) => (typeof n === 'number' ? `${n.toLocaleString('es-ES')}\u202fkm` : '');
const wa = (n) => `https://wa.me/${String(n).replace(/\D/g, '')}`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const listaY = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

// HU-133: accesos de negocio. Hasta la HU-95 (formulario con hoja privada), preparan un email al contacto del proyecto.
const correo = (asunto, cuerpo) => `mailto:${site.contacto.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
const cotizacion = (ruta = '') =>
  correo(`Pedir cotización${ruta ? `: ${ruta}` : ''}`, `Origen y destino: ${ruta || ''}\nTipo de carga:\nPeso o volumen:\nFecha de carga:\nEmpresa y teléfono:\n`);
const cargaRetorno = () => correo('Carga de retorno', 'Tengo un camión vacío en (ciudad):\nDisponible desde (fecha):\nTipo de camión:\nHacia (destino preferido):\nEmpresa y teléfono:\n');

// HU-133 (R4): siempre las dos horas. «19:00 en Argentina (23:00 en España)», con la zona de cada país en la fecha del dato.
const ZONA_ES = 'Europe/Madrid';
const minutosDesfase = (zona, dia) => {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date(`${dia}T12:00:00Z`)).find((x) => x.type === 'timeZoneName').value;
  if (v === 'GMT') return 0;
  const [, sg, h, m] = v.match(/GMT([+-])(\d\d):(\d\d)/);
  return (sg === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
};
const ZONA_PAIS = { 'America/Argentina/Salta': 'Argentina', 'America/Argentina/Catamarca': 'Argentina', 'America/Argentina/Cordoba': 'Argentina', 'America/Argentina/Buenos_Aires': 'Argentina', 'America/Argentina/Jujuy': 'Argentina', 'America/Santiago': 'Chile', 'America/Asuncion': 'Paraguay', 'America/Campo_Grande': 'Brasil' };
function enEspana(hhmm, zona, dia = HOY) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m - minutosDesfase(zona, dia) + minutosDesfase(ZONA_ES, dia);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
const rangoDosHoras = (a, c, zona, dia = HOY) => `${a}–${c} en ${paisDeZona(zona)} (${enEspana(a, zona, dia)}–${enEspana(c, zona, dia)} en España)`;
const paisDeZona = (z) => ZONA_PAIS[z] || (/^America\/Argentina\//.test(z) ? 'Argentina' : 'hora local');
const dosHoras = (hhmm, zona, dia = HOY) => `${hhmm} en ${paisDeZona(zona)} (${enEspana(hhmm, zona, dia)} en España)`;

const marca = `<span class="placa"><span class="placa-l1">Guía del</span><span class="placa-l2">Corredor</span></span>`;

const temaInicial = `<script>try{var t=localStorage.getItem('guia-corredor:tema');if(t==='oscuro'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.tema='oscuro'}catch(e){}</script>`;

function layout({ titulo, descripcion, ruta, cuerpo, scripts = [], datos = '', estilos = [] }) {
  const t = titulo ? `${titulo} | ${site.nombre}` : site.nombreCompleto;
  const canon = `${site.url.replace(/\/$/, '')}${u(ruta)}`;
  // HU-133 (Versión 2): cuatro secciones. Avisos cuelga de Hoy; calendario y papeles, de Fronteras (y de cada paso).
  const secciones = [
    ['/', 'Hoy', 'sol', (r) => r === '/' || r.startsWith('/avisos/') || r.startsWith('/novedades/')],
    ['/planificador/', 'Rutas', 'ruta', (r) => r.startsWith('/planificador/') || r.startsWith('/informe/')],
    ['/pasos/', 'Fronteras', 'frontera', (r) => r.startsWith('/pasos/') || r.startsWith('/guia/') || r.startsWith('/calendario/') || r.startsWith('/papeles/')],
    ['/directorio/', 'Servicios', 'empresas', (r) => r.startsWith('/directorio/') || r.startsWith('/anunciate/')],
  ];
  const nav = secciones.map(([href, txt, , activo]) => `<a href="${u(href)}"${activo(ruta) ? ' aria-current="page"' : ''}>${txt}</a>`).join('');
  const barra = secciones.map(([href, txt, ic, activo]) => `<a href="${u(href)}"${activo(ruta) ? ' aria-current="page"' : ''}>${icono(ic)}<span>${txt}</span></a>`).join('');
  return `<!DOCTYPE html>
<html lang="${site.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t)}</title>
<meta name="description" content="${esc(descripcion || site.lema)}">
<link rel="canonical" href="${esc(canon)}">${site.indexable === false ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(descripcion || site.lema)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e1012" media="(prefers-color-scheme: dark)">
${temaInicial}
${hayFuente ? `<link rel="preload" href="${u('/assets/fonts/overpass-latin.woff2')}" as="font" type="font/woff2" crossorigin>` : ''}
<link rel="stylesheet" href="${u('/assets/styles.css')}">${estilos.map((e) => `\n<link rel="stylesheet" href="${u(e)}">`).join('')}
</head>
<body>
<a class="saltar" href="#contenido">Ir al contenido</a>
<header class="cabecera">
  <div class="contenedor cabecera-inner">
    <a class="logo" href="${u('/')}" aria-label="${esc(site.nombreCompleto)}, inicio">${marca}</a>
    <nav class="nav" aria-label="Principal">${nav}</nav>
    <div class="cabecera-acciones">
      <a class="boton-icono" href="${u('/buscar/')}" aria-label="Buscar en la guía"${ruta === '/buscar/' ? ' aria-current="page"' : ''}>${icono('buscar')}</a>
      <a class="btn btn-negocio btn-pequeno" href="${cotizacion()}">${icono('papeles')}Pedir cotización</a>
      <button class="boton-icono" type="button" id="cambiar-tema" aria-label="Activar modo oscuro">${icono('luna', 'icono icono-luna')}${icono('sol', 'icono icono-sol')}</button>
    </div>
  </div>
</header>
<main id="contenido">
${cuerpo}
</main>
<footer class="pie">
  <div class="contenedor pie-inner">
    <div class="pie-marca">${marca}<p>${esc(site.lema)}</p></div>
    <nav class="pie-nav" aria-label="Pie">
      <a href="${u('/planificador/')}">Planificar ruta</a>
      <a href="${u('/pasos/')}">Pasos fronterizos</a>
      <a href="${u('/avisos/')}">Obras y avisos</a>
      <a href="${u('/calendario/')}">Festivos</a>
      <a href="${u('/papeles/')}">Papeles</a>
      <a href="${u('/directorio/')}">Servicios</a>
      <a href="${u('/novedades/')}">Novedades</a>
      <a href="${u('/guia/')}">Todas las fichas</a>
      <a href="${u('/mapa/')}">Mapa interactivo</a>
      <a href="${u('/anunciate/')}">Anunciar mi empresa</a>
      <a href="${u('/sobre/')}">Cómo trabajamos la información</a>
      ${site.contacto.email ? `<a href="mailto:${esc(site.contacto.email)}">Escríbenos</a>` : ''}
    </nav>
    <p class="pie-aviso">${esc(site.aviso)}</p>
  </div>
</footer>
<nav class="barra-inferior" aria-label="Secciones">${barra}</nav>
${datos}
<script src="${u('/assets/comun.js')}" defer></script>
${scripts.map((s) => `<script src="${u(s)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

const seccion = ({ titulo, contexto, enlace, cuerpo, id = '', clase = '' }) => `
<section class="contenedor seccion ${clase}"${id ? ` id="${id}"` : ''} aria-labelledby="t-${slugify(titulo)}">
  <div class="seccion-cabeza">
    <div><h2 id="t-${slugify(titulo)}">${esc(titulo)}</h2>${contexto ? `<p>${esc(contexto)}</p>` : ''}</div>
    ${enlace ? `<a class="enlace-seccion" href="${u(enlace[0])}">${esc(enlace[1])}</a>` : ''}
  </div>
  ${cuerpo}
</section>`;

/** Corredor como carretera. Horizontal en escritorio, vertical en móvil. */
function rutaHTML() {
  const items = [];
  // HU-115: la carretera dibuja la ruta principal; los ramales (Calama → Mejillones, Iquique) van en una línea aparte.
  const principales = rutas.tramos.filter((t) => !t.ramal);
  const ramales = rutas.tramos.filter((t) => t.ramal);
  rutas.nodos.slice(0, principales.length + 1).forEach((n, i) => {
    const nEmp = empresasEn([n.id]).length;
    items.push(`<li class="parada" data-i="${i}"><span class="via" aria-hidden="true"><span class="punto"></span></span>
      <span class="texto"><strong>${esc(n.nombre)}</strong><span class="parada-pais">${esc(PAISES[n.pais])}</span>${
        nEmp ? `<a class="parada-empresas" href="${u(`/directorio/?punto=${n.id}`)}">${plural(nEmp, 'empresa', 'empresas')}</a>` : ''
      }</span></li>`);
    const t = principales[i];
    if (!t) return;
    const enlace = t.paso?.guia || t.guia;
    const etiqueta = t.paso ? `${rutas.nodos[i].pais}–${rutas.nodos[i + 1].pais}` : km(t.km);
    const contenido = `<span class="tramo-estado">${estado(t.estado, t.paso ? 'paso' : 'tramo')}</span>${
      etiqueta ? `<span class="tramo-etiqueta">${t.paso ? '<span class="frontera">Frontera</span>' : ''}${esc(etiqueta)}</span>` : ''
    }`;
    items.push(`<li class="tramo tramo-${esc(t.estado)} tramo-op-${t.op}${t.paso ? ' tramo-frontera' : ''}" data-i="${i}"><span class="via" aria-hidden="true"></span>
      ${enlace ? `<a class="texto" href="${u(`/guia/${enlace}/`)}">${contenido}</a>` : `<span class="texto">${contenido}</span>`}</li>`);
  });
  const nota = ramales.length
    ? `<p class="ruta-ramales">También: ${ramales.map((t) => `${esc(nodoNombre[t.hasta])}`).join(' e ')}, desde ${esc(nodoNombre[ramales[0].desde])}.</p>`
    : '';
  return `<div class="carretera-marco"><ol class="ruta" id="ruta-corredor" aria-label="Recorrido del corredor de este a oeste">${items.join('')}</ol>${nota}</div>`;
}

// HU-116: puntos agrupados por país, en el orden del corredor (el valor sigue siendo el índice del nodo).
const opcionesNodos = (sel) =>
  [...new Set(rutas.nodos.map((n) => n.pais))]
    .map(
      (pais) =>
        `<optgroup label="${esc(PAISES[pais])}">${rutas.nodos
          .map((n, i) => (n.pais === pais ? `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(n.nombre)}</option>` : ''))
          .join('')}</optgroup>`
    )
    .join('');

const buscador = (clase = '') => `
<form class="buscador ${clase}" action="${u('/planificador/')}" method="get" role="search" aria-label="Buscar ruta">
  <div class="campos">
    <label class="campo campo-desde"><span>Desde</span><select name="desde" id="origen">${opcionesNodos(0)}</select></label>
    <button class="intercambiar" type="button" id="intercambiar" aria-label="Intercambiar origen y destino">${icono('intercambiar')}</button>
    <label class="campo campo-hasta"><span>Hasta</span><select name="hasta" id="destino">${opcionesNodos(rutas.nodos.length - 1)}</select></label>
    <button class="btn btn-principal" type="submit">${icono('buscar')}Buscar ruta</button>
  </div>
</form>`;

const empresaFila = (e) => `
<li class="empresa" data-pais="${esc(e.pais)}" data-categoria="${esc(e.categoria)}" data-puntos="${esc((e.puntos || []).join(' '))}" data-texto="${esc(
  [e.nombre, e.ciudad, catNombre[e.categoria], ...(e.servicios || []), ...(e.puntos || []).map((p) => nodoNombre[p])].join(' ').toLowerCase()
)}">
  <div>
    <div class="empresa-cabeza"><h3>${esc(e.nombre)}</h3>${e.destacada ? '<span class="etiqueta">Destacada</span>' : ''}${
      ''
    }</div>
    <p class="empresa-datos">${esc(catNombre[e.categoria] || e.categoria)} en ${esc(e.ciudad)}, ${esc(PAISES[e.pais] || e.pais)}</p>
    ${e.descripcion ? `<p class="empresa-desc">${esc(e.descripcion)}</p>` : ''}
    ${e.puntos?.length ? `<p class="empresa-puntos">Da servicio en ${esc(listaY(e.puntos.map((p) => nodoNombre[p] || p)))}</p>` : ''}
    ${e.servicios?.length ? `<ul class="servicios">${e.servicios.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="empresa-acciones">
    ${e.contacto?.whatsapp ? `<a class="btn btn-wa btn-pequeno" href="${wa(e.contacto.whatsapp)}" rel="nofollow">${icono('chat')}Escribir por WhatsApp</a>` : ''}
    ${e.contacto?.email ? `<a class="btn btn-borde btn-pequeno" href="mailto:${esc(e.contacto.email)}">Enviar email</a>` : ''}
    ${e.contacto?.web ? `<a class="btn btn-borde btn-pequeno" href="${esc(e.contacto.web)}" rel="nofollow noopener">Abrir web</a>` : ''}
    ${!e.contacto?.whatsapp && !e.contacto?.email && !e.contacto?.web ? '<span class="sin-contacto">Sin datos de contacto</span>' : ''}
  </div>
</li>`;

const empresaMini = (e) => `
<li class="mini${e.destacada ? ' mini-destacada' : ''}">
  <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(catNombre[e.categoria] || e.categoria)}</span></span>
  ${e.contacto?.whatsapp ? `<a class="btn btn-wa btn-pequeno" href="${wa(e.contacto.whatsapp)}" rel="nofollow" aria-label="Escribir por WhatsApp a ${esc(e.nombre)}">${icono('chat')}</a>` : ''}
</li>`;

const noticia = (n, { principal = false, conLugar = true } = {}) => {
  const lugar = n.guia && guiaPorRuta[n.guia];
  return `
<article class="noticia${principal ? ' noticia-principal' : ''}">
  <p class="noticia-meta"><span class="noticia-medio">${esc(n.fuente.nombre)}</span><span>${esc(listaY((n.paises || []).map((p) => PAISES[p] || p)))}</span>${tiempo(n.publicado)}${esHistorico(n.publicado) ? '<span class="etiqueta-suave">Histórico</span>' : ''}</p>
  <h3><a href="${esc(n.fuente.url)}" rel="noopener">${esc(n.titulo)}</a></h3>
  ${n.detalle ? `<p>${esc(n.detalle)}</p>` : ''}
  ${conLugar && lugar ? `<a class="noticia-lugar" href="${u(lugar.ruta)}">Abrir ${esc(lugar.meta.titulo.replace(/\s*\(.*\)$/, ''))}</a>` : ''}
</article>`;
};

// ---------- páginas ----------
const paginas = [];
const add = (ruta, html) => paginas.push({ ruta, html });

const pasosArr = () => (Array.isArray(D.pasos) ? D.pasos : D.pasos.pasos);
const datosRutas = (extra = {}) =>
  `<script type="application/json" id="datos-rutas">${JSON.stringify({
    nodos: rutas.nodos,
    // HU-116: km calculados con OpenStreetMap por tramo (y por el paso alternativo), para el planificador.
    tramos: rutas.tramos.map((t) => ({ ...t, kmCalc: kmCalc(t, t.paso), alternativa: t.alternativa ? { ...t.alternativa, kmCalc: kmCalc(t, t.alternativa) } : t.alternativa })),
    ladosPaso: Object.fromEntries(pasosArr().map((q) => [q.id, Object.keys(q.lados)])),
    documentosCruce: rutas.documentosCruce,
    avisoDocumentos: rutas.avisoDocumentos,
    tiposCarga: rutas.tiposCarga,
    estados: ESTADOS,
    operativa: OPERATIVA,
    paises: PAISES,
    base: B,
    cruces: { porPaso: cruces.porPaso, tramos: TRAMOS_TIEMPO, sentidos: SENTIDOS, dias: DIAS },
    // Festivos de los próximos 45 días e incidencias activas por paso, para avisar en el planificador.
    festivos: festivos
      .filter((f) => diasDesde(f.fecha) >= -45)
      .map((f) => ({ pais: f.pais, fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, porConfirmar: f.validacion !== 'verificado' })),
    incidencias: activas.map((i) => ({
      id: i.id,
      paso: i.paso || null,
      tramos: i.tramos || [],
      tipo: TIPOS_INCIDENCIA[i.tipo]?.[0] || i.tipo,
      ubicacion: i.ubicacion,
      texto: i.descripcion,
      fuente: i.fuente.nombre,
      publicado: i.publicado,
      nivel: nivelReg(i, 'incidencia'),
      // HU-130: info no cambia el veredicto; rojo impide el paso (afecta: carga → «No habilitado para carga»).
      gravedad: i.gravedad || 'ambar',
      afecta: i.afecta || 'todo',
    })),
    niveles: Object.fromEntries(Object.entries(NIVELES).map(([k, v]) => [k, v.texto])),
    tiposFuente: TIPO_FUENTE,
    calendario: u('/calendario/'),
    avisos: u('/avisos/'),
    contacto: site.contacto.email || '',
    ...extra,
  }).replace(/</g, '\\u003c')}</script>`;

/** "Cruce 2–4 h" con el sentido más reportado, si hay datos suficientes. */
function cruceCorto(id) {
  const s = Object.values(cruces.porPaso[id] || {}).filter((x) => x.mediana).sort((a, b) => b.n - a.n)[0];
  return s ? `<span class="historia-cruce">Cruce ${nombreTiempo[s.mediana].nombre}</span>` : '';
}

/** Panel lateral de la página de un paso: tiempos reportados y formulario para contar el tuyo. */
function panelCruce(paso) {
  const datos = cruces.porPaso[paso.id] || {};
  const hayDatos = Object.keys(datos).length > 0;
  if (!envioCruce && !hayDatos) return '';
  const fila = (sentido) => {
    const s = datos[sentido];
    let valor;
    if (s?.mediana) {
      const max = Math.max(...Object.values(s.cuenta));
      const barras = TRAMOS_TIEMPO.map(
        (t) => `<li${t.id === s.mediana ? ' class="es-mediana"' : ''}><span class="barra" style="--h:${Math.round((s.cuenta[t.id] / max) * 100)}%"></span><span class="barra-txt">${t.corto}</span></li>`
      ).join('');
      valor = `<dd><strong>${nombreTiempo[s.mediana].nombre}</strong><span>${plural(s.n, 'reporte', 'reportes')}</span></dd>
        <dd class="cruce-barras"><ul aria-hidden="true">${barras}</ul></dd>`;
    } else {
      valor = s
        ? `<dd><strong class="sin-dato">Faltan datos</strong><span>${plural(s.n, 'reporte', 'reportes')} de ${MINIMO} necesarios</span></dd>`
        : `<dd><strong class="sin-dato">Nadie lo ha contado esta semana</strong></dd>`;
    }
    return `<div class="cruce-fila"><dt>${SENTIDOS[sentido]}</dt>${valor}</div>`;
  };
  const opcion = (nombre, valor, texto, req = false) =>
    `<label class="chip chip-radio"><input type="radio" name="${nombre}" value="${esc(valor)}"${req ? ' required' : ''}>${texto}</label>`;
  const formulario = envioCruce
    ? `<button class="btn btn-principal" type="button" data-abrir>Contar mi tiempo</button>
      <form class="cruce-form" data-form hidden>
        <fieldset><legend>Sentido</legend><div class="chips">${Object.entries(SENTIDOS).map(([k, v], i) => opcion('sentido', k, v, i === 0)).join('')}</div></fieldset>
        <fieldset><legend>Cuánto tardaste</legend><div class="chips">${TRAMOS_TIEMPO.map((t, i) => opcion('tiempo', t.id, t.nombre, i === 0)).join('')}</div></fieldset>
        <fieldset><legend>Cuándo cruzaste</legend><div class="chips">${opcion('cuando', '0', 'Hoy', true)}${opcion('cuando', '1', 'Ayer')}</div></fieldset>
        <p class="cruce-error" data-error role="alert" hidden></p>
        <div class="cruce-acciones"><button class="btn btn-principal" type="submit">Enviar mi tiempo</button><button class="btn btn-texto" type="button" data-cancelar>Cancelar</button></div>
      </form>
      <p class="cruce-gracias" data-gracias role="status" hidden></p>`
    : '';
  return `<section class="panel cruce" aria-labelledby="t-cruce" data-cruce="${esc(paso.id)}"${
    envioCruce ? ` data-accion="${esc(envioCruce.accion)}" data-campos="${esc(JSON.stringify(envioCruce.campos))}"` : ''
  }>
    <h2 id="t-cruce">Tiempo de cruce</h2>
    <p>De la fila a la salida de la aduana. Lo que contaron otros en los últimos ${DIAS} días.</p>
    <dl class="cruce-sentidos">${Object.keys(SENTIDOS).map(fila).join('')}</dl>
    ${formulario}
  </section>`;
}

/** Fila de festivo: fecha, país, nombre y si está por confirmar. */
const filaFestivo = (f) => `<li class="fila-fest">
  <time datetime="${esc(f.fecha)}"><span>${esc(diaSemana(f.fecha))}</span>${esc(fechaCorta(f.fecha))}</time>
  ${bandera(f.pais)}
  <span class="fest-nombre">${esc(f.nombre)}${f.tipo !== 'feriado' ? `<span class="etiqueta-suave">${esc(TIPOS_FESTIVO[f.tipo])}</span>` : ''}${f.validacion !== 'verificado' ? '<span class="etiqueta-suave">Por confirmar</span>' : ''}</span>
</li>`;

const enlaceOrganismo = (o) => `<li>${bandera(o.pais)}<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a></li>`;

/** Portada: festivos, obras y meteorología en tres paneles. */
function tablero() {
  const ultimaInc = incidencias.map((i) => i.publicado).filter(Boolean).sort().pop();
  const meteo = avisosMeteo.length
    ? `<ul class="lista-inc">${avisosMeteo
        .slice(0, 3)
        .map((a) => `<li><strong>${esc(a.titulo)}</strong><span>${esc(a.zona)}. Hasta el ${fecha(a.vigenteHasta)}. Fuente: ${fuenteEnlace(a.fuente)}</span></li>`)
        .join('')}</ul>`
    : `<p class="nota-panel">No hay avisos cargados. Consulta los servicios oficiales:</p><ul class="lista-enlaces">${organismos
        .filter((o) => o.tipo === 'meteorologia')
        .map(enlaceOrganismo)
        .join('')}</ul>`;
  return `<div class="tablero">
  <section class="panel tablero-panel" aria-labelledby="t-tab-fest">
    <h3 id="t-tab-fest">Próximos festivos</h3>
    <p>Comprueba la atención de aduanas y organismos en estas fechas.</p>
    <ul class="lista-fest">${festivos.slice(0, 5).map(filaFestivo).join('')}</ul>
    <a class="enlace-mas" href="${u('/calendario/')}">Abrir el calendario</a>
  </section>
  <section class="panel tablero-panel" aria-labelledby="t-tab-obras">
    <h3 id="t-tab-obras">Obras y restricciones</h3>
    <p>${plural(activas.length, 'incidencia activa', 'incidencias activas')}, sin verificar salvo indicación. Última publicada el ${fecha(ultimaInc)}.</p>
    <ul class="lista-inc">${activas
      .slice(0, 3)
      .map((i) => `<li>${tipoIncidencia(i.tipo)}<strong>${esc(i.ubicacion)}</strong><span>${esc(i.descripcion)}</span></li>`)
      .join('')}</ul>
    <a class="enlace-mas" href="${u('/avisos/#obras')}">Ver obras y restricciones</a>
  </section>
  <section class="panel tablero-panel" aria-labelledby="t-tab-meteo">
    <h3 id="t-tab-meteo">Meteorología y alertas</h3>
    <p>${avisosMeteo.length ? plural(avisosMeteo.length, 'aviso vigente', 'avisos vigentes') : 'Las predicciones las publica cada país.'}</p>
    ${meteo}
    <a class="enlace-mas" href="${u('/avisos/#meteorologia')}">Ver alertas y estado de rutas</a>
  </section>
</div>`;
}

/** Mapa esquemático con posiciones aproximadas (proyección equirectangular). */
function mapaHTML() {
  const LON0 = -72.3, LAT0 = -19.3, K = 56.4, COS = 0.924;
  const X = (lon) => +((lon - LON0) * COS * K).toFixed(1);
  const Y = (lat) => +((LAT0 - lat) * K).toFixed(1);
  const n = Object.fromEntries(rutas.nodos.map((x) => [x.id, x]));
  // Un paso sin coordenadas con fuente se dibuja entre las dos localidades de su tramo (posición esquemática).
  const loc = (id) => {
    const u = fichaPaso[id].ubicacion;
    if (u.lat != null) return u;
    const t = rutas.tramos.find((x) => x.paso?.id === id || x.alternativa?.id === id);
    const a = n[t.desde], b = n[t.hasta];
    return id === 'pozo-hondo' ? n['pozo-hondo'] : { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2, esquematica: true };
  };
  const linea = (pts) => pts.map((o) => `${X(o.lon)},${Y(o.lat)}`).join(' ');
  // Cada tramo con su estado: color = semáforo; discontinua = distancia estimada; hueca = sin confirmar.
  const segmento = (t, alt = false) => {
    const via = alt ? t.alternativa : t.paso;
    const pts = [n[t.desde], ...(via ? [loc(via.id)] : []), n[t.hasta]];
    const v = alt ? t.alternativa.vista : t.vista;
    const op = v?.confirmado ? (alt ? t.alternativa.op : t.op) : 'sin-confirmar';
    const cls = `m-tramo m-op-${op}${typeof t.km === 'number' ? '' : ' m-estimado'}${alt ? ' m-alt' : ''}`;
    const titulo = `${nodoNombre[t.desde]} – ${nodoNombre[t.hasta]}${via ? ` por ${via.nombre}` : ''}: ${OPERATIVA[op].texto}${typeof t.km === 'number' ? '' : ', distancia estimada'}`;
    return `<g><title>${esc(titulo)}</title><polyline class="${cls}" points="${linea(pts)}"/>${op === 'sin-confirmar' ? `<polyline class="m-tramo-hueco${alt ? ' m-alt' : ''}${typeof t.km === 'number' ? '' : ' m-estimado'}" points="${linea(pts)}"/>` : ''}</g>`;
  };
  const tramosMapa = [...rutas.tramos.filter((t) => t.alternativa).map((t) => segmento(t, true)), ...rutas.tramos.map((t) => segmento(t))].join('');
  // Puertos de Chile (HU-115: cada uno con su punto y su ramal desde Calama).
  const puertos = [
    ['antofagasta', 10, 18],
    ['mejillones', 10, -8],
    ['iquique', 10, 4],
  ]
    .filter(([id]) => n[id])
    .map(([id, dx, dy]) => ({ id, nombre: n[id].nombre, lat: n[id].lat, lon: n[id].lon, dx, dy }));
  const costa = [[-70.15, -19.3], [-70.15, -20.2], [-70.25, -21], [-70.2, -21.6], [-70.3, -22.3], [-70.5, -23], [-70.6, -23.5], [-70.45, -24], [-70.55, -25.6]];
  const oceano = `${costa.map(([lo, la]) => `${X(lo)},${Y(la)}`).join(' ')} 0,${Y(-25.6)} 0,0`;
  const etiqueta = (x, y, t, sub, a = 'start') =>
    `<text x="${x}" y="${y}" text-anchor="${a}" class="m-txt">${esc(t)}</text>${sub ? `<text x="${x}" y="${y + 15}" text-anchor="${a}" class="m-sub">${esc(sub)}</text>` : ''}`;
  const ciudades = [
    ['campo-grande', 0, 24, 'middle'],
    ['mariscal-estigarribia', 0, 26, 'middle'],
    ['salta-jujuy', 12, 18],
    ['san-pedro-atacama', 10, -14],
    ['calama', 10, -10],
  ]
    .filter(([id]) => n[id])
    .map(([id, dx, dy, a = 'start']) => {
      const o = n[id];
      const x = X(o.lon), y = Y(o.lat);
      return `<a href="${u(`/directorio/?punto=${id}`)}" aria-label="${esc(o.nombre)}: empresas y servicios"><circle class="m-ciudad" cx="${x}" cy="${y}" r="6"/>${etiqueta(x + dx, y + dy, o.nombre, '', a)}</a>`;
    })
    .join('');
  const posPaso = { 'puente-bioceanica': [0, -30, 'middle'], 'pozo-hondo': [0, -30, 'middle'], jama: [14, 0], sico: [-12, 22, 'end'] };
  const pasos = fichaPasos
    .map((p) => {
      const g = loc(p.id);
      const x = X(g.lon), y = Y(g.lat);
      const e = estadoPaso(p.id);
      const [dx, dy, a = 'start'] = posPaso[p.id] || [12, 4];
      const ruta = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id);
      const href = ruta?.guia ? u(`/guia/${ruta.guia}/`) : u('/pasos/');
      const opP = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
      return `<a href="${href}" aria-label="${esc(p.nombre)}: ${esc(OPERATIVA[opP].texto)}. Abrir la ficha"><rect class="m-paso m-${esc(e.valor)} m-pasoop-${opP}" x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})"/>${etiqueta(
        x + dx,
        y + dy,
        p.nombre,
        OPERATIVA[opP].texto,
        a
      )}</a>`;
    })
    .join('');
  const pts = puertos
    .map((q) => {
      const x = X(q.lon), y = Y(q.lat);
      return `<a href="${u(`/directorio/?punto=${q.id}`)}" aria-label="Puerto de ${esc(q.nombre)}: empresas y servicios"><rect class="m-puerto" x="${x - 5}" y="${y - 5}" width="10" height="10"/>${etiqueta(x + q.dx, y + q.dy, q.nombre)}</a>`;
    })
    .join('');
  const paisesM = [
    ['BRASIL', -20.3, -55.4],
    ['PARAGUAY', -20.9, -60.2],
    ['BOLIVIA', -20.1, -64.2],
    ['ARGENTINA', -25.0, -63.0],
    ['CHILE', -21.0, -69.4],
  ];
  return `<figure class="mapa">
  <div class="mapa-marco">
    <svg viewBox="0 0 1000 356" role="img" aria-labelledby="mapa-titulo mapa-desc">
      <title id="mapa-titulo">Mapa esquemático del Corredor Bioceánico</title>
      <desc id="mapa-desc">De Campo Grande (Brasil) a los puertos del norte de Chile, por Paraguay y Argentina. Esquema sin límites políticos. Las localidades y los pasos de Jama y Sico se sitúan con coordenadas con fuente; el Puente de la Bioceánica se dibuja entre sus dos localidades.</desc>
      <polygon class="m-oceano" points="${oceano}"/>
      <text class="m-mar" x="${X(-72.1)}" y="${Y(-24.9)}">Océano Pacífico</text>
      ${paisesM.map(([t, la, lo]) => `<text class="m-pais" x="${X(lo)}" y="${Y(la)}" text-anchor="middle">${t}</text>`).join('')}
      ${tramosMapa}
      ${ciudades}${pts}${pasos}
    </svg>
  </div>
  <figcaption>
    <ul class="mapa-leyenda">
      <li><span class="ley-color op-abierto" style="background:var(--ok-dot)"></span>Abierto</li>
      <li><span class="ley-color" style="background:var(--obras-dot)"></span>Con restricciones</li>
      <li><span class="ley-color" style="background:var(--corte-dot)"></span>No habilitado</li>
      <li><span class="ley-tramo ley-hueco"></span>Sin confirmar</li>
      <li><span class="ley-tramo"></span>Distancia con fuente</li>
      <li><span class="ley-tramo ley-estimado"></span>Distancia estimada</li>
      <li><span class="ley-paso"></span>Paso fronterizo (línea fina: alternativa por Sico)</li>
      <li><span class="ley-ciudad"></span>Ciudad</li>
      <li><span class="ley-puerto"></span>Puerto</li>
    </ul>
    <p>Esquema sin límites políticos. Las coordenadas tienen fuente; la de Salta / Jujuy es un punto de referencia que agrupa las dos ciudades.</p>
  </figcaption>
</figure>`;
}

/** Coordenadas con su fuente y precisión (P0.2). */
const PRECISION = { localidad: 'centro de la localidad', referencia: 'punto de referencia', paso: 'límite internacional', exacta: 'posición exacta' };
function coordenadasHTML(c, nota) {
  if (!c) return esc(nota || 'Sin coordenadas con fuente.');
  const n = (x) => x.toLocaleString('es-ES', { maximumFractionDigits: 5 });
  return `Coordenadas: ${n(c.lat)}, ${n(c.lon)} (${esc(PRECISION[c.precision] || c.precision)}, ${esc(EVIDENCIAS[c.evidencia].toLowerCase())}). ${fuenteEnlace(typeof c.fuente === 'string' ? D.fuentes.get(c.fuente) : c.fuente)}${c.nota ? `. ${esc(c.nota)}` : ''}`;
}

/** Bloque de datos operativos de un paso, cada dato con su fuente. */
// Zonas horarias de cada país del corredor (HU-66).
const ZONAS = { AR: 'America/Argentina/Salta', CL: 'America/Santiago', PY: 'America/Asuncion', BR: 'America/Campo_Grande' };
/** +543884253630 → +54 388 425 3630 (legible; el enlace usa el número completo). */
const telLegible = (t) => {
  // Prefijos de área conocidos (el más largo primero); si no se conoce, se deja el número sin agrupar.
  const AREAS = { '54': ['3873', '387', '388', '11'], '56': ['2'], '595': ['21'], '55': ['67'] };
  const cc = ['595', '54', '56', '55'].find((c) => t.startsWith('+' + c));
  if (!cc) return t;
  const resto = t.slice(cc.length + 1);
  const area = AREAS[cc].find((a) => resto.startsWith(a));
  if (!area) return `+${cc} ${resto}`;
  const local = resto.slice(area.length);
  const corte = local.length - 4;
  return `+${cc} ${area} ${local.slice(0, corte)} ${local.slice(corte)}`;
};
const TIPO_CONTROL = { integrado: 'Control integrado', migraciones: 'Migraciones', aduana: 'Aduana', sanitario: 'Sanitario', seguridad: 'Seguridad', aviso: 'Aviso' };
/** HU-73: instante del parte con el desfase horario del país (hora local; sin hora, mediodía). */
const UMBRAL_PARTES_H = site.partes?.umbralHoras ?? 48;
const desfase = (zona, dia) => {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date(`${dia}T12:00:00Z`)).find((x) => x.type === 'timeZoneName').value;
  return v === 'GMT' ? '+00:00' : v.slice(3);
};
const instanteParte = (x) => `${x.publicado}T${x.hora || '12:00'}:00${desfase(ZONAS[x.lado] || 'UTC', x.publicado)}`;
/** HU-113: sello de validación compacto. La fuente, la fecha y la comprobación se abren al tocarlo. */
function selloHTML(n, verificado, fuente, publicado) {
  // HU-133 (R3): un único sello en toda la web: «Organismo · cuándo · ✓ Web oficial».
  const corto = selloCorto(n, verificado, fuente, publicado);
  const largo = n === 'verificado' && verificado ? `${verificadoEn(fuente)} el ${fecha(verificado)}${fuente?.leidoAuto ? ', de forma automática' : ''}.` : n === 'caducado' ? 'Verificación caducada: confírmalo antes de salir.' : 'Publicado por su fuente, sin comprobar todavía.';
  return `<details class="sello sello-${esc(n)}"><summary><span class="sello-corto">${corto}</span></summary><span class="sello-hoja">${esc(largo)} ${fuenteEnlace(fuente)}${publicado ? `, ${fecha(publicado)}` : ''}${fuente?.tipo ? ` (${TIPO_FUENTE[fuente.tipo]})` : ''}.</span></details>`;
}
/** HU-73 / HU-113: lo que informa cada organismo, una línea por parte, con fecha, hora y sello de fuente. */
function partesHTML(p, op) {
  const partes = p.partes || [];
  if (!partes.length && op === 'cerrado') return '';
  const porLado = Object.keys(p.lados).map((k) => {
    const del = partes.filter((x) => x.lado === k).sort((a, b) => (instanteParte(b) > instanteParte(a) ? 1 : -1));
    const items = del.length
      ? del
          .map(
            (x) => `<li class="parte" data-ts="${instanteParte(x)}">
          <div class="parte-linea">${bandera(k)}<span class="parte-quien"><span class="parte-emisor">${esc(x.emisor)}</span>
          <span class="parte-cuando"><time datetime="${instanteParte(x)}">${fecha(x.publicado)}${x.hora ? `, ${x.hora} h` : ''}</time>${x.hora ? '' : ' <span class="texto-suave">(sin hora publicada)</span>'}</span></span>${x.valor ? estado(x.valor) : ''}</div>
          <p class="parte-texto">${esc(x.texto)}</p>
          <p class="parte-aviso" hidden></p>
          ${selloHTML(nivelReg(x, 'estado-operativo'), x.verificado, x.fuente, x.publicado)}
        </li>`
          )
          .join('')
      : `<li class="parte parte-vacio"><div class="parte-linea">${bandera(k)}<span class="sin-dato">Sin parte cargado de ${esc(PAISES[k])}.</span></div></li>`;
    return `<div class="partes-lado" data-pais="${k}"><h4 class="sr-only">${esc(PAISES[k])}</h4><ul class="partes-lista">${items}</ul></div>`;
  });
  return `<section class="partes" aria-labelledby="t-partes" data-umbral="${UMBRAL_PARTES_H}">
    <h3 id="t-partes">Qué dice cada país</h3>
    <div class="partes-grid">${porLado.join('')}</div>
  </section>`;
}
/** HU-105: sentido de cruce. «AR-CL» = sale de Argentina y entra en Chile. */
const attrSentido = (x) => (x?.sentido ? ` data-sentido="${esc(x.sentido)}"` : '');
const etiquetaSentido = (x) => {
  if (!x?.sentido) return '';
  const [a, b] = x.sentido.split('-');
  return `<span class="solo-sentido">Solo ${esc(PAISES[a] || a)} → ${esc(PAISES[b] || b)}:</span> `;
};
function sentidoHTML(p) {
  const [a, b] = Object.keys(p.lados);
  return `<div class="sentido" data-sentido-paso="${a}-${b}" data-nombres='${esc(JSON.stringify(Object.fromEntries(Object.keys(p.lados).map((k) => [k, PAISES[k]]))))}'>
    <p class="sentido-texto"><span class="sr-only">Sentido del cruce: </span><span class="sentido-ruta"><span class="sentido-a">${bandera(a)} ${esc(PAISES[a])}</span> → <span class="sentido-b">${bandera(b)} ${esc(PAISES[b])}</span></span></p>
    <button type="button" class="btn btn-borde btn-pequeno btn-sentido" aria-label="Cambiar el sentido del cruce">⇄ Cambiar</button>
    <p class="sentido-nota" aria-live="polite">Sales de ${esc(PAISES[a])} y entras en ${esc(PAISES[b])}. Los controles van en ese orden.</p>
  </div>`;
}
/** HU-97: fiabilidad del paso en los últimos 30 y 90 días. */
const VIGENCIA_FIAB = site.fiabilidad?.vigenciaDias ?? 1;
const fiabPaso = (p, dias) => fiabilidad(p, HOY, dias, VIGENCIA_FIAB);
function frasesFiab(f) {
  const partes = [];
  if (f.cerrado) partes.push(`${f.cerrado} ${f.cerrado === 1 ? 'día' : 'días'} no habilitado`);
  if (f.soloCarga) partes.push(`${f.soloCarga} ${f.soloCarga === 1 ? 'día' : 'días'} sin paso para carga`);
  if (f.restricciones) partes.push(`${f.restricciones} con restricciones`);
  if (f.abierto) partes.push(`${f.abierto} habilitado`);
  if (f.sinDatos) partes.push(`${f.sinDatos} sin datos`);
  return partes.join(' · ');
}
function fiabilidadHTML(p) {
  if (p.estado?.valor === 'en-obras') return ''; // un paso que aún no se ha habilitado no tiene fiabilidad que medir
  const f30 = fiabPaso(p, 30);
  const f90 = fiabPaso(p, 90);
  if (f90.sinDatos === 90 && !f90.pendientesDeVerificar) return '';
  const cuadros = f30.porDia
    .map((d) => `<li class="fd fd-${d.clase}" title="${fecha(d.dia)}: ${ETIQUETAS_DIA[d.clase]}"><span class="sr-only">${fecha(d.dia)}: ${ETIQUETAS_DIA[d.clase]}</span></li>`)
    .join('');
  const fila = (f) => `<tr><th scope="row">Últimos ${f.dias} días</th><td>${f.cerrado}</td><td>${f.soloCarga}</td><td>${f.restricciones}</td><td>${f.abierto}</td><td>${f.sinDatos}</td></tr>`;
  return `<section class="fiabilidad" aria-labelledby="t-fiab">
    <h3 id="t-fiab">Últimos 30 días</h3>
    <ol class="fiab-tira" aria-label="Estado de cada uno de los últimos 30 días">${cuadros}</ol>
    <p class="fiab-resumen">${frasesFiab(f30) || 'sin datos'}.</p>
    <details class="fiab-mas"><summary>Ver detalle</summary>
    <p class="fiab-leyenda" aria-hidden="true"><span class="fd fd-cerrado"></span> No habilitado <span class="fd fd-carga"></span> Sin paso para carga <span class="fd fd-restricciones"></span> Restricciones <span class="fd fd-abierto"></span> Habilitado <span class="fd fd-sin-datos"></span> Sin datos</p>
    <div class="tabla-scroll"><table class="tabla-fiab">
      <thead><tr><th scope="col">Periodo</th><th scope="col">No habilitado</th><th scope="col">Sin paso para carga</th><th scope="col">Restricciones</th><th scope="col">Habilitado</th><th scope="col">Sin datos</th></tr></thead>
      <tbody>${fila(f30)}${fila(f90)}</tbody>
    </table></div>
    <p class="dato-fuente">Días calculados con los partes verificados (en «Historial»). Un día sin parte hereda el del día anterior${VIGENCIA_FIAB > 1 ? ` (como mucho ${VIGENCIA_FIAB} días)` : ''}; si no, cuenta como «sin datos», nunca como habilitado.${
      f90.pendientesDeVerificar ? ` Hay ${f90.pendientesDeVerificar} ${f90.pendientesDeVerificar === 1 ? 'parte' : 'partes'} de los últimos 90 días pendientes de verificar que todavía no cuentan.` : ''
    }</p>
    </details>
  </section>`;
}
/** HU-66: hora local de cada lado y «abierto ahora». Lo calcula ahora.js en el navegador. */
function ahoraHTML(p, op) {
  const h = (p.horarios || []).find((x) => x.apertura && x.cierre && x.zona);
  const datos = {
    paises: Object.keys(p.lados).map((k) => ({ pais: k, nombre: PAISES[k], zona: ZONAS[k] })),
    horario: h ? { apertura: h.apertura, cierre: h.cierre, zona: h.zona, verificado: h.validacion === 'verificado' && !!h.verificado } : null,
    op,
    soloCarga: p.estado.afecta === 'carga',
  };
  return `<div class="ahora" data-ahora="${esc(JSON.stringify(datos))}">
    <p class="ahora-relojes">${Object.keys(p.lados).map((k) => `<span class="ahora-reloj" data-pais="${k}">${bandera(k)} <span class="ahora-hora">--:--</span></span>`).join('')}<span class="ahora-reloj ahora-reloj-es"><span class="ahora-hora">--:--</span></span></p>
    <p class="ahora-estado" aria-live="polite"></p>
  </div>`;
}
/** HU-65: novedades del paso, de la más reciente a la más antigua. */
function novedadesPaso(p) {
  const ruta = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id)?.guia;
  const items = [];
  const e = estadoPaso(p.id);
  items.push({ fecha: e.confirmado ? e.verificado : p.estado.publicado, op: e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar', valor: e.confirmado ? e.valor : null, texto: `Estado actual: ${p.estado.texto}`, fuente: p.estado.fuente, verificado: e.confirmado ? e.verificado : null, actual: true });
  for (const h of p.historial || []) items.push({ fecha: h.fecha, op: h.valor ? operativaDe(h.valor, 'paso') : null, valor: h.valor, texto: h.texto, fuente: h.fuente, verificado: h.verificado });
  const tramosPaso = rutas.tramos.filter((t) => t.paso?.id === p.id || t.alternativa?.id === p.id).map((t) => t.id);
  for (const i of incidenciasDe({ paso: p.id, tramos: tramosPaso })) if (i.publicado) items.push({ fecha: i.publicado, op: 'restricciones', valor: null, texto: `Aviso: ${i.descripcion}`, fuente: i.fuente, verificado: i.verificado });
  for (const n of novedades.filter((n) => ruta && n.guia === ruta)) items.push({ fecha: n.publicado, op: null, texto: n.titulo, fuente: n.fuente, verificado: null });
  const vistos = new Set();
  const lista = items
    .filter((x) => x.fecha)
    .sort((x, y) => (y.fecha > x.fecha ? 1 : y.fecha < x.fecha ? -1 : Number(!!y.actual) - Number(!!x.actual)))
    .filter((x) => {
      const k = `${x.fecha}|${x.fuente?.url}|${x.texto.slice(0, 40)}`;
      return vistos.has(k) ? false : vistos.add(k);
    });
  if (!lista.length) return null;
  return {
    n: lista.length,
    ultima: lista[0].fecha,
    html: `<ol class="linea-tiempo">${lista
      .map(
        (x) => `<li class="${x.op ? `op-${x.op}` : 'lt-noticia'}${x.actual ? ' lt-actual' : ''}">
        <time datetime="${x.fecha}">${fecha(x.fecha)} <span class="edad">(${haceTiempo(x.fecha)})</span></time>
        <p>${x.op ? `${estado(x.valor || (x.op === 'sin-confirmar' ? 'pendiente' : 'restricciones'))} ` : ''}${esc(x.texto)}</p>
        ${selloHTML(x.verificado ? 'verificado' : 'por-verificar', x.verificado, x.fuente, null)}
      </li>`
      )
      .join('')}</ol>`,
  };
}
/** HU-113: sección plegada de la ficha, con resumen de una línea. */
const plegable = (id, titulo, resumen, cuerpo, abierta = false) =>
  `<details class="plegable" id="${id}"${abierta ? ' open' : ''}><summary><span class="plegable-titulo">${titulo}</span><span class="plegable-resumen">${resumen}</span></summary><div class="plegable-cuerpo">${cuerpo}</div></details>`;
function fichaOperativa(p, guiaPag) {
  const e = estadoPaso(p.id);
  const sello = (x, tipo = 'ficha') => selloHTML(peor(nivelReg(x, tipo), e.nivel === 'borrador' ? 'borrador' : null), x.verificado, x.fuente, x.publicado);
  const item = (x, tipo) => `<li${attrSentido(x)}>${etiquetaSentido(x)}${esc(x.texto)}${sello(x, tipo)}</li>`;
  const lista = (xs, tipo) => `<ul class="lista-datos">${xs.map((x) => item(x, tipo)).join('')}</ul>`;
  const orgs = (p.organismos || []).map((id) => organismoPorId[id]).filter(Boolean);
  const inc = incidenciasDe({ paso: p.id, tramos: rutas.tramos.filter((t) => t.paso?.id === p.id || t.alternativa?.id === p.id).map((t) => t.id) });
  // Primera pantalla: la respuesta a «¿puedo cruzar hoy con mi carga?».
  const op = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
  const soloCarga = e.confirmado && p.estado.afecta === 'carga' && op !== 'abierto';
  const detalleEstado = soloCarga ? ' para carga · turismo con atención normal' : e.confirmado && ESTADOS[e.valor] && ESTADOS[e.valor] !== OPERATIVA[op].texto && e.valor !== 'operativo' ? ` · ${ESTADOS[e.valor]}` : '';
  const frases = (p.estado.texto || '').match(/[^.]+(\.|$)/g)?.map((x) => x.trim()).filter(Boolean) || [];
  const resto = frases.slice(1).join(' ');
  const prevision = inc.find((i) => i.finPrevista)?.finPrevista;
  const respuesta = `<div class="respuesta op-${op}" data-estado="${esc(e.confirmado ? e.valor : 'pendiente')}" role="status" aria-live="polite">
    ${OPERATIVA[op].icono}
    <div>
      <p class="respuesta-titulo">${esc(OPERATIVA[op].texto + detalleEstado)}</p>
      ${ahoraHTML(p, op)}
      ${
        e.confirmado
          ? resto
            ? `<p class="respuesta-nota">${esc(resto)}</p>`
            : ''
          : `<p class="respuesta-nota">${
              e.ultimo && e.ultimo !== 'pendiente'
                ? `Último dato publicado: ${esc((ESTADOS[e.ultimo] || e.ultimo).toLowerCase())}, ${esc(haceTiempo(p.estado.publicado))}. Confírmalo antes de salir.`
                : 'No hay un estado confirmado. Consulta el parte oficial antes de salir.'
            }</p>`
      }
      ${prevision ? `<p class="respuesta-nota">Previsión: ${esc(prevision)}</p>` : ''}
      ${selloHTML(e.nivel, e.verificado, p.estado.fuente, p.estado.publicado)}
    </div>
  </div>`;
  // Acciones: llamar al primer teléfono oficial, compartir por WhatsApp, planificar.
  const tel = (p.contactos || []).find((c) => c.telefono);
  const hor = (p.horarios || []).find((x) => x.apertura && x.cierre);
  const textoWa = `${p.nombre}: ${OPERATIVA[op].texto + detalleEstado}${e.confirmado ? ` (${verificadoEn(p.estado.fuente).toLowerCase()} el ${fechaCorta(e.verificado)})` : ' (sin confirmar)'}.${hor ? ` Horario ${hor.zona ? rangoDosHoras(hor.apertura, hor.cierre, hor.zona) : `${hor.apertura}–${hor.cierre}, hora local`}.` : ''} ${site.url.replace(/\/$/, '')}${u('/guia/' + guiaPag + '/')}`;
  const acciones = `<div class="ficha-acciones no-imprimir">
    ${tel ? `<a class="btn btn-borde btn-llamar" href="tel:${esc(tel.telefono)}">${icono('telefono')}Llamar</a>` : ''}
    <a class="btn btn-borde" href="https://wa.me/?text=${encodeURIComponent(textoWa)}" rel="noopener">${icono('chat')}Compartir</a>
    <a class="btn btn-principal" href="${u('/planificador/')}">${icono('ruta')}Planificar</a>
  </div>`;
  // Lo demás, plegado con resumen de una línea.
  const controles = [...(p.controles || [])].sort((x, y) => x.orden - y.orden);
  const secControles = plegable(
    'controles',
    'Controles para carga',
    controles.length ? `${plural(controles.length, 'paso', 'pasos')}${controles.some((c) => c.tipo === 'integrado') ? ' en un solo complejo' : ''}` : 'Sin controles publicados',
    controles.length
      ? `<ol class="controles">${controles
          .map(
            (c) => `<li data-lado="${esc(c.lado || '')}" data-orden="${c.orden}"${attrSentido(c)}><span class="control-tipo">${esc(TIPO_CONTROL[c.tipo] || c.tipo)}</span> ${c.lado ? conBanderas(c.lado) : ''} ${esc(c.texto)}${
              c.organismo && organismoPorId[c.organismo] ? ` <a href="${esc(organismoPorId[c.organismo].url)}" rel="noopener">${esc(organismoPorId[c.organismo].nombre)}</a>` : ''
            }${sello(c)}</li>`
          )
          .join('')}</ol>`
      : '<p class="sin-dato">Sin controles publicados: el paso no está habilitado o no hay fuente.</p>'
  );
  const secHorarios = plegable(
    'horarios',
    'Horarios',
    hor ? (hor.zona ? rangoDosHoras(hor.apertura, hor.cierre, hor.zona) : `${hor.apertura}–${hor.cierre}, hora local`) : p.horarios?.length ? 'Sin hora de apertura y cierre confirmada' : 'Sin horario con fuente',
    p.horarios?.length ? `<ul class="lista-datos">${p.horarios.map((h) => `<li${attrSentido(h)}><strong>${conBanderas(h.lado)}:</strong> ${etiquetaSentido(h)}${esc(h.texto)}${sello(h, 'horario')}</li>`).join('')}</ul>` : '<p class="sin-dato">Sin horario con fuente.</p>'
  );
  const tels = (p.contactos || []).filter((c) => c.telefono || c.email);
  const secTel = plegable(
    'telefonos',
    'Teléfonos',
    tels.length ? `${plural(tels.length, 'contacto oficial', 'contactos oficiales')}` : 'Sin teléfono con fuente',
    p.contactos?.length
      ? `<ul class="contactos">${p.contactos
          .map(
            (c) => `<li>${c.lado ? conBanderas(c.lado) + ' ' : ''}<strong>${esc(c.nombre || c.texto)}</strong>${c.nombre && c.texto ? `<span class="dato-fuente">${esc(c.texto)}</span>` : ''}
            <span class="contacto-acciones">${c.telefono ? `<a class="btn btn-borde btn-pequeno" href="tel:${esc(c.telefono)}">${icono('telefono')}${esc(telLegible(c.telefono))}</a>` : ''}${c.email ? `<a class="btn btn-borde btn-pequeno" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</span>
            ${sello(c)}</li>`
          )
          .join('')}</ul>`
      : `<p class="sin-dato">Sin teléfono con fuente. ${orgs.length ? 'Consulta la web oficial de cada organismo (en «Sobre el paso»).' : ''}</p>`
  );
  const nAvisos = inc.length + (p.restricciones?.length || 0);
  const secAvisos = plegable(
    'avisos-paso',
    'Obras y avisos',
    nAvisos ? `${plural(inc.length, 'aviso activo', 'avisos activos')}${p.restricciones?.length ? ` · ${plural(p.restricciones.length, 'norma', 'normas')} para camiones` : ''}` : 'Ninguno registrado',
    `${inc.length ? `<ul class="lista-datos">${inc.map((i) => `<li>${tipoIncidencia(i.tipo)} ${esc(i.descripcion)} <a href="${u('/avisos/#inc-' + i.id)}">Ver aviso</a>${selloHTML(nivelReg(i, 'incidencia'), i.verificado, i.fuente, i.publicado)}</li>`).join('')}</ul>` : '<p class="sin-dato">Ninguna incidencia registrada.</p>'}
     ${p.restricciones?.length ? `<h4>Transporte pesado</h4>${lista(p.restricciones)}` : ''}`
  );
  const nov = novedadesPaso(p);
  const secHist = nov ? plegable('historial', 'Historial', `${plural(nov.n, 'entrada', 'entradas')} · la última, ${haceTiempo(nov.ultima)}`, nov.html) : '';
  const fila = (titulo, contenido) => `<div class="dato-fila"><dt>${titulo}</dt><dd>${contenido}</dd></div>`;
  const secSobre = plegable(
    'sobre-paso',
    'Sobre el paso',
    [p.ubicacion?.texto?.match(/\d[\d.]*\s?m de altitud/)?.[0], orgs.length ? plural(orgs.length, 'organismo', 'organismos') : null, 'acceso y servicios'].filter(Boolean).join(' · '),
    `<dl class="datos">
      ${fila('Países', Object.entries(p.lados).map(([k, v]) => `${bandera(k)} ${esc(PAISES[k])}: ${esc(v)}`).join('<br>'))}
      ${fila('Ubicación', `${esc(p.ubicacion.texto)}<span class="dato-fuente">${coordenadasHTML(p.ubicacion.coordenadas, p.ubicacion.coordenadasNota)}</span>`)}
      ${fila('Operaciones habilitadas', p.operaciones ? `${esc(p.operaciones.texto)}${sello(p.operaciones)}` : '<span class="sin-dato">Sin verificar. Consulta con tu despachante.</span>')}
      ${fila('Acceso', p.acceso?.length ? lista(p.acceso) : '<span class="sin-dato">Sin verificar</span>')}
      ${fila('Servicios en el paso', p.servicios?.length ? lista(p.servicios) : '<span class="sin-dato">Sin verificar</span>')}
      ${fila('Organismos', orgs.length ? `<ul class="lista-enlaces">${orgs.map(enlaceOrganismo).join('')}</ul>` : '<span class="sin-dato">Sin verificar</span>')}
      ${fila('Estado en detalle', `${esc(p.estado.texto)}${otras(p.estado) ? `<span class="dato-fuente">${otras(p.estado).replace(/^ · /, '')}</span>` : ''}`)}
      ${fila('Revisión', `Ficha revisada el ${fecha(p.revisado)}`)}
    </dl>
    <button class="btn btn-borde btn-pequeno no-imprimir" type="button" onclick="document.querySelectorAll('.ficha-operativa details').forEach((d) => (d.open = true)); window.print()">${icono('imprimir')}Imprimir ficha completa</button>`
  );
  // HU-133 (R7): tres pestañas. El sentido del cruce vale para las tres.
  const pest = (id, txt, on) => `<button type="button" role="tab" id="tab-${id}" aria-controls="pane-${id}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${txt}</button>`;
  return `<section class="ficha-operativa" aria-labelledby="t-ficha">
  <h2 id="t-ficha" class="sr-only">Situación operativa</h2>
  ${sentidoHTML(p)}
  <div class="pestanas" role="tablist" aria-label="Ficha del paso">${pest('hoy', 'Hoy', true)}${pest('papeles', 'Papeles', false)}${pest('calendario', 'Calendario', false)}</div>
  <div class="pestana" role="tabpanel" id="pane-hoy" aria-labelledby="tab-hoy">
  ${respuesta}
  ${partesHTML(p, op)}
  ${fiabilidadHTML(p)}
  ${acciones}
  <div class="plegables">
    ${secControles}${secHorarios}${secTel}${secAvisos}${secHist}${secSobre}
  </div>
  </div>
  <div class="pestana" role="tabpanel" id="pane-papeles" aria-labelledby="tab-papeles" hidden>${papelesPaso(p)}</div>
  <div class="pestana" role="tabpanel" id="pane-calendario" aria-labelledby="tab-calendario" hidden>${calendarioPaso(p)}</div>
</section>`;
}

/** HU-133 (R7): pestaña «Papeles» del paso. Lista de comprobación según la carga, marcable y guardada en el dispositivo. */
function papelesPaso(p) {
  const chips = rutas.tiposCarga
    .map((c, i) => `<label class="chip chip-radio"><input type="radio" name="carga-paso" value="${esc(c.id)}"${i === 0 ? ' checked' : ''}>${esc(c.nombre)}</label>`)
    .join('');
  const docs = rutas.documentosCruce
    .map((d) => `<li data-cargas="${esc((d.cargas || []).join(' '))}"><label class="papel"><input type="checkbox" data-doc="${esc(d.id)}"><span class="papel-caja" aria-hidden="true"></span><span>${esc(d.nombre)}</span></label></li>`)
    .join('');
  return `<div class="papeles-paso" data-papeles>
    <fieldset class="pl-carga"><legend>¿Qué llevas?</legend><div class="chips">${chips}</div></fieldset>
    <p class="papeles-cuenta"><strong data-total></strong> <span data-listos></span></p>
    <ul class="papeles-lista">${docs}</ul>
    <p class="dato-fuente">${esc(rutas.avisoDocumentos)} Lo que marcas se guarda solo en este dispositivo.</p>
    <p class="papeles-mas">Tránsito aduanero y controles sanitarios de ${esc(listaY(Object.keys(p.lados).map((k) => PAISES[k])))}: <a href="${u('/papeles/')}">ver papeles por país</a>.</p>
    <div class="barra-accion"><a class="btn btn-borde btn-grande" href="${u('/directorio/?categoria=despachante')}">Buscar despachante</a><button class="btn btn-borde btn-grande" type="button" onclick="window.print()">Imprimir lista</button></div>
  </div>`;
}
/** HU-133 (R7): pestaña «Calendario» del paso. ¿Cuándo cruzas? y festivos de los dos países. No inventa horarios especiales. */
function calendarioPaso(p) {
  const ps = Object.keys(p.lados);
  const fest = festivos.filter((f) => ps.includes(f.pais));
  const datos = {
    paises: Object.fromEntries(ps.map((k) => [k, PAISES[k]])),
    festivos: fest.map((f) => ({ fecha: f.fecha, pais: f.pais, nombre: f.nombre, tipo: TIPOS_FESTIVO[f.tipo] || f.tipo, porConfirmar: f.validacion !== 'verificado' })),
    especiales: (p.horariosEspeciales || []).map((h) => ({ desde: h.desde, hasta: h.hasta, texto: h.texto })),
    hoy: HOY,
  };
  const proximos = fest.slice(0, 6);
  return `<div class="calendario-paso" data-cal-paso="${esc(JSON.stringify(datos))}">
    <fieldset class="cal-cuando"><legend>¿Cuándo cruzas?</legend>
      <div class="chips"><label class="chip chip-radio"><input type="radio" name="cuando" value="0" checked>Hoy</label><label class="chip chip-radio"><input type="radio" name="cuando" value="1">Mañana</label>
      <label class="campo-fecha"><span class="sr-only">Otra fecha</span><input type="date" name="fecha" min="${HOY}" value="${HOY}"></label></div>
    </fieldset>
    <div class="cal-respuesta" aria-live="polite"></div>
    <h3>Próximos festivos en ${esc(listaY(ps.map((k) => PAISES[k])))}</h3>
    ${proximos.length ? `<ul class="lista-fest">${proximos.map(filaFestivo).join('')}</ul>` : '<p class="sin-dato">Ninguno cargado.</p>'}
    <p class="dato-fuente">Un festivo no implica que la aduana cierre. Si nadie ha publicado horario especial, lo decimos tal cual. <a href="${u('/calendario/')}">Calendario completo</a></p>
  </div>`;
}

/** Aviso de ficha según su nivel de validación (mismo sistema que los estados). */
function avisoValidacion(n, verificado) {
  const t = {
    borrador: '<strong>Texto de la guía en revisión.</strong> La situación operativa de arriba indica en cada dato si está verificado o solo publicado por su fuente, con la fecha.',
    'por-verificar': '<strong>Texto de la guía sin revisar.</strong> La situación operativa de arriba indica en cada dato si está verificado o solo publicado por su fuente, con la fecha.',
    caducado: `<strong>Verificación caducada.</strong> Se comprobó el ${fecha(verificado)}. Confírmalo antes de viajar.`,
  }[n];
  return t ? `<p class="aviso aviso-${esc(n)}"><span>${t}</span></p>` : '';
}

/** Tramos de una ficha de tramo: distancia, estado e incidencias, desde data/rutas.json e incidencias.json. */
function bloqueTramos(ruta) {
  const ts = rutas.tramos.filter((t) => t.guia === ruta && !t.paso);
  if (!ts.length) return '';
  const filas = ts
    .map((t) => {
      const inc = incidenciasDe({ tramos: [t.id] });
      const est = (e, via) => (e ? `≈ ${GCkm(e.km)}${via ? ` por ${esc(via)}` : ''} <span class="tag tag-estimado">Estimación provisional</span><span class="dato-fuente">${esc(e.aviso)}</span>` : '');
      const km = t.km
        ? `${GCkm(t.km)}<span class="dato-fuente">${t.kmTipo === 'calculado' ? `Calculado: ${esc(t.kmNota || '')}` : t.kmFuente ? `Según ${fuenteEnlace(t.kmFuente)}` : ''}</span>`
        : t.estimacion
          ? `${est(t.estimacion, t.alternativa ? t.paso.nombre : '')}${t.alternativa?.estimacion ? `<br>${est(t.alternativa.estimacion, t.alternativa.nombre)}` : ''}`
          : '<span class="sin-dato">Sin dato</span>';
      return `<div class="dato-fila"><dt>${esc(nombreTramo(t))}</dt><dd>
        <div class="dato-estado">${vistaHTML(t.vista)}</div>
        ${t.vista.fuente ? `<span class="dato-fuente">${fuenteEnlace(t.vista.fuente)}</span>` : ''}
        <p class="tramo-km">Distancia: ${km}</p>
        ${inc.map((i) => `<p class="it-aviso">${tipoIncidencia(i.tipo)} ${esc(i.descripcion)} <a href="${u('/avisos/#inc-' + i.id)}">Ver aviso</a></p>`).join('')}
      </dd></div>`;
    })
    .join('');
  return `<section class="ficha-operativa" aria-labelledby="t-tramos"><div class="ficha-cabeza"><h2 id="t-tramos">Estado de los tramos</h2></div><dl class="datos">${filas}</dl></section>`;
}
const GCkm = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' })}\u202Fkm`;

// Pasos fronterizos para las historias
const pasosHistoria = [];
rutas.tramos.forEach((t) => {
  const a = rutas.nodos.find((n) => n.id === t.desde);
  const b = rutas.nodos.find((n) => n.id === t.hasta);
  if (t.paso) pasosHistoria.push({ id: t.paso.id, nombre: t.paso.nombre.replace(/\s*\(.*\)$/, '').replace(/^Paso (de )?/, '').replace('Puente de la ', 'Puente '), guia: t.paso.guia, estado: t.estado, op: t.op, cara: [a.pais, b.pais] });
  if (t.alternativa) pasosHistoria.push({ id: t.alternativa.id, nombre: t.alternativa.nombre.replace(/\s*\(.*\)$/, '').replace(/^Paso (de )?/, ''), guia: t.alternativa.guia, estado: t.alternativa.estado || t.estado, op: t.alternativa.op || t.op, cara: [a.pais, b.pais] });
});
const historia = (h) => {
  const contenido = `<span class="historia-anillo"><span class="historia-cara" role="img" aria-label="${esc(h.cara.map((c) => PAISES[c]).join(' – '))}">${h.cara.map((c) => bandera(c).replace(/ role="img" aria-label="[^"]*"/, '')).join('')}</span></span><span class="historia-nombre">${esc(h.nombre)}</span>${estadoPasoHTML(h.id, { corto: true })}${cruceCorto(h.id)}`;
  return `<li>${h.guia ? `<a class="historia historia-${esc(h.estado)} historia-op-${h.op}" href="${u(`/guia/${h.guia}/`)}">${contenido}</a>` : `<div class="historia historia-${esc(h.estado)} historia-op-${h.op}">${contenido}</div>`}</li>`;
};

// HU-115: datos del mapa interactivo (MapLibre + OpenFreeMap), sacados de los mismos datos que el resto de la web.
// Las capas salen de rutas.json, pasos.json y data/trazados.json (trazados calculados con OpenStreetMap).
function datosMapa() {
  const n = Object.fromEntries(rutas.nodos.map((x) => [x.id, x]));
  const posPaso = (id) => {
    const c = fichaPaso[id]?.ubicacion?.coordenadas;
    if (c?.lat != null) return { lon: c.lon, lat: c.lat, esquematica: false };
    const t = rutas.tramos.find((x) => x.paso?.id === id || x.alternativa?.id === id);
    if (id === 'pozo-hondo' && n['pozo-hondo']) return { lon: n['pozo-hondo'].lon, lat: n['pozo-hondo'].lat, esquematica: true };
    const a = n[t.desde], b = n[t.hasta];
    return { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2, esquematica: true };
  };
  // Trazados calculados con OpenStreetMap (scripts/trazados.mjs), si los hay. Si no, línea recta entre puntos.
  const trazados = TRAZADOS;
  const lineas = [];
  for (const t of rutas.tramos) {
    for (const alt of [false, true]) {
      const via = alt ? t.alternativa : t.paso;
      if (alt && !via) continue;
      const v = alt ? t.alternativa.vista : t.vista;
      const op = v?.confirmado ? (alt ? t.alternativa.op : t.op) : 'sin-confirmar';
      const clave = `${t.id}${via ? `@${via.id}` : ''}`;
      const calc = trazados?.tramos?.[clave];
      const pts = calc?.geometria || [n[t.desde], ...(via ? [posPaso(via.id)] : []), n[t.hasta]].map((o) => [o.lon, o.lat]);
      lineas.push({
        id: clave,
        nombre: `${nodoNombre[t.desde]} – ${nodoNombre[t.hasta]}${via ? ` por ${via.nombre}` : ''}`,
        op,
        estado: OPERATIVA[op].texto,
        km: typeof t.km === 'number' ? t.km : null,
        kmCalculado: calc?.km ?? null,
        trazado: calc ? 'calculado' : 'recta',
        alt,
        url: via?.guia ? u(`/guia/${via.guia}/`) : t.guia ? u(`/guia/${t.guia}/`) : null,
        coords: pts,
      });
    }
  }
  const puntos = [
    ...rutas.nodos.map((x) => ({ id: x.id, nombre: x.nombre, pais: PAISES[x.pais], tipo: ['antofagasta', 'mejillones', 'iquique'].includes(x.id) ? 'puerto' : 'ciudad', lon: x.lon, lat: x.lat, url: u(`/directorio/?punto=${x.id}`) })),
    ...fichaPasos.map((p) => {
      const e = estadoPaso(p.id);
      const op = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
      const g = posPaso(p.id);
      const r = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id);
      return { id: p.id, nombre: p.nombre, tipo: 'paso', op, estado: OPERATIVA[op].texto + (e.confirmado ? ` · verificado el ${fechaCorta(e.verificado)}` : ' · sin confirmar'), lon: g.lon, lat: g.lat, esquematica: g.esquematica, url: r?.guia ? u(`/guia/${r.guia}/`) : null };
    }),
  ];
  const datosMapa = { puntos, lineas, colores: { abierto: '#1f9d55', restricciones: '#e8a317', cerrado: '#d64545', 'sin-confirmar': '#8a939b' } };
  return datosMapa;
}
/** Marco del mapa: el mapa vivo (oculto hasta que carga) y el esquema SVG de respaldo. */
const mapaVivoHTML = () => `<div class="mapa-vivo-marco" data-estado="esquema">
    <div id="mapa-vivo" class="mapa-vivo" role="region" aria-label="Mapa interactivo del corredor. La misma información está en la tabla de tramos de la página del mapa."></div>
    <div class="mapa-respaldo">${mapaHTML()}</div>
  </div>`;
const datosMapaScript = () => `<script type="application/json" id="datos-mapa">${JSON.stringify(datosMapa()).replace(/</g, '\\u003c')}</script>`;

// Inicio · HU-133 (R5): «Hoy». Tu ruta con su veredicto, tus pasos, lo que impide o limita el paso y el mapa.
const GENERADO = new Date();
const horaEn = (zona, d = GENERADO) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(d);
const graveOrden = { rojo: 0, ambar: 1 };
const avisoHoy = (i) => {
  const g = i.gravedad || 'ambar';
  const forma = g === 'rojo' ? 'cerrado' : 'restricciones';
  return `<li class="aviso-hoy aviso-${g}" id="hoy-inc-${esc(i.id)}">${OPERATIVA[forma].icono.replace('<svg', `<svg class="op-${forma}"`)}<div>
    <p class="aviso-hoy-titulo"><strong>${esc(TIPOS_INCIDENCIA[i.tipo]?.[0] || i.tipo)}${i.afecta === 'carga' ? ' para carga' : ''}</strong> · ${esc(i.ubicacion)} ${paises(i.paises || [])}</p>
    <p class="aviso-hoy-texto">${esc(i.descripcion)}</p>
    <p class="sello-linea">${selloCorto(nivelReg(i, 'incidencia'), i.verificado, i.fuente, i.publicado)}</p>
  </div></li>`;
};
{
  const limitan = activas.filter((i) => (i.gravedad || 'ambar') !== 'info').sort((x, y) => graveOrden[x.gravedad || 'ambar'] - graveOrden[y.gravedad || 'ambar']);
  const info = activas.length - limitan.length;
  const tarjetaPaso = (h) => `<li data-paso="${esc(h.id)}"><a class="paso-hoy op-borde-${h.op}" href="${u(h.guia ? `/guia/${h.guia}/` : '/pasos/')}">
    <span class="paso-hoy-nombre">${h.cara.map((c) => bandera(c)).join('')}<strong>${esc(h.nombre)}</strong></span>
    <span class="paso-hoy-estado">${estadoPasoHTML(h.id, { corto: true })}</span></a></li>`;
  add(
    '/',
    layout({
      ruta: '/',
      scripts: ['/assets/inicio.js', ...(hayMapLibre ? ['/assets/mapa-perezoso.js'] : [])],
      datos: datosRutas() + (hayMapLibre ? datosMapaScript() : ''),
      cuerpo: `
<div class="contenedor hoy">
  <header class="hoy-cabeza">
    <h1>Hoy</h1>
    <p class="hoy-hora" data-generado="${GENERADO.toISOString()}">Datos de las ${horaEn(ZONAS.AR)} en Argentina (${horaEn(ZONA_ES)} en España)</p>
  </header>
  <div class="hoy-grid">
    <div class="hoy-col">
      <section class="veredicto" id="tu-ruta" aria-live="polite" hidden></section>
      <section class="hoy-buscar" id="sin-ruta" aria-labelledby="t-buscar">
        <h2 id="t-buscar">¿Adónde vas?</h2>
        <p>Elige origen y destino y te decimos si se puede hoy y por dónde.</p>
        ${buscador('buscador-hoy').replace(`${icono('buscar')}Buscar ruta`, '¿Se puede hoy?')}
      </section>
      <section class="hoy-bloque" aria-labelledby="t-pasos-hoy">
        <div class="hoy-bloque-cabeza"><h2 id="t-pasos-hoy">Pasos de frontera</h2><a href="${u('/pasos/')}">Ver todos</a></div>
        <ul class="pasos-hoy" id="pasos-hoy">${pasosHistoria.map(tarjetaPaso).join('')}</ul>
      </section>
      <section class="hoy-bloque" aria-labelledby="t-limita">
        <div class="hoy-bloque-cabeza"><h2 id="t-limita">Lo que impide o limita el paso</h2><a href="${u('/avisos/')}">Ver todos los avisos</a></div>
        ${limitan.length ? `<ul class="avisos-hoy">${limitan.slice(0, 5).map(avisoHoy).join('')}</ul>${limitan.length > 5 ? `<p class="hoy-info"><a href="${u('/avisos/')}">Y ${plural(limitan.length - 5, 'aviso más', 'avisos más')} con restricciones</a></p>` : ''}` : '<p class="sin-dato">Ningún corte ni restricción publicado ahora mismo.</p>'}
        ${info ? `<p class="hoy-info"><a href="${u('/avisos/#informativos')}">${plural(info, 'aviso informativo más', 'avisos informativos más')}</a>: no cambian el veredicto.</p>` : ''}
      </section>
      <section class="hoy-negocio" aria-label="Negocio">
        <a class="negocio" href="${cotizacion()}">${icono('papeles')}<span><strong>Pedir cotización</strong><span>Dinos origen, destino y carga</span></span></a>
        <a class="negocio" href="${cargaRetorno()}">${icono('ruta')}<span><strong>Carga de retorno</strong><span>¿Vuelves vacío? Avísanos</span></span></a>
      </section>
    </div>
    <section class="hoy-mapa" aria-labelledby="t-mapa-hoy">
      <h2 id="t-mapa-hoy" class="sr-only">Mapa del corredor hoy</h2>
      ${hayMapLibre ? mapaVivoHTML() : mapaHTML()}
      ${hayMapLibre ? '' : '<!-- leyenda del esquema dentro del mapa -->'}<p class="leyenda-formas" aria-hidden="true"${hayMapLibre ? '' : ' hidden'}><span>${OPERATIVA.abierto.icono} Abierto</span><span>${OPERATIVA.restricciones.icono} Con avisos</span><span>${OPERATIVA.cerrado.icono} Cerrado</span><span>${OPERATIVA['sin-confirmar'].icono} Sin confirmar</span></p>
      <a class="enlace-mas" href="${u('/mapa/')}">Ver tramos y distancias</a>
    </section>
  </div>
</div>`,
    })
  );
}

// Planificador (resultados)
{
  const emp = empresas.map((e) => ({
    nombre: e.nombre,
    cat: catNombre[e.categoria] || e.categoria,
    destacada: !!e.destacada,
    wa: e.contacto?.whatsapp ? wa(e.contacto.whatsapp) : '',
    puntos: e.puntos || [],
  }));
  add(
    '/planificador/',
    layout({
      titulo: 'Planificar ruta',
      descripcion: 'Compara opciones de ruta por el Corredor Bioceánico: fronteras, estado de cada tramo, papeles y empresas en cada punto.',
      ruta: '/planificador/',
      scripts: ['/assets/planificador.js'],
      datos: datosRutas({ empresas: emp }),
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Planificar ruta</h1><p>¿Se puede hacer tu ruta hoy, y por dónde? Elige el origen y el destino.</p></header>
  ${buscador('buscador-compacto')}
  <div id="resultado" aria-live="polite"></div>
  <noscript><p class="aviso">Activa JavaScript para ver las opciones de ruta.</p></noscript>
</div>`,
    })
  );
}

// Informe de viaje (HU-45): se genera en el navegador con los mismos datos que el planificador.
{
  const fuenteMin = (f) => (f ? { nombre: f.nombre, url: f.url, tipo: f.tipo } : null);
  const reg = (x) => ({ texto: x.texto, lado: x.lado || '', organismo: x.organismo || '', fuente: fuenteMin(x.fuente), publicado: x.publicado || null, verificado: x.verificado || null });
  const extra = {
    generadoDatos: HOY,
    umbralPartesH: UMBRAL_PARTES_H,
    festivosTodos: festivos.map((f) => ({ pais: f.pais, fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, organismo: f.organismo, verificado: f.verificado || null, fuente: fuenteMin(f.fuente) })),
    pasosInfo: Object.fromEntries(
      fichaPasos.map((p) => [
        p.id,
        {
          nombre: p.nombre,
          estado: { texto: p.estado.texto, fuente: fuenteMin(p.estado.fuente), publicado: p.estado.publicado },
          horarios: (p.horarios || []).map(reg),
          especiales: (p.horariosEspeciales || []).map((h) => ({ ...reg(h), desde: h.desde, hasta: h.hasta })),
          lados: Object.keys(p.lados),
          fiabilidad: (() => {
            const r = (f) => ({ dias: f.dias, cerrado: f.cerrado, soloCarga: f.soloCarga, restricciones: f.restricciones, abierto: f.abierto, sinDatos: f.sinDatos, pendientesDeVerificar: f.pendientesDeVerificar });
            return { d30: r(fiabPaso(p, 30)), d90: r(fiabPaso(p, 90)) };
          })(),
          partes: (p.partes || []).map((x) => ({ ...reg(x), emisor: x.emisor, valor: x.valor || null, hora: x.hora || null, ts: instanteParte(x) })).sort((a, b) => (b.ts > a.ts ? 1 : -1)),
          guia: rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id)?.guia || null,
        },
      ])
    ),
    incidenciasInfo: Object.fromEntries(activas.map((i) => [i.id, { finPrevista: i.finPrevista || null, fuente: fuenteMin(i.fuente), verificado: i.verificado || null }])),
  };
  add(
    '/informe/',
    layout({
      titulo: 'Informe de viaje',
      descripcion: 'Informe de una ruta del Corredor Bioceánico para una fecha de cruce: estado de cada paso y tramo, horarios, festivos, avisos, papeles y fuentes.',
      ruta: '/informe/',
      scripts: ['/assets/informe.js'],
      datos: datosRutas(extra),
      cuerpo: `
<div class="contenedor informe-pagina">
  <div id="informe" aria-live="polite"><p class="texto-suave">Preparando el informe…</p></div>
  <noscript><p class="aviso">Activa JavaScript para ver el informe.</p></noscript>
</div>`,
    })
  );
}

// Novedades
{
  const paisesN = [...new Set(novedades.flatMap((n) => n.paises || []))];
  const temas = [...new Set(novedades.map((n) => n.tema))];
  add(
    '/novedades/',
    layout({
      titulo: 'Novedades del corredor',
      descripcion: 'Cambios de estado, avances de obras y acuerdos del Corredor Bioceánico, con fecha y fuente.',
      ruta: '/novedades/',
      scripts: ['/assets/filtros.js'],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Novedades del corredor</h1><p>Lo que cambia en pasos, tramos y acuerdos. Cada noticia enlaza a su medio de origen.</p></header>
  <div class="filtros-noticias" data-filtros="#lista-novedades">
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesN.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Tema"><span class="filtro-etiqueta">Tema</span>
      <button class="chip" type="button" data-filtro="tema" data-valor="" aria-pressed="true">Todos</button>
      ${temas.map((t) => `<button class="chip" type="button" data-filtro="tema" data-valor="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
    </div>
  </div>
  <ul class="noticias-pagina" id="lista-novedades">${novedades
    .map((n) => `<li data-pais="${esc((n.paises || []).join(' '))}" data-tema="${esc(n.tema)}">${noticia(n)}</li>`)
    .join('')}</ul>
  <div class="vacio" data-vacio hidden><p>No hay novedades con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>
</div>`,
    })
  );
}

// Guía (tabla)
{
  const paisesG = [...new Set(guia.flatMap((p) => p.meta.paises || []))];
  const estadosG = [...new Set(guia.map(estadoGuia))];
  const filas = Object.keys(SECCIONES)
    .flatMap((sec) => guia.filter((p) => p.seccion === sec))
    .map(
      (p) => `<tr data-pais="${esc((p.meta.paises || []).join(' '))}" data-estado="${esc(estadoGuia(p))}" data-validacion="${esc(nivelGuia(p))}">
        <td><a href="${u(p.ruta)}">${esc(p.meta.titulo)}</a></td>
        <td class="col-tipo">${esc({ pasos: 'Paso fronterizo', tramos: 'Tramo', documentos: 'Documentos' }[p.seccion] || p.seccion)}</td>
        <td>${paises(p.meta.paises)}</td>
        <td>${vistaGuia(p) ? estado(estadoGuia(p)) : '<span class="sin-dato">No aplica</span>'}</td>
        <td>${validacionHTML(nivelGuia(p), p.meta.verificado, p.meta.fuente)}</td>
        <td class="col-revisado">${fecha(p.meta.revisado)}</td>
      </tr>`
    )
    .join('');
  add(
    '/guia/',
    layout({
      titulo: 'Guía del corredor',
      descripcion: 'Pasos fronterizos, tramos y documentos del Corredor Bioceánico, con estado y fuentes.',
      ruta: '/guia/',
      scripts: ['/assets/filtros.js'],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Guía del corredor</h1><p>Pasos, tramos y papeles. Cada página indica su estado, si está verificada y cuándo se revisó.</p></header>
  <div class="filtros-guia" data-filtros="#tabla-guia tbody">
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesG.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Estado"><span class="filtro-etiqueta">Estado</span>
      <button class="chip" type="button" data-filtro="estado" data-valor="" aria-pressed="true">Todos</button>
      ${estadosG.map((e) => `<button class="chip" type="button" data-filtro="estado" data-valor="${esc(e)}" aria-pressed="false">${esc(ESTADOS[e] || 'No aplica')}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Validación"><span class="filtro-etiqueta">Validación</span>
      <button class="chip" type="button" data-filtro="validacion" data-valor="" aria-pressed="true">Todas</button>
      ${[...new Set(guia.map(nivelGuia))].map((n) => `<button class="chip" type="button" data-filtro="validacion" data-valor="${esc(n)}" aria-pressed="false">${esc(NIVELES[n].texto)}</button>`).join('')}
    </div>
  </div>
  <div class="tabla-marco">
    <table class="tabla-guia" id="tabla-guia">
      <thead><tr><th scope="col">Página</th><th scope="col">Tipo</th><th scope="col">Países</th><th scope="col">Estado</th><th scope="col">Validación</th><th scope="col">Revisado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>
  <div class="vacio" data-vacio hidden><p>No hay páginas con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>
</div>`,
    })
  );
}

// HU-115: página del mapa interactivo.
{
  const { lineas } = datosMapa();
  const filas = lineas
    .map((l) => `<tr><th scope="row">${l.url ? `<a href="${esc(l.url)}">${esc(l.nombre)}</a>` : esc(l.nombre)}</th><td>${estado(l.op === 'sin-confirmar' ? 'pendiente' : l.op === 'abierto' ? 'operativo' : l.op === 'cerrado' ? 'cerrado' : 'restricciones')}</td><td>${l.km != null ? `${GCkm(l.km)} <span class="texto-suave">con fuente</span>` : l.kmCalculado != null ? `${GCkm(l.kmCalculado)} <span class="texto-suave">calculado con OpenStreetMap</span>` : '<span class="sin-dato">km por cargar</span>'}</td></tr>`)
    .join('');
  add(
    '/mapa/',
    layout({
      titulo: 'Mapa del corredor',
      descripcion: 'Mapa interactivo del Corredor Bioceánico con el estado de cada tramo y paso fronterizo.',
      ruta: '/mapa/',
      estilos: hayMapLibre ? ['/assets/vendor/maplibre-gl.css'] : [],
      scripts: hayMapLibre ? ['/assets/vendor/maplibre-gl.js', '/assets/mapa.js'] : [],
      datos: datosMapaScript(),
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Mapa del corredor</h1><p>Estado de hoy de cada tramo y paso. Toca un paso para abrir su ficha.</p></header>
  ${mapaVivoHTML()}
  <ul class="mapa-leyenda" aria-label="Leyenda">
    <li><span class="ley-color" style="background:#1f9d55"></span>Abierto</li>
    <li><span class="ley-color" style="background:#e8a317"></span>Con restricciones</li>
    <li><span class="ley-color" style="background:#d64545"></span>No habilitado</li>
    <li><span class="ley-color" style="background:#8a939b"></span>Sin confirmar</li>
    <li><span class="ley-linea"></span>Trazado por carretera (OpenStreetMap)</li>
    <li><span class="ley-linea ley-linea-recta"></span>Línea recta: trazado pendiente</li>
  </ul>
  <h2>Tramos</h2>
  <div class="tabla-scroll"><table class="tabla-tramos">
    <thead><tr><th scope="col">Tramo</th><th scope="col">Estado</th><th scope="col">Distancia</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>
  <p class="dato-fuente">Mapa base: © OpenStreetMap y sus colaboradores, teselas de OpenFreeMap. Las distancias «calculadas con OpenStreetMap» son un cálculo de ruta por carretera, no un dato oficial.</p>
</div>`,
    })
  );
}

// Páginas de la guía
for (const p of guia) {
  const zona = p.meta.puntos || [];
  const emp = empresasEn(zona);
  const nov = novedades.filter((n) => n.guia === `${p.seccion}/${p.slug}`);
  const nombresZona = listaY(zona.map((z) => nodoNombre[z] || z));
  const paso = pasoPorGuia[`${p.seccion}/${p.slug}`];
  const cruce = paso ? panelCruce(paso) : '';
  const esPaso = !!(paso && fichaPaso[paso.id]);
  add(
    p.ruta,
    layout({
      titulo: p.meta.titulo,
      descripcion: p.meta.resumen,
      ruta: p.ruta,
      scripts: [...(cruce && envioCruce ? ['/assets/cruces.js'] : []), ...(paso ? ['/assets/ahora.js'] : [])],
      cuerpo: `
<div class="contenedor">
  <nav class="migas" aria-label="Estás en"><a href="${u('/guia/')}">Guía</a><span aria-hidden="true">/</span><span>${esc(SECCIONES[p.seccion] || p.seccion)}</span></nav>
  <header class="paso-cabeza senal">
    <h1 class="senal-titulo">${esc(p.meta.titulo)}</h1>
    <span class="senal-pie">${vistaGuia(p) ? estado(estadoGuia(p)) : ''}${paises(p.meta.paises)}</span>
  </header>
  ${esPaso ? '' : `<p class="paso-meta"><span>Texto de la guía: ${esc((NIVELES[nivelGuia(p)]?.texto || '').toLowerCase())}</span><span>Revisado el ${fecha(p.meta.revisado)}</span>${nov.length ? `<span>Última noticia ${tiempo(nov[0].publicado)}</span>` : ''}</p>`}
  <div class="paso-cuerpo">
    <article class="articulo">
      ${paso && fichaPaso[paso.id] ? fichaOperativa(fichaPaso[paso.id], `${p.seccion}/${p.slug}`) : bloqueTramos(`${p.seccion}/${p.slug}`)}
      ${(() => {
        const texto = `${avisoValidacion(nivelGuia(p), p.meta.verificado)}
      <p class="resumen">${esc(p.meta.resumen)}</p>
      ${p.html}
      ${nov.length ? `<h2 id="ultimos-cambios">Últimos cambios</h2><ul class="lista-noticias">${nov.map((n) => `<li>${noticia(n, { conLugar: false })}</li>`).join('')}</ul>` : ''}`;
        // HU-113: en un paso, el texto de la guía va plegado al final de la ficha.
        return esPaso
          ? `<div class="plegables plegables-guia">${plegable('guia-paso', 'Guía del paso', `${p.indice.map((h) => h.t).slice(0, 3).join(', ').toLowerCase() || 'texto de la guía'} · ${esc((NIVELES[nivelGuia(p)]?.texto || '').toLowerCase())}`, texto)}</div>`
          : texto;
      })()}
    </article>
    <aside class="lateral">
      ${cruce}
      ${
        zona.length
          ? `<section class="panel" aria-labelledby="t-zona"><h2 id="t-zona">Quién te ayuda en ${esc(nombresZona)}</h2>
        ${
          emp.length
            ? `<p>Empresas que dan servicio en esta zona.</p><ul class="minis">${emp.slice(0, 4).map(empresaMini).join('')}</ul>
               <a class="enlace-mas" href="${u(`/directorio/?punto=${zona[0]}`)}">Ver todas las empresas de la zona</a>`
            : `<p>Aún no hay empresas en esta zona.</p>`
        }
        <a class="btn btn-borde" href="${u('/anunciate/')}">Anunciar mi empresa aquí</a>
      </section>`
          : ''
      }
      ${
        !esPaso && p.indice.length > 2
          ? `<nav class="panel indice" aria-labelledby="t-indice"><h2 id="t-indice">En esta página</h2><ol>${p.indice
              .map((h) => `<li><a href="#${h.id}">${esc(h.t)}</a></li>`)
              .join('')}${nov.length ? '<li><a href="#ultimos-cambios">Últimos cambios</a></li>' : ''}</ol></nav>`
          : ''
      }
      ${esPaso ? '' : `<section class="panel" aria-labelledby="t-viaje"><h2 id="t-viaje">¿Viajas por aquí?</h2><p>Compara rutas, fronteras y papeles de origen a destino.</p>
        <a class="btn btn-principal" href="${u('/planificador/')}">Planificar ruta</a></section>`}
    </aside>
  </div>
</div>`,
    })
  );
}

// Empresas
{
  const paisesUsados = [...new Set(empresas.map((e) => e.pais))];
  const cuenta = (fn) => empresas.filter(fn).length;
  const sugerencias = [
    ...empresas.map((e) => ({ t: e.nombre, d: catNombre[e.categoria] })),
    ...[...new Set(empresas.map((e) => e.ciudad))].map((c) => ({ t: c, d: 'Ciudad' })),
    ...categorias.filter((c) => cuenta((e) => e.categoria === c.id)).map((c) => ({ t: c.nombre, d: 'Tipo de empresa' })),
    ...[...new Set(empresas.flatMap((e) => e.servicios || []))].map((s) => ({ t: s, d: 'Servicio' })),
  ];
  const vacioDirectorio = `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Servicios del corredor</h1><p>Transitarios, despachantes, transportistas y servicios para el camión en cada punto de la ruta.</p></header>
  <section class="panel directorio-vacio" aria-labelledby="t-dir-vacio">
    <h2 id="t-dir-vacio">Todavía no hay empresas verificadas</h2>
    <p>Solo publicamos empresas que han confirmado sus datos. Estamos contactando con proveedores de cada punto de la ruta.</p>
    <p>Categorías previstas: ${esc(listaY(categorias.map((c) => c.nombre.toLowerCase())))}.</p>
    <a class="btn btn-principal" href="${u('/anunciate/')}">Dar de alta mi empresa gratis</a>
  </section>
</div>`;
  add(
    '/directorio/',
    layout({
      titulo: 'Servicios del corredor',
      descripcion: 'Transitarios, transportistas, despachantes, depósitos y servicios en cada punto del Corredor Bioceánico.',
      ruta: '/directorio/',
      scripts: empresas.length ? ['/assets/directorio.js'] : [],
      datos: `<script type="application/json" id="datos-sugerencias">${JSON.stringify(sugerencias).replace(/</g, '\\u003c')}</script>`,
      cuerpo: !empresas.length ? vacioDirectorio : `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Servicios del corredor</h1><p>Busca quién da servicio en cada punto de la ruta y escríbele directamente.</p></header>
  <div class="busqueda-web">
    ${icono('buscar')}
    <label class="oculto" for="f-texto">Buscar empresas</label>
    <input id="f-texto" type="search" autocomplete="off" placeholder="Empresa, servicio o ciudad" role="combobox" aria-expanded="false" aria-controls="sugerencias" aria-autocomplete="list">
    <ul class="sugerencias" id="sugerencias" role="listbox" aria-label="Sugerencias" hidden></ul>
  </div>
  <div class="filtros-empresas">
    <div class="filtro-linea" role="group" aria-label="Tipo de empresa"><span class="filtro-etiqueta">Tipo</span>
      <button class="chip" type="button" data-filtro="tipo" data-valor="" aria-pressed="true">Todas <span class="n">${empresas.length}</span></button>
      ${categorias
        .filter((c) => cuenta((e) => e.categoria === c.id))
        .map((c) => `<button class="chip" type="button" data-filtro="tipo" data-valor="${esc(c.id)}" aria-pressed="false">${esc(c.nombre)} <span class="n">${cuenta((e) => e.categoria === c.id)}</span></button>`)
        .join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesUsados.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea"><label class="filtro-etiqueta" for="f-punto">Punto de la ruta</label>
      <select class="selector" id="f-punto"><option value="">Toda la ruta</option>${rutas.nodos
        .map((n) => `<option value="${esc(n.id)}">${esc(n.nombre)} (${cuenta((e) => (e.puntos || []).includes(n.id))})</option>`)
        .join('')}</select>
    </div>
  </div>
  <p class="contador" id="contador" role="status">${plural(empresas.length, 'empresa', 'empresas')}</p>
  <ul class="resultados-empresas" id="lista-empresas">${empresas.map(empresaFila).join('')}</ul>
  <div class="vacio" id="sin-resultados" hidden>
    <p>No hay empresas con esos filtros. Prueba con otro punto, país o tipo.</p>
    <button class="btn btn-borde" type="button" id="limpiar">Quitar filtros</button>
  </div>
</div>`,
    })
  );
}

// Anunciar
{
  const planes = site.planes
    .map(
      (pl) => `
<section class="plan${pl.id === 'destacada' ? ' plan-destacado' : ''}" aria-labelledby="plan-${esc(pl.id)}">
  <h2 id="plan-${esc(pl.id)}">${esc(pl.nombre)}</h2>
  <p class="precio">${esc(pl.precio.replace(' € / mes', '\u202f€ al mes'))}</p>
  <ul class="lista-check">${pl.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  ${
    pl.id === 'destacada'
      ? pl.enlacePago
        ? `<a class="btn btn-principal" href="${esc(pl.enlacePago)}" rel="noopener">Contratar con PayPal</a><p class="nota">Pago mensual con PayPal o tarjeta. Factura incluida. Cancelas cuando quieras.</p>`
        : '<p class="nota">Abrimos los pagos pronto, con PayPal o tarjeta y factura. Si te interesa, indícalo al darte de alta.</p>'
      : '<a class="btn btn-borde" href="#alta">Darme de alta gratis</a>'
  }
</section>`
    )
    .join('');
  // Formulario de solicitud (P0.6): sin servidor. Prepara un email al contacto del proyecto.
  // La solicitud no se publica: queda pendiente de revisión (docs/como-editar.md#solicitudes-de-empresas).
  const opc = (xs) => xs.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  // Si hay formulario de Google configurado, la solicitud va a su hoja de cálculo (privada); si no, por email.
  const envioSol = configEnvio(site.solicitudes?.enlacePrellenado, CAMPOS_SOLICITUD);
  const conGoogle = envioSol && !envioSol.error;
  const formSolicitud = site.contacto.email
    ? `<form class="solicitud" id="solicitud" data-email="${esc(site.contacto.email)}"${conGoogle ? ` data-accion="${esc(envioSol.accion)}" data-campos="${esc(JSON.stringify(envioSol.campos))}"` : ''} novalidate>
    <fieldset class="sol-tipo"><legend>Qué quieres hacer</legend>
      <label class="chip chip-radio"><input type="radio" name="tipo" value="alta" checked>Dar de alta</label>
      <label class="chip chip-radio"><input type="radio" name="tipo" value="correccion">Corregir una ficha</label>
      <label class="chip chip-radio"><input type="radio" name="tipo" value="retirada">Retirar una ficha</label>
    </fieldset>
    <div class="sol-campos">
      <label class="sol-campo"><span>Nombre comercial *</span><input name="nombre" required autocomplete="organization"></label>
      <label class="sol-campo"><span>Razón social</span><input name="razonSocial"></label>
      <label class="sol-campo"><span>País de la sede *</span><select name="pais" required><option value="">Elige</option>${opc(Object.entries(PAISES))}</select></label>
      <label class="sol-campo"><span>Localidad de la sede *</span><input name="localidad" required></label>
      <label class="sol-campo" data-solo="alta correccion"><span>Tipo de empresa *</span><select name="categoria" required><option value="">Elige</option>${opc(categorias.map((c) => [c.id, c.nombre]))}</select></label>
      <label class="sol-campo sol-ancho" data-solo="alta correccion"><span>Servicios *</span><textarea name="servicios" rows="3" required placeholder="Qué haces, para qué cargas y con qué medios"></textarea></label>
      <fieldset class="sol-campo sol-ancho" data-solo="alta correccion"><legend>Cobertura en el corredor (dónde das servicio, no tu sede)</legend>
        <div class="sol-puntos">${rutas.nodos.map((n) => `<label class="chip"><input type="checkbox" name="puntos" value="${esc(n.id)}">${esc(n.nombre)}</label>`).join('')}</div>
        <input name="cobertura" placeholder="Otras zonas o detalle de la cobertura" aria-label="Otras zonas o detalle de la cobertura">
      </fieldset>
      <label class="sol-campo"><span>Persona de contacto *</span><input name="persona" required autocomplete="name"></label>
      <label class="sol-campo"><span>Email *</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="sol-campo"><span>Teléfono o WhatsApp (con prefijo de país)</span><input name="telefono" type="tel" placeholder="+595 …" autocomplete="tel"></label>
      <label class="sol-campo"><span>Web</span><input name="web" type="url" placeholder="https://"></label>
      <label class="sol-campo sol-ancho"><span>Documentación o referencias</span><textarea name="referencias" rows="2" placeholder="Registro, habilitación, clientes que puedan dar referencias, enlaces"></textarea></label>
      <label class="sol-campo sol-ancho" data-solo="correccion retirada"><span>Qué hay que cambiar o retirar *</span><textarea name="cambio" rows="2"></textarea></label>
    </div>
    <label class="sol-acepto"><input type="checkbox" name="acepto" required> Entiendo que la solicitud se revisa antes de publicarse y que los datos aparecerán como declarados por la empresa hasta que se verifiquen.</label>
    <p class="sol-error" role="alert" hidden></p>
    <div class="acciones">
      <button class="btn btn-principal" type="submit">${conGoogle ? 'Enviar la solicitud' : `${icono('correo')}Preparar el email de solicitud`}</button>
      <button class="btn btn-borde" type="button" data-copiar>Copiar la solicitud</button>
    </div>
    <p class="sol-ok" role="status" hidden></p>
    <p class="nota">${
      conGoogle
        ? `La solicitud se guarda en una hoja privada del proyecto (Formularios de Google) para revisarla. Si tienes problemas, escríbenos a <a href="mailto:${esc(site.contacto.email)}">${esc(site.contacto.email)}</a>.`
        : `Se abre tu programa de correo con la solicitud ya escrita, dirigida a <a href="mailto:${esc(site.contacto.email)}">${esc(site.contacto.email)}</a>. Esta web no guarda nada. Si no se abre, usa «Copiar la solicitud» y pégala en un email.`
    }</p>
  </form>`
    : '<p class="sin-dato">El canal de alta se publica en breve.</p>';
  add(
    '/anunciate/',
    layout({
      titulo: 'Anunciar mi empresa',
      descripcion: 'Aparece en el punto del Corredor Bioceánico donde das servicio. Ficha básica gratis.',
      ruta: '/anunciate/',
      scripts: site.contacto.email ? ['/assets/solicitud.js'] : [],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Anunciar mi empresa</h1><p>Tu empresa aparece en el punto de la ruta donde trabajas: en el planificador, en la guía y en el buscador.</p></header>
  <div class="planes">${planes}</div>
</div>
${seccion({
  titulo: 'Cómo darse de alta',
  contexto: 'Cada solicitud la revisa una persona antes de publicarse.',
  id: 'alta',
  cuerpo: `<ol class="pasos-alta">
    <li><b>Envía la solicitud</b><span>Alta, corrección o retirada, con los datos de la empresa.</span></li>
    <li><b>La revisamos</b><span>Comprobamos los datos y las referencias. La solicitud no se publica sola.</span></li>
    <li><b>Te avisamos</b><span>Si se publica, la ficha indica qué datos están verificados y cuáles los declara la empresa.</span></li>
  </ol>
  ${formSolicitud}`,
})}`,
    })
  );
}

// Sobre la guía
add(
  '/sobre/',
  layout({
    titulo: 'Cómo trabajamos la información',
    ruta: '/sobre/',
    cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Cómo trabajamos la información</h1><p>Qué publicamos, de dónde sale y qué no hacemos.</p></header>
  <div class="articulo">
    <h2>Fuentes y revisión</h2>
    <ul>
      <li>Cada dato indica su fuente, su fecha y el tipo de evidencia: oficial, de terceros, declarado por una empresa, cálculo o histórico.</li>
      <li><b>Verificado en fuente oficial</b> significa que el dato se comprobó a mano en la web o el canal oficial del organismo que lo publica, enlazado junto al dato. <b>Verificado en la fuente</b>, que se comprobó en la fuente citada (prensa u obra de referencia). Un proceso automático o un asistente de IA nunca puede marcar un dato como verificado.</li>
      <li>Lo demás se muestra como <b>Por verificar</b>, con el último dato publicado y su fuente.</li>
      <li>Si un tramo no tiene distancia con fuente, mostramos una <b>estimación provisional</b> en línea recta, indicando el tramo y los puntos usados. Por carretera la distancia es mayor.</li>
      <li>Un festivo nacional no significa que la aduana cierre; solo cuenta lo que publica cada organismo.</li>
      <li>Si ves un dato desactualizado, ${site.contacto.email ? `escríbenos a <a href="mailto:${esc(site.contacto.email)}">${esc(site.contacto.email)}</a>` : 'escríbenos'} y lo corregimos.</li>
    </ul>
    <h2>Datos abiertos</h2>
    <p>Los mismos datos que ves en la web, con su fuente y su estado de verificación, están en formato JSON en <a href="${u('/api/v1/indice.json')}">api/v1</a>.</p>
    <h2>Tu ruta y tus datos</h2>
    <p>El planificador guarda tu última ruta solo en tu navegador. No pedimos registro ni guardamos datos personales.</p>
    <p>Si cuentas tu tiempo de cruce, se envía a un formulario de Google el paso, el sentido, el tiempo, el día y un número al azar que genera tu navegador para no contar dos veces el mismo cruce. Nada que te identifique.</p>
    <h2>Qué no hacemos</h2>
    <p>No transportamos mercancía, no intermediamos en contratos ni cobramos comisiones por operación. La contratación es directa entre empresas.</p>
  </div>
</div>`,
  })
);

// Fronteras
{
  const tarjeta = (p) => {
    const ruta = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id);
    const href = u(`/guia/${ruta.guia}/`);
    const inc = activas.filter((i) => i.paso === p.id).length;
    const h = p.horarios?.[0];
    return `<li class="paso-tarjeta">
  <div class="paso-tarjeta-cabeza">
    <h2><a href="${href}">${esc(p.nombre)}</a></h2>
    <p>${Object.entries(p.lados).map(([k, v]) => `${bandera(k)} ${esc(v)}`).join(' – ')}</p>
  </div>
  <div class="paso-tarjeta-estado">${estadoPasoHTML(p.id)}</div>
  ${(() => {
    // HU-133 (R7): festivo en los próximos 7 días en alguno de los dos lados, en azul.
    const f = festivos.find((x) => Object.keys(p.lados).includes(x.pais) && diasDesde(x.fecha) >= -7);
    return f ? `<a class="etiqueta-festivo" href="${href}#calendario">${esc(diaSemana(f.fecha))} ${esc(fechaCorta(f.fecha))} · festivo en ${esc(PAISES[f.pais])}</a>` : '';
  })()}
  <dl class="paso-tarjeta-datos">
    <div><dt>Horario</dt><dd>${h ? `${h.apertura && h.cierre && h.zona ? `${rangoDosHoras(h.apertura, h.cierre, h.zona)}<span class="dato-fuente">${esc(h.texto)}</span>` : esc(h.texto)}${h.lado ? ` <span class="dato-fuente">${conBanderas(h.lado)}</span>` : ''}` : '<span class="sin-dato">Sin verificar</span>'}</dd></div>
    <div><dt>Tiempo de cruce</dt><dd>${cruceCorto(p.id).replace(/<[^>]+>/g, '').replace('Cruce ', '') || '<span class="sin-dato">Sin datos suficientes</span>'}</dd></div>
    <div><dt>Incidencias</dt><dd>${inc ? plural(inc, 'activa', 'activas') : 'Ninguna'}</dd></div>
  </dl>
  <a class="btn btn-borde" href="${href}">Abrir la ficha</a>
</li>`;
  };
  add(
    '/pasos/',
    layout({
      titulo: 'Pasos fronterizos',
      descripcion: 'Estado, horarios y organismos de cada paso fronterizo del Corredor Bioceánico, con fuente y fecha.',
      ruta: '/pasos/',
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Pasos fronterizos</h1><p>Estado, horarios y organismos de cada frontera del corredor. Cada dato lleva su fuente y su fecha.</p></header>
  <ul class="pasos-lista">${fichaPasos.map(tarjeta).join('')}</ul>
  <p class="nota-guardado">Solo se muestra como confirmado lo que se ha comprobado a mano en su fuente. Lo demás sale «Sin confirmar» con su último dato, su fecha y cuánto hace.</p>
</div>
${seccion({
  titulo: 'Recorrido',
  contexto: 'Cada tramo con su estado. Las empresas aparecen en el punto donde trabajan.',
  cuerpo: `${rutaHTML()}<ul class="leyenda" aria-label="Leyenda de estados">${['operativo', 'restricciones', 'cerrado', 'pendiente'].map((k) => `<li>${estado(k)}</li>`).join('')}</ul>`,
})}
${seccion({
  titulo: 'Partes oficiales',
  contexto: 'Antes de salir, mira el parte del día en la fuente oficial.',
  cuerpo: `<ul class="lista-enlaces lista-enlaces-grande">${organismos.filter((o) => o.tipo === 'estado-pasos').map(enlaceOrganismo).join('')}</ul>`,
})}`,
    })
  );
}

// Avisos: obras, restricciones y meteorología
{
  const paisesI = [...new Set(incidencias.flatMap((i) => i.paises))];
  const tiposI = [...new Set(incidencias.map((i) => i.tipo))];
  const tarjetaInc = (i) => `<li class="inc-tarjeta" id="inc-${esc(i.id)}" data-pais="${esc(i.paises.join(' '))}" data-tipo="${esc(i.tipo)}">
  <div class="inc-cabeza">${tipoIncidencia(i.tipo)}<span class="inc-estado">${i.estado === 'activa' ? 'Activa' : 'Resuelta'}</span>${paises(i.paises)}</div>
  <h3>${esc(i.ubicacion)}</h3>
  <p class="inc-tramo">${esc(i.tramo)}</p>
  <p>${esc(i.descripcion)}</p>
  <dl class="inc-datos">
    <div><dt>Inicio</dt><dd>${i.inicio ? fecha(i.inicio) : '<span class="sin-dato">Sin fecha confirmada</span>'}</dd></div>
    <div><dt>Fin previsto</dt><dd>${i.finPrevista ? esc(i.finPrevista) : '<span class="sin-dato">Sin fecha confirmada</span>'}</dd></div>
    <div class="inc-impacto"><dt>Transporte pesado</dt><dd>${i.impacto ? esc(i.impacto) : '<span class="sin-dato">Sin datos verificados</span>'}</dd></div>
    <div><dt>Fuente</dt><dd>${fuenteEnlace(i.fuente)} (${TIPO_FUENTE[i.fuente.tipo] || 'fuente'})${i.publicado ? `, ${fecha(i.publicado)}` : ', sin fecha'}${otras(i)}</dd></div>
    <div><dt>Tramos afectados</dt><dd>${(i.tramos || [])
      .map((id) => tramoPorId[id])
      .filter(Boolean)
      .map((t) => {
        const g = t.paso?.guia || t.guia;
        return g ? `<a href="${u(`/guia/${g}/`)}">${esc(nombreTramo(t))}</a>` : esc(nombreTramo(t));
      })
      .join('<br>') || '<span class="sin-dato">Sin asignar</span>'}</dd></div>
  </dl>
  <p class="inc-revisado">${validacionHTML(nivelReg(i, 'incidencia'), i.verificado, i.fuente)}</p>
</li>`;
  const porPais = Object.keys(PAISES).map((k) => {
    const de = (t) => organismos.filter((o) => o.pais === k && t.includes(o.tipo));
    return `<tr><th scope="row">${esc(PAISES[k])}</th>
      <td data-l="Alertas meteorológicas">${de(['meteorologia']).map((o) => `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`).join('<br>') || '<span class="sin-dato">Sin enlace verificado</span>'}</td>
      <td data-l="Estado de rutas y pasos">${de(['vialidad', 'estado-pasos']).map((o) => `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`).join('<br>') || '<span class="sin-dato">Sin enlace verificado</span>'}</td></tr>`;
  });
  add(
    '/avisos/',
    layout({
      titulo: 'Obras, restricciones y alertas',
      descripcion: 'Obras, cortes y restricciones del Corredor Bioceánico, y enlaces a las alertas meteorológicas oficiales de cada país.',
      ruta: '/avisos/',
      scripts: ['/assets/filtros.js'],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Obras, restricciones y alertas</h1><p>Lo que puede cortar o retrasar tu viaje. Cada aviso indica su fuente y su fecha.</p></header>
</div>
${seccion({
  id: 'obras',
  titulo: 'Obras y restricciones',
  contexto: `${plural(activas.length, 'incidencia activa', 'incidencias activas')} en la ruta.`,
  cuerpo: `<div class="filtros-noticias" data-filtros="#lista-inc">
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesI.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Tipo"><span class="filtro-etiqueta">Tipo</span>
      <button class="chip" type="button" data-filtro="tipo" data-valor="" aria-pressed="true">Todos</button>
      ${tiposI.map((t) => `<button class="chip" type="button" data-filtro="tipo" data-valor="${esc(t)}" aria-pressed="false">${esc(TIPOS_INCIDENCIA[t]?.[0] || t)}</button>`).join('')}
    </div>
  </div>
  <ul class="inc-lista" id="lista-inc">${incidencias.map(tarjetaInc).join('')}</ul>
  <div class="vacio" data-vacio hidden><p>No hay incidencias con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>`,
})}
${seccion({
  id: 'meteorologia',
  titulo: 'Meteorología y estado de rutas',
  contexto: avisosMeteo.length ? `${plural(avisosMeteo.length, 'aviso vigente', 'avisos vigentes')}, copiados de fuentes oficiales.` : 'No hay avisos cargados. Las alertas y predicciones las publica cada país.',
  cuerpo: `${
    avisosMeteo.length
      ? `<ul class="inc-lista">${avisosMeteo
          .map((a) => `<li class="inc-tarjeta"><h3>${esc(a.titulo)}</h3><p>${esc(a.zona)}</p><p class="inc-revisado">Vigente hasta el ${fecha(a.vigenteHasta)}. Fuente: ${fuenteEnlace(a.fuente)}</p></li>`)
          .join('')}</ul>`
      : ''
  }<div class="tabla-marco"><table class="tabla-oficial">
    <thead><tr><th scope="col">País</th><th scope="col">Alertas meteorológicas</th><th scope="col">Estado de rutas y pasos</th></tr></thead>
    <tbody>${porPais.join('')}</tbody></table></div>
    <p class="nota-guardado">En los pasos de cordillera (Jama y Sico) el viento blanco, la nieve y el hielo pueden cerrar la ruta en pocas horas.</p>`,
})}
${seccion({
  titulo: 'Novedades recientes',
  contexto: 'Avances de obras y acuerdos entre países, con su fuente.',
  enlace: ['/novedades/', 'Ver todas las novedades'],
  cuerpo: `<ul class="lista-noticias lista-noticias-tres">${recientes.slice(0, 3).map((n) => `<li>${noticia(n)}</li>`).join('')}</ul>`,
})}`,
    })
  );
}

// Calendario aduanero: festivos y horarios
{
  const ORGANISMOS_CAL = { general: 'Feriado nacional', aduana: 'Aduana', migraciones: 'Migraciones', sanitario: 'Sanitario', complejo: 'Complejo fronterizo' };
  const anios = [...new Set(festivos.map((f) => f.fecha.slice(0, 4)))];
  const meses = [...new Set(festivos.map((f) => f.fecha.slice(0, 7)))];
  const nombreMes = (ym) => {
    const t = new Date(ym + '-15T12:00:00Z').toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return t[0].toUpperCase() + t.slice(1);
  };
  const paisesDeLado = (lado, p) => {
    const ks = Object.keys(PAISES).filter((k) => lado.includes(k));
    return ks.length ? ks : Object.keys(p.lados);
  };
  const proximoPais = Object.keys(PAISES)
    .map((k) => {
      const f = festivos.find((x) => x.pais === k && x.tipo === 'feriado');
      return f ? `<li><span class="prox-pais">${esc(PAISES[k])}</span><strong>${esc(diaSemana(f.fecha))} ${esc(fechaCorta(f.fecha))}</strong><span>${esc(f.nombre)}</span></li>` : '';
    })
    .join('');
  const festivosHTML = meses
    .map((m) => {
      const delMes = festivos.filter((f) => f.fecha.startsWith(m));
      return `<li class="mes-cab" data-cabecera><h3>${esc(nombreMes(m))}</h3></li>${delMes
        .map(
          (f) => `<li class="fest-item" data-cal data-pais="${esc(f.pais)}" data-organismo="${esc(f.organismo || 'general')}" data-fecha="${esc(f.fecha)}" data-mes="${esc(m)}">
  <ul class="fest-fila">${filaFestivo(f)}</ul>
  <p class="fest-detalle">${validacionHTML(nivelReg(f, 'festivo'), f.verificado, f.fuente)} ${f.nota ? `${esc(f.nota)} ` : ''}Norma: ${fuenteEnlace(f.fuente)}</p>
</li>`
        )
        .join('')}`;
    })
    .join('');
  const horarios = fichaPasos.flatMap((p) => (p.horarios || []).map((h) => ({ p, h })));
  const especiales = fichaPasos.flatMap((p) => (p.horariosEspeciales || []).map((h) => ({ p, h })));
  const filaHorario = ({ p, h }, especial = false) => `<tr data-cal data-pais="${esc(paisesDeLado(h.lado || '', p).join(' '))}" data-organismo="${esc(h.organismo || 'complejo')}"${
    especial ? ` data-desde="${esc(h.desde)}" data-hasta="${esc(h.hasta)}"` : ''
  }>
    <th scope="row"><a href="${u(`/guia/${guiaDePaso[p.id]}/`)}">${esc(p.nombre)}</a></th>
    <td data-l="Lado">${conBanderas(h.lado || '')}</td>
    <td data-l="Organismo">${esc(ORGANISMOS_CAL[h.organismo] || h.organismo || '')}</td>
    <td data-l="Horario">${especial ? `<strong>${fecha(h.desde)} – ${fecha(h.hasta)}:</strong> ` : ''}${esc(h.texto)}</td>
    <td data-l="Fuente">${fuenteEnlace(h.fuente)}${h.publicado ? `, ${fechaCorta(h.publicado)}` : ''}<br>${validacionHTML(nivelReg(h, 'horario'), h.verificado, h.fuente)}</td>
  </tr>`;
  const tablaHorarios = (filas) => `<div class="tabla-marco"><table class="tabla-oficial tabla-horarios"><thead><tr><th scope="col">Paso</th><th scope="col">Lado</th><th scope="col">Organismo</th><th scope="col">Horario</th><th scope="col">Fuente y validación</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  const orgsUsados = [...new Set(['general', ...horarios.map((x) => x.h.organismo), ...especiales.map((x) => x.h.organismo)].filter(Boolean))];
  const chips = (filtro, valores) =>
    `<button class="chip" type="button" data-filtro="${filtro}" data-valor="" aria-pressed="true">Todos</button>${valores
      .map(([v, t]) => `<button class="chip" type="button" data-filtro="${filtro}" data-valor="${esc(v)}" aria-pressed="false">${esc(t)}</button>`)
      .join('')}`;
  add(
    '/calendario/',
    layout({
      titulo: 'Calendario aduanero',
      descripcion: 'Festivos y horarios de atención en fronteras de Brasil, Paraguay, Argentina y Chile, con su fuente y su estado de verificación.',
      ruta: '/calendario/',
      scripts: ['/assets/calendario.js'],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Calendario aduanero</h1><p>Festivos ${esc(anios.join('–'))} y horarios de atención en frontera de los cuatro países. Cada dato indica su fuente y si está verificado.</p></header>
  <section class="seccion-corta" aria-labelledby="t-prox">
    <h2 id="t-prox" class="titulo-pequeno">Próximo feriado en cada país</h2>
    <ul class="proximos">${proximoPais}</ul>
  </section>
  <div class="filtros-noticias filtros-cal" data-cal-filtros>
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>${chips('pais', Object.entries(PAISES))}</div>
    <div class="filtro-linea" role="group" aria-label="Organismo"><span class="filtro-etiqueta">Organismo</span>${chips(
      'organismo',
      orgsUsados.map((o) => [o, ORGANISMOS_CAL[o] || o])
    )}</div>
    <div class="filtro-linea">
      <label class="filtro-etiqueta" for="filtro-fecha">Fecha de cruce</label>
      <input class="selector" type="date" id="filtro-fecha" min="${esc(festivosDoc.desde)}" max="${esc(festivosDoc.hasta)}">
      <label class="filtro-etiqueta" for="filtro-mes">Mes</label>
      <select class="selector" id="filtro-mes"><option value="">Todos los meses</option>${meses.map((m) => `<option value="${esc(m)}">${esc(nombreMes(m))}</option>`).join('')}</select>
      <button class="btn btn-borde btn-pequeno boton-imprimir" type="button" onclick="window.print()">${icono('imprimir')}Imprimir</button>
    </div>
    <p class="cal-estado" id="cal-estado" role="status"></p>
  </div>
  <section class="cal-bloque" aria-labelledby="t-horarios">
    <h2 id="t-horarios">Horarios de atención en frontera</h2>
    <p class="texto-suave">Horarios publicados para cada paso. Un horario de más de ${180} días sin verificar se marca como caducado.</p>
    ${tablaHorarios(horarios.map((x) => filaHorario(x)).join(''))}
    <p class="vacio" data-vacio-de="tabla-horarios" hidden>No hay horarios con esos filtros.</p>
  </section>
  <section class="cal-bloque" aria-labelledby="t-festivos">
    <h2 id="t-festivos">Festivos</h2>
    <p class="texto-suave">Del ${fecha(festivosDoc.desde)} al ${fecha(festivosDoc.hasta)}. En un feriado nacional, comprueba la atención de aduanas y organismos.</p>
    <ul class="calendario" id="lista-fest">${festivosHTML}</ul>
    <p class="vacio" data-vacio-de="lista-fest" hidden>No hay festivos con esos filtros.</p>
  </section>
  <section class="cal-bloque" aria-labelledby="t-especiales">
    <h2 id="t-especiales">Horarios especiales</h2>
    ${
      especiales.length
        ? tablaHorarios(especiales.map((x) => filaHorario(x, true)).join(''))
        : '<p class="sin-dato">No hay horarios especiales publicados. Cuando Migraciones, Aduanas o un complejo fronterizo anuncien un horario temporal, aparecerá aquí con sus fechas.</p>'
    }
  </section>
  <section class="panel pendientes" aria-labelledby="t-pend">
    <h2 id="t-pend">Qué falta por verificar</h2>
    <ul>${festivosDoc.pendiente.map((x) => `<li>${esc(x)}</li>`).join('')}<li>Horarios del lado paraguayo y chileno de cada paso.</li></ul>
  </section>
</div>`,
    })
  );
}

// Papeles y operativa aduanera
{
  const alcance = (t) => `<span class="alcance">${esc(t)}</span>`;
  const org = (id) => {
    const o = organismoPorId[id];
    return `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`;
  };
  const tablaOrg = Object.keys(PAISES)
    .map((k) => {
      const de = (t) => organismos.filter((o) => o.pais === k && t.includes(o.tipo)).map((o) => `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`).join('<br>') || '<span class="sin-dato">Sin enlace verificado</span>';
      return `<tr><th scope="row">${esc(PAISES[k])}</th><td data-l="Aduana y trámites">${de(['aduana', 'tramite'])}</td><td data-l="Sanidad">${de(['sanitario'])}</td><td data-l="Migraciones y transporte">${de(['migraciones', 'transporte'])}</td></tr>`;
    })
    .join('');
  const docGuia = guiaPorRuta['documentos/crt-mic-dta'];
  add(
    '/papeles/',
    layout({
      titulo: 'Papeles y trámites aduaneros',
      descripcion: 'Documentos de transporte internacional, tránsito aduanero y controles sanitarios en el Corredor Bioceánico, con los organismos de cada país.',
      ruta: '/papeles/',
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Papeles y trámites aduaneros</h1><p>Qué documentos lleva un camión por el corredor y qué organismo los controla en cada país.</p></header>
  <p class="aviso"><span><strong>Orientativo.</strong> Los requisitos exactos dependen de la mercancía, el régimen y el país. Confírmalos con tu despachante.</span><button class="btn btn-borde btn-pequeno" type="button" onclick="window.print()">${icono('imprimir')}Imprimir</button></p>
  <div class="papeles-pagina">
    <section aria-labelledby="t-pap-gen">
      <h2 id="t-pap-gen">En todo viaje internacional ${alcance('General')}</h2>
      <ul class="lista-docs">${rutas.documentosCruce.filter((d) => !d.cargas).map((d) => `<li>${esc(d.nombre)}</li>`).join('')}</ul>
      ${docGuia ? `<a class="enlace-mas" href="${u(docGuia.ruta)}">Para qué sirve el CRT y el MIC/DTA</a>` : ''}
    </section>
    <section aria-labelledby="t-pap-tr">
      <h2 id="t-pap-tr">Tránsito aduanero ${alcance('Por país')}</h2>
      <dl class="datos">
        <div class="dato-fila"><dt>Brasil</dt><dd>El tránsito se declara en Siscomex Trânsito; el MIC-DTA ampara cargas de entrada, salida o paso. ${org('br-transito')}</dd></div>
        <div class="dato-fila"><dt>Argentina</dt><dd>MIC/DTA electrónico para tránsitos de importación y exportación (Resolución General 2.619, sistema SINTIA). ${org('ar-arca')}</dd></div>
        <div class="dato-fila"><dt>Paraguay</dt><dd>Sistemas aduaneros de la DNIT, entre ellos SOFIA y el seguimiento vehicular (SSV). ${org('py-dnit')}</dd></div>
        <div class="dato-fila"><dt>Chile</dt><dd><span class="sin-dato">Procedimiento de tránsito pendiente de verificar.</span> ${org('cl-aduanas')}</dd></div>
      </dl>
    </section>
    <section aria-labelledby="t-pap-san">
      <h2 id="t-pap-san">Controles sanitarios y fitosanitarios ${alcance('Por mercancía')}</h2>
      <p>Se aplican a cargas de origen animal o vegetal (granos, refrigerados…).</p>
      <dl class="datos">
        <div class="dato-fila"><dt>Argentina</dt><dd>Los productos de origen vegetal o animal en tránsito necesitan el Permiso Fitozoosanitario de Tránsito Internacional (PFTI), que gestiona el agente de transporte aduanero en la frontera de ingreso. ${org('ar-senasa')}</dd></div>
        <div class="dato-fila"><dt>Paraguay</dt><dd>La exportación de productos vegetales requiere certificado fitosanitario del SENAVE, que se solicita por la Ventanilla Única de Exportación (VUE). ${org('py-senave')}</dd></div>
        <div class="dato-fila"><dt>Chile</dt><dd>El SAG controla en frontera la carga de importación y la carga en tránsito hacia terceros países. ${org('cl-sag')}</dd></div>
        <div class="dato-fila"><dt>Brasil</dt><dd><span class="sin-dato">Pendiente de verificar.</span></dd></div>
      </dl>
    </section>
    <section aria-labelledby="t-pap-esp">
      <h2 id="t-pap-esp">Mercancías especiales ${alcance('Por mercancía')}</h2>
      <p>Mercancías peligrosas: Paraguay publica la normativa MERCOSUR aplicable (fichas de emergencia, rótulos y paneles de riesgo). ${org('py-dinatran')}</p>
      <p class="sin-dato">Requisitos del resto de países pendientes de verificar.</p>
    </section>
    <section aria-labelledby="t-pap-org">
      <h2 id="t-pap-org">Organismos por país</h2>
      <div class="tabla-marco"><table class="tabla-oficial">
        <thead><tr><th scope="col">País</th><th scope="col">Aduana y trámites</th><th scope="col">Sanidad</th><th scope="col">Migraciones y transporte</th></tr></thead>
        <tbody>${tablaOrg}</tbody>
      </table></div>
    </section>
  </div>
</div>`,
    })
  );
}

// Buscador interno
{
  const indice = [
    ...fichaPasos.map((p) => {
      const g = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id)?.guia;
      return { t: p.nombre, d: `Paso fronterizo. ${p.ubicacion.texto}`, u: u(`/guia/${g}/`), k: 'Paso fronterizo' };
    }),
    ...guia.filter((p) => p.seccion !== 'pasos').map((p) => ({ t: p.meta.titulo, d: p.meta.resumen, u: u(p.ruta), k: SECCIONES[p.seccion] })),
    ...incidencias.map((i) => ({ t: `${i.ubicacion}: ${TIPOS_INCIDENCIA[i.tipo]?.[0] || i.tipo}`, d: i.descripcion, u: u('/avisos/#obras'), k: 'Obra o restricción' })),
    ...festivos.map((f) => ({ t: `${f.nombre} (${PAISES[f.pais]})`, d: `${fecha(f.fecha)}. ${TIPOS_FESTIVO[f.tipo]}${f.validacion !== 'verificado' ? ', por confirmar' : ''}.`, u: u('/calendario/'), k: 'Festivo' })),
    ...novedades.map((n) => ({ t: n.titulo, d: n.detalle || '', u: n.fuente.url, k: `Novedad, ${n.fuente.nombre}` })),
    ...organismos.map((o) => ({ t: o.nombre, d: `Organismo oficial de ${PAISES[o.pais]}`, u: o.url, k: 'Enlace oficial' })),
    ...empresas.map((e) => ({ t: e.nombre, d: `${catNombre[e.categoria] || ''}, ${e.ciudad}`, u: u(`/directorio/?q=${encodeURIComponent(e.nombre)}`), k: 'Empresa' })),
    { t: 'Papeles y trámites aduaneros', d: 'CRT, MIC/DTA, tránsito aduanero y controles sanitarios por país.', u: u('/papeles/'), k: 'Página' },
    { t: 'Planificar ruta', d: 'Compara rutas, fronteras, papeles y empresas de origen a destino.', u: u('/planificador/'), k: 'Página' },
  ];
  paginas.push({ ruta: '/assets/indice.json', html: JSON.stringify(indice), archivo: true });
  add(
    '/buscar/',
    layout({
      titulo: 'Buscar',
      descripcion: 'Busca pasos, obras, festivos, papeles y empresas del Corredor Bioceánico.',
      ruta: '/buscar/',
      scripts: ['/assets/buscar.js'],
      cuerpo: `
<div class="contenedor contenedor-estrecho">
  <header class="cabeza-pagina"><h1>Buscar en la guía</h1><p>Pasos, obras, festivos, papeles, organismos y empresas.</p></header>
  <form class="busqueda-web" role="search" action="${u('/buscar/')}" method="get">
    <label class="sr" for="q">Qué buscas</label>
    ${icono('buscar')}<input id="q" name="q" type="search" placeholder="Jama, MIC/DTA, festivo, Salta…" autocomplete="off" data-indice="${u('/assets/indice.json')}">
  </form>
  <p class="buscar-estado" id="buscar-estado" role="status"></p>
  <ul class="resultados" id="resultados"></ul>
  <noscript><p class="aviso">Activa JavaScript para buscar.</p></noscript>
</div>`,
    })
  );
}

// 404
paginas.push({
  ruta: '/404.html',
  html: layout({
    titulo: 'Página no encontrada',
    ruta: '/404.html',
    cuerpo: `<div class="contenedor"><header class="cabeza-pagina"><h1>Esta página no existe</h1><p>El enlace puede estar mal o la página se ha movido.</p></header><div class="acciones"><a class="btn btn-principal" href="${u(
      '/'
    )}">Ir al inicio</a><a class="btn btn-borde" href="${u('/guia/')}">Abrir la guía</a></div></div>`,
  }),
});

// ---------- escribir ----------
fs.rmSync(DIST, { recursive: true, force: true });
for (const { ruta, html } of paginas.filter((p) => !p.archivo)) {
  const destino = ruta.endsWith('.html') ? path.join(DIST, ruta) : path.join(DIST, ruta, 'index.html');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
}
fs.cpSync(path.join(ROOT, 'src', 'assets'), path.join(DIST, 'assets'), { recursive: true });
for (const { ruta, html } of paginas.filter((p) => p.archivo)) fs.writeFileSync(path.join(DIST, ruta), html);

// HU-115: MapLibre GL (código abierto) alojado en la propia web. Opcional: si no está instalado,
// la página del mapa muestra el esquema SVG de siempre.
try {
  const dirML = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist');
  fs.mkdirSync(path.join(DIST, 'assets', 'vendor'), { recursive: true });
  for (const f of ['maplibre-gl.js', 'maplibre-gl.css']) fs.copyFileSync(path.join(dirML, f), path.join(DIST, 'assets', 'vendor', f));
} catch {
  console.warn('Aviso: no está instalado maplibre-gl; el mapa interactivo usará el esquema SVG.');
}

// Tipografía Overpass alojada en la propia web (opcional: si no está instalada, se usa la de sustitución).
try {
  const dirFuente = path.join(path.dirname(require.resolve('@fontsource-variable/overpass/package.json')), 'files');
  fs.mkdirSync(path.join(DIST, 'assets', 'fonts'), { recursive: true });
  for (const sub of ['latin', 'latin-ext']) {
    const f = fs.readdirSync(dirFuente).find((x) => x.startsWith(`overpass-${sub}-wght-normal`) && x.endsWith('.woff2'));
    if (f) fs.copyFileSync(path.join(dirFuente, f), path.join(DIST, 'assets', 'fonts', `overpass-${sub}.woff2`));
  }
} catch {
  console.warn('Aviso: no está instalada la tipografía Overpass; se usará la de sustitución.');
}

const urlBase = site.url.replace(/\/$/, '') + B;
const hoy = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas
  .filter((p) => !p.ruta.endsWith('.html') && !p.archivo)
  .map((p) => `  <url><loc>${urlBase}${p.ruta}</loc><lastmod>${hoy}</lastmod></url>`)
  .join('\n')}
</urlset>
`
);
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  site.indexable === false ? 'User-agent: *\nAllow: /api/\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${urlBase}/sitemap.xml\n`
);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// Exportación api/v1 y esquemas públicos (mismos datos y estados que las páginas).
const api = generarApi({ D, HOY, site, urlBase, nivelReg, estadoPaso, nodoNombre });
fs.mkdirSync(path.join(DIST, 'api', 'v1'), { recursive: true });
for (const [f, o] of Object.entries(api)) fs.writeFileSync(path.join(DIST, 'api', 'v1', f), JSON.stringify(o, null, 2) + '\n');
fs.cpSync(path.join(ROOT, 'data', 'esquemas'), path.join(DIST, 'esquemas'), { recursive: true });

console.log(`OK: ${paginas.filter((p) => !p.archivo).length} páginas en dist/ (${guia.length} de guía, ${empresas.length} empresas, ${novedades.length} novedades) y api/v1 (${Object.keys(api).length} archivos).`);
