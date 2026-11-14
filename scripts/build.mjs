// Genera la web estática en dist/ a partir de data/ y content/.
// Uso: npm run build   (variables opcionales: SITE_URL, BASE_PATH)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, readJSON, loadGuia, esc, ESTADOS, SECCIONES, PAISES } from './lib.mjs';

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

const categorias = readJSON('data/categorias.json');
const catNombre = Object.fromEntries(categorias.map((c) => [c.id, c.nombre]));
const rutas = readJSON('data/rutas.json');
const nodoNombre = Object.fromEntries(rutas.nodos.map((n) => [n.id, n.nombre]));
let empresas = readJSON('data/directorio.json');
if (site.mostrarEjemplos === false) empresas = empresas.filter((e) => !e.ejemplo);
empresas.sort((a, b) => Number(b.destacada) - Number(a.destacada) || a.nombre.localeCompare(b.nombre, 'es'));
const empresasEn = (ids = []) => empresas.filter((e) => (e.puntos || []).some((p) => ids.includes(p)));
const novedades = readJSON('data/novedades.json').sort((a, b) => b.fecha.localeCompare(a.fecha));

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

// ---------- iconos (trazo, 24×24) ----------
const ICONOS = {
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
};
const icono = (n, clase = 'icono') =>
  `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONOS[n]}"/></svg>`;

// ---------- piezas comunes ----------
const estado = (e) => `<span class="estado estado-${esc(e)}">${esc(ESTADOS[e] || e)}</span>`;
const paises = (ps = []) => `<span class="paises">${ps.map((p) => `<abbr class="pais" title="${esc(PAISES[p] || p)}">${esc(p)}</abbr>`).join('')}</span>`;
const fecha = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
const tiempo = (iso) => `<time class="rel" datetime="${esc(iso)}">${fecha(iso)}</time>`;
const km = (n) => (typeof n === 'number' ? `${n.toLocaleString('es-ES')}\u202fkm` : '');
const wa = (n) => `https://wa.me/${String(n).replace(/\D/g, '')}`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const listaY = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

const marca = `<span class="placa"><span class="placa-l1">Guía del</span><span class="placa-l2">Corredor</span></span>`;

const temaInicial = `<script>try{var t=localStorage.getItem('guia-corredor:tema');if(t==='oscuro'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.tema='oscuro'}catch(e){}</script>`;

function layout({ titulo, descripcion, ruta, cuerpo, scripts = [], datos = '' }) {
  const t = titulo ? `${titulo} | ${site.nombre}` : site.nombreCompleto;
  const canon = `${site.url.replace(/\/$/, '')}${u(ruta)}`;
  const secciones = [
    ['/planificador/', 'Rutas', 'ruta', (r) => r === '/' || r.startsWith('/planificador/')],
    ['/novedades/', 'Novedades', 'noticias', (r) => r.startsWith('/novedades/')],
    ['/guia/', 'Guía', 'guia', (r) => r.startsWith('/guia/')],
    ['/directorio/', 'Empresas', 'empresas', (r) => r.startsWith('/directorio/')],
  ];
  const nav = secciones.map(([href, txt, , activo]) => `<a href="${u(href)}"${activo(ruta) && ruta !== '/' ? ' aria-current="page"' : ''}>${txt}</a>`).join('');
  const barra = secciones
    .map(([href, txt, ic, activo]) => `<a href="${u(href === '/planificador/' ? '/' : href)}"${activo(ruta) ? ' aria-current="page"' : ''}>${icono(ic)}<span>${txt}</span></a>`)
    .join('');
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
<link rel="preload" href="${u('/assets/fonts/overpass-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${u('/assets/styles.css')}">
</head>
<body>
<a class="saltar" href="#contenido">Ir al contenido</a>
<header class="cabecera">
  <div class="contenedor cabecera-inner">
    <a class="logo" href="${u('/')}" aria-label="${esc(site.nombreCompleto)}, inicio">${marca}</a>
    <nav class="nav" aria-label="Principal">${nav}</nav>
    <div class="cabecera-acciones">
      <a class="btn btn-borde btn-pequeno" href="${u('/anunciate/')}">Anunciar mi empresa</a>
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
      <a href="${u('/novedades/')}">Novedades</a>
      <a href="${u('/guia/')}">Guía</a>
      <a href="${u('/directorio/')}">Empresas</a>
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
  rutas.nodos.forEach((n, i) => {
    const nEmp = empresasEn([n.id]).length;
    items.push(`<li class="parada" data-i="${i}"><span class="via" aria-hidden="true"><span class="punto"></span></span>
      <span class="texto"><strong>${esc(n.nombre)}</strong><span class="parada-pais">${esc(PAISES[n.pais])}</span>${
        nEmp ? `<a class="parada-empresas" href="${u(`/directorio/?punto=${n.id}`)}">${plural(nEmp, 'empresa', 'empresas')}</a>` : ''
      }</span></li>`);
    const t = rutas.tramos[i];
    if (!t) return;
    const enlace = t.paso?.guia || t.guia;
    const etiqueta = t.paso ? `${rutas.nodos[i].pais}–${rutas.nodos[i + 1].pais}` : km(t.km);
    const contenido = `<span class="tramo-estado">${estado(t.estado)}</span>${
      etiqueta ? `<span class="tramo-etiqueta">${t.paso ? '<span class="frontera">Frontera</span>' : ''}${esc(etiqueta)}</span>` : ''
    }`;
    items.push(`<li class="tramo tramo-${esc(t.estado)}${t.paso ? ' tramo-frontera' : ''}" data-i="${i}"><span class="via" aria-hidden="true"></span>
      ${enlace ? `<a class="texto" href="${u(`/guia/${enlace}/`)}">${contenido}</a>` : `<span class="texto">${contenido}</span>`}</li>`);
  });
  return `<div class="carretera-marco"><ol class="ruta" id="ruta-corredor" aria-label="Recorrido del corredor de este a oeste">${items.join('')}</ol></div>`;
}

const opcionesNodos = (sel) => rutas.nodos.map((n, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(n.nombre)}</option>`).join('');

const buscador = (clase = '') => `
<form class="buscador ${clase}" action="${u('/planificador/')}" method="get" role="search" aria-label="Buscar ruta">
  <fieldset>
    <legend>Tipo de carga</legend>
    <div class="chips chips-carga">${rutas.tiposCarga
      .map((c, i) => `<label class="chip chip-radio"><input type="radio" name="carga" value="${esc(c.id)}"${i === 0 ? ' checked' : ''}>${esc(c.nombre)}</label>`)
      .join('')}</div>
  </fieldset>
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
      e.ejemplo ? '<span class="etiqueta etiqueta-ejemplo">Ficha de ejemplo</span>' : ''
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
  <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(catNombre[e.categoria] || e.categoria)}${e.ejemplo ? ', ficha de ejemplo' : ''}</span></span>
  ${e.contacto?.whatsapp ? `<a class="btn btn-wa btn-pequeno" href="${wa(e.contacto.whatsapp)}" rel="nofollow" aria-label="Escribir por WhatsApp a ${esc(e.nombre)}">${icono('chat')}</a>` : ''}
</li>`;

const noticia = (n, { principal = false, conLugar = true } = {}) => {
  const lugar = n.guia && guiaPorRuta[n.guia];
  return `
<article class="noticia${principal ? ` noticia-principal noticia-${esc(n.estado || 'sin-estado')}` : ''}">
  <p class="noticia-meta"><span class="noticia-medio">${esc(n.fuente.nombre)}</span><span>${esc(listaY((n.paises || []).map((p) => PAISES[p] || p)))}</span>${tiempo(n.fecha)}</p>
  <h3><a href="${esc(n.fuente.url)}" rel="noopener">${esc(n.titulo)}</a></h3>
  ${n.detalle ? `<p>${esc(n.detalle)}</p>` : ''}
  ${conLugar && lugar ? `<a class="noticia-lugar" href="${u(lugar.ruta)}">Abrir ${esc(lugar.meta.titulo.replace(/\s*\(.*\)$/, ''))}</a>` : ''}
</article>`;
};

// ---------- páginas ----------
const paginas = [];
const add = (ruta, html) => paginas.push({ ruta, html });

const datosRutas = (extra = {}) =>
  `<script type="application/json" id="datos-rutas">${JSON.stringify({
    nodos: rutas.nodos,
    tramos: rutas.tramos,
    documentosCruce: rutas.documentosCruce,
    avisoDocumentos: rutas.avisoDocumentos,
    tiposCarga: rutas.tiposCarga,
    estados: ESTADOS,
    paises: PAISES,
    base: B,
    ...extra,
  }).replace(/</g, '\\u003c')}</script>`;

// Pasos fronterizos para las historias
const pasosHistoria = [];
rutas.tramos.forEach((t) => {
  const a = rutas.nodos.find((n) => n.id === t.desde);
  const b = rutas.nodos.find((n) => n.id === t.hasta);
  if (t.paso) pasosHistoria.push({ nombre: t.paso.nombre.replace(/\s*\(.*\)$/, '').replace(/^Paso (de )?/, '').replace('Puente de la ', 'Puente '), guia: t.paso.guia, estado: t.estado, cara: `${a.pais}–${b.pais}` });
  if (t.alternativa) pasosHistoria.push({ nombre: t.alternativa.nombre.replace(/\s*\(.*\)$/, '').replace(/^Paso (de )?/, ''), guia: t.alternativa.guia, estado: t.alternativa.estado || t.estado, cara: `${a.pais}–${b.pais}` });
});
const historia = (h) => {
  const contenido = `<span class="historia-anillo"><span class="historia-cara">${esc(h.cara)}</span></span><span class="historia-nombre">${esc(h.nombre)}</span>${estado(h.estado)}`;
  return `<li>${h.guia ? `<a class="historia historia-${esc(h.estado)}" href="${u(`/guia/${h.guia}/`)}">${contenido}</a>` : `<div class="historia historia-${esc(h.estado)}">${contenido}</div>`}</li>`;
};

// Inicio
add(
  '/',
  layout({
    ruta: '/',
    scripts: ['/assets/inicio.js'],
    datos: datosRutas(),
    cuerpo: `
<section class="portada-hero" aria-labelledby="titulo-portada">
  <div class="contenedor">
    <h1 id="titulo-portada">Planifica tu ruta por el corredor bioceánico</h1>
    <p class="hero-sub">Estado de cada tramo y frontera, papeles para cruzar y empresas en cada punto, de Brasil a Chile.</p>
    <div class="tu-ruta" id="tu-ruta" hidden></div>
    ${buscador()}
  </div>
</section>
${seccion({
  titulo: 'Pasos fronterizos hoy',
  contexto: 'Toca un paso para ver requisitos, estado y últimos cambios.',
  enlace: ['/guia/', 'Abrir la guía completa'],
  cuerpo: `<ul class="historias">${pasosHistoria.map(historia).join('')}</ul>`,
})}
${seccion({
  titulo: 'El corredor de punta a punta',
  contexto: 'Cada tramo con su estado. Las empresas aparecen en el punto donde trabajan.',
  cuerpo: `${rutaHTML()}<ul class="leyenda" aria-label="Leyenda de estados">${Object.keys(ESTADOS)
    .map((k) => `<li>${estado(k)}</li>`)
    .join('')}</ul>`,
})}
${seccion({
  titulo: 'Últimos cambios',
  contexto: 'Obras, estado de pasos y acuerdos entre países, con su fuente.',
  enlace: ['/novedades/', 'Ver todas las novedades'],
  cuerpo: `<div class="portal">${noticia(novedades[0], { principal: true })}<ul class="lista-noticias">${novedades
    .slice(1, 4)
    .map((n) => `<li>${noticia(n)}</li>`)
    .join('')}</ul></div>`,
})}
<section class="contenedor seccion" aria-labelledby="t-empresas-banda">
  <div class="banda">
    <div><h2 id="t-empresas-banda">¿Das servicio en el corredor?</h2><p>Aparece en el punto de la ruta donde trabajas. Quien planifica un viaje por ahí te escribe directamente.</p></div>
    <a class="btn" href="${u('/anunciate/')}">Anunciar mi empresa</a>
  </div>
</section>`,
  })
);

// Planificador (resultados)
{
  const emp = empresas.map((e) => ({
    nombre: e.nombre,
    cat: catNombre[e.categoria] || e.categoria,
    destacada: !!e.destacada,
    ejemplo: !!e.ejemplo,
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
  <header class="cabeza-pagina"><h1>Planificar ruta</h1><p>Compara las opciones, revisa cada tramo y comparte la ruta con tu equipo.</p></header>
  ${buscador('buscador-compacto')}
  <div id="resultado" aria-live="polite"></div>
  <noscript><p class="aviso">Activa JavaScript para ver las opciones de ruta.</p></noscript>
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
  const estadosG = [...new Set(guia.map((p) => p.meta.estado))];
  const filas = Object.keys(SECCIONES)
    .flatMap((sec) => guia.filter((p) => p.seccion === sec))
    .map(
      (p) => `<tr data-pais="${esc((p.meta.paises || []).join(' '))}" data-estado="${esc(p.meta.estado)}">
        <td><a href="${u(p.ruta)}">${esc(p.meta.titulo)}</a></td>
        <td class="col-tipo">${esc({ pasos: 'Paso fronterizo', tramos: 'Tramo', documentos: 'Documentos' }[p.seccion] || p.seccion)}</td>
        <td>${paises(p.meta.paises)}</td>
        <td>${estado(p.meta.estado)}</td>
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
  <header class="cabeza-pagina"><h1>Guía del corredor</h1><p>Pasos, tramos y papeles. Cada página indica su estado, sus fuentes y cuándo se revisó.</p></header>
  <div class="filtros-guia" data-filtros="#tabla-guia tbody">
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesG.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Estado"><span class="filtro-etiqueta">Estado</span>
      <button class="chip" type="button" data-filtro="estado" data-valor="" aria-pressed="true">Todos</button>
      ${estadosG.map((e) => `<button class="chip" type="button" data-filtro="estado" data-valor="${esc(e)}" aria-pressed="false">${esc(ESTADOS[e])}</button>`).join('')}
    </div>
  </div>
  <div class="tabla-marco">
    <table class="tabla-guia" id="tabla-guia">
      <thead><tr><th scope="col">Página</th><th scope="col">Tipo</th><th scope="col">Países</th><th scope="col">Estado</th><th scope="col">Revisado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>
  <div class="vacio" data-vacio hidden><p>No hay páginas con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>
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
  add(
    p.ruta,
    layout({
      titulo: p.meta.titulo,
      descripcion: p.meta.resumen,
      ruta: p.ruta,
      cuerpo: `
<div class="contenedor">
  <nav class="migas" aria-label="Estás en"><a href="${u('/guia/')}">Guía</a><span aria-hidden="true">/</span><span>${esc(SECCIONES[p.seccion] || p.seccion)}</span></nav>
  <header class="paso-cabeza senal">
    <h1 class="senal-titulo">${esc(p.meta.titulo)}</h1>
    <span class="senal-pie">${estado(p.meta.estado)}${paises(p.meta.paises)}</span>
  </header>
  <p class="paso-meta"><span>Revisado el ${fecha(p.meta.revisado)}</span>${nov.length ? `<span>Último cambio ${tiempo(nov[0].fecha)}</span>` : ''}</p>
  ${p.meta.borrador ? '<p class="aviso"><span><strong>Borrador.</strong> Este contenido aún no está verificado. No lo uses como referencia para viajar.</span></p>' : ''}
  <div class="paso-cuerpo">
    <article class="articulo">
      <p class="resumen">${esc(p.meta.resumen)}</p>
      ${p.html}
      ${nov.length ? `<h2 id="ultimos-cambios">Últimos cambios</h2><ul class="lista-noticias">${nov.map((n) => `<li>${noticia(n, { conLugar: false })}</li>`).join('')}</ul>` : ''}
    </article>
    <aside class="lateral">
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
        p.indice.length > 2
          ? `<nav class="panel indice" aria-labelledby="t-indice"><h2 id="t-indice">En esta página</h2><ol>${p.indice
              .map((h) => `<li><a href="#${h.id}">${esc(h.t)}</a></li>`)
              .join('')}${nov.length ? '<li><a href="#ultimos-cambios">Últimos cambios</a></li>' : ''}</ol></nav>`
          : ''
      }
      <section class="panel" aria-labelledby="t-viaje"><h2 id="t-viaje">¿Viajas por aquí?</h2><p>Compara rutas, fronteras y papeles de origen a destino.</p>
        <a class="btn btn-principal" href="${u('/planificador/')}">Planificar ruta</a></section>
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
  add(
    '/directorio/',
    layout({
      titulo: 'Empresas del corredor',
      descripcion: 'Transitarios, transportistas, despachantes, depósitos y servicios en cada punto del Corredor Bioceánico.',
      ruta: '/directorio/',
      scripts: ['/assets/directorio.js'],
      datos: `<script type="application/json" id="datos-sugerencias">${JSON.stringify(sugerencias).replace(/</g, '\\u003c')}</script>`,
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Empresas del corredor</h1><p>Busca quién da servicio en cada punto de la ruta y escríbele directamente.</p></header>
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
  const asunto = encodeURIComponent('Alta en el directorio de la Guía del Corredor');
  const cuerpoMail = encodeURIComponent(
    'Empresa:\nPaís y ciudad:\nTipo (transitario, transportista, despachante…):\nPuntos de la ruta donde das servicio:\nServicios:\nEmail y WhatsApp de contacto:\nWeb:\n'
  );
  const waAlta = site.contacto.whatsapp
    ? `<a class="btn btn-wa" href="${wa(site.contacto.whatsapp)}?text=${encodeURIComponent('Hola, quiero dar de alta mi empresa en la Guía del Corredor.')}">${icono('chat')}Enviar por WhatsApp</a>`
    : '';
  add(
    '/anunciate/',
    layout({
      titulo: 'Anunciar mi empresa',
      descripcion: 'Aparece en el punto del Corredor Bioceánico donde das servicio. Ficha básica gratis.',
      ruta: '/anunciate/',
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Anunciar mi empresa</h1><p>Tu empresa aparece en el punto de la ruta donde trabajas: en el planificador, en la guía y en el buscador.</p></header>
  <div class="planes">${planes}</div>
</div>
${seccion({
  titulo: 'Cómo darse de alta',
  contexto: 'Publicamos tu ficha en menos de 48 horas.',
  id: 'alta',
  cuerpo: `<ol class="pasos-alta">
    <li><b>Envía tus datos</b><span>Empresa, tipo, servicios, contacto y puntos de la ruta.</span></li>
    <li><b>Revisamos la ficha</b><span>Comprobamos los datos antes de publicarla.</span></li>
    <li><b>Te avisamos</b><span>Recibes el enlace para compartirla.</span></li>
  </ol>
  <div class="acciones alta-acciones">
    ${site.contacto.email ? `<a class="btn btn-principal" href="mailto:${esc(site.contacto.email)}?subject=${asunto}&body=${cuerpoMail}">${icono('correo')}Enviar datos por email</a>` : ''}
    ${waAlta}
  </div>`,
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
      <li>Cada página y cada novedad indica sus fuentes y su fecha.</li>
      <li>Usamos fuentes oficiales y prensa de referencia de cada país.</li>
      <li>Un despachante de aduana revisa los requisitos antes de quitar el aviso de borrador.</li>
      <li>Si ves un dato desactualizado, escríbenos y lo corregimos.</li>
    </ul>
    <h2>Tu ruta y tus datos</h2>
    <p>El planificador guarda tu última ruta solo en tu navegador. No pedimos registro ni guardamos datos personales.</p>
    <h2>Qué no hacemos</h2>
    <p>No transportamos mercancía, no intermediamos en contratos ni cobramos comisiones por operación. La contratación es directa entre empresas.</p>
  </div>
</div>`,
  })
);

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
for (const { ruta, html } of paginas) {
  const destino = ruta.endsWith('.html') ? path.join(DIST, ruta) : path.join(DIST, ruta, 'index.html');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
}
fs.cpSync(path.join(ROOT, 'src', 'assets'), path.join(DIST, 'assets'), { recursive: true });

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
  .filter((p) => !p.ruta.endsWith('.html'))
  .map((p) => `  <url><loc>${urlBase}${p.ruta}</loc><lastmod>${hoy}</lastmod></url>`)
  .join('\n')}
</urlset>
`
);
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  site.indexable === false ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${urlBase}/sitemap.xml\n`
);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`OK: ${paginas.length} páginas en dist/ (${guia.length} de guía, ${empresas.length} empresas, ${novedades.length} novedades).`);
