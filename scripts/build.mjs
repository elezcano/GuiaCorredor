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
    .replace(/<table>/g, '<div class="tabla-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return { ...p, html, indice };
});
const guiaPorRuta = Object.fromEntries(guia.map((p) => [`${p.seccion}/${p.slug}`, p]));

// ---------- piezas comunes ----------
const estado = (e) => `<span class="estado estado-${esc(e)}">${esc(ESTADOS[e] || e)}</span>`;
const paises = (ps = []) => ps.map((p) => `<abbr class="pais" title="${esc(PAISES[p] || p)}">${esc(p)}</abbr>`).join('');
const fecha = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
const tiempo = (iso) => `<time class="rel" datetime="${esc(iso)}">${fecha(iso)}</time>`;
const km = (n) => (typeof n === 'number' ? `${n.toLocaleString('es-ES')} km` : '');
const wa = (n) => `https://wa.me/${String(n).replace(/\D/g, '')}`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

const marca = `<span class="placa"><span class="placa-linea1">Guía del</span><span class="placa-linea2">Corredor</span></span>`;

function layout({ titulo, descripcion, ruta, cuerpo, scripts = [], datos = '', claseBody = '' }) {
  const t = titulo ? `${titulo} | ${site.nombre}` : site.nombreCompleto;
  const canon = `${site.url.replace(/\/$/, '')}${u(ruta)}`;
  const nav = [
    ['/planificador/', 'Planificar ruta'],
    ['/novedades/', 'Novedades'],
    ['/guia/', 'Guía'],
    ['/directorio/', 'Empresas'],
  ]
    .map(([href, txt]) => `<a href="${u(href)}"${ruta.startsWith(href) ? ' aria-current="page"' : ''}>${txt}</a>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="${site.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t)}</title>
<meta name="description" content="${esc(descripcion || site.lema)}">
<link rel="canonical" href="${esc(canon)}">${site.indexable === false ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(descripcion || site.lema)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#23272c">
<link rel="preload" href="${u('/assets/fonts/overpass-latin.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${u('/assets/styles.css')}">
</head>
<body class="${claseBody}">
<a class="saltar" href="#contenido">Ir al contenido</a>
<header class="cabecera">
  <div class="marco cabecera-inner">
    <a class="logo" href="${u('/')}" aria-label="${esc(site.nombreCompleto)}, inicio">${marca}</a>
    <nav class="nav" aria-label="Principal">${nav}<a class="nav-cta" href="${u('/anunciate/')}">Anunciar mi empresa</a></nav>
  </div>
</header>
<main id="contenido">
${cuerpo}
</main>
<footer class="pie">
  <div class="marco pie-inner">
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
${datos}
<script src="${u('/assets/comun.js')}" defer></script>
${scripts.map((s) => `<script src="${u(s)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

/** Corredor como carretera: paradas y tramos alternos. Horizontal en escritorio, vertical en móvil. */
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
    const etiqueta = t.paso ? t.paso.nombre.replace(/\s*\(.*\)$/, '') : km(t.km);
    const contenido = `<span class="tramo-estado">${estado(t.estado)}</span>${
      etiqueta ? `<span class="tramo-etiqueta">${t.paso ? '<span class="frontera">Frontera</span>' : ''}${esc(etiqueta)}</span>` : ''
    }`;
    items.push(`<li class="tramo tramo-${esc(t.estado)}${t.paso ? ' tramo-frontera' : ''}" data-i="${i}"><span class="via" aria-hidden="true"></span>
      ${enlace ? `<a class="texto" href="${u(`/guia/${enlace}/`)}">${contenido}</a>` : `<span class="texto">${contenido}</span>`}</li>`);
  });
  return `<ol class="ruta" id="ruta-corredor" aria-label="Recorrido del corredor de este a oeste">${items.join('')}</ol>`;
}

const opcionesNodos = (sel) =>
  rutas.nodos.map((n, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(n.nombre)}</option>`).join('');

const formPlanificador = (claseExtra = '') => `
<form class="planificar ${claseExtra}" action="${u('/planificador/')}" method="get">
  <label><span>Desde</span><select name="desde" id="origen">${opcionesNodos(0)}</select></label>
  <label><span>Hasta</span><select name="hasta" id="destino">${opcionesNodos(rutas.nodos.length - 1)}</select></label>
  <button class="boton boton-amarillo" type="submit">Ver la ruta</button>
</form>`;

const filaEmpresa = (e) => `
<article class="empresa${e.destacada ? ' empresa-destacada' : ''}" data-pais="${esc(e.pais)}" data-categoria="${esc(e.categoria)}" data-puntos="${esc(
  (e.puntos || []).join(' ')
)}" data-texto="${esc([e.nombre, e.ciudad, catNombre[e.categoria], ...(e.servicios || []), ...(e.puntos || []).map((p) => nodoNombre[p])].join(' ').toLowerCase())}">
  <div class="empresa-principal">
    <h3>${esc(e.nombre)}</h3>
    <p class="empresa-datos">${esc(catNombre[e.categoria] || e.categoria)}, ${esc(e.ciudad)} (${esc(PAISES[e.pais] || e.pais)})</p>
    ${e.descripcion ? `<p class="empresa-desc">${esc(e.descripcion)}</p>` : ''}
    ${e.puntos?.length ? `<p class="empresa-puntos">Da servicio en ${e.puntos.map((p) => esc(nodoNombre[p] || p)).join(', ')}</p>` : ''}
    ${e.servicios?.length ? `<ul class="etiquetas">${e.servicios.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="empresa-lado">
    ${e.destacada ? '<span class="sello">Destacada</span>' : ''}${e.ejemplo ? '<span class="sello sello-ejemplo">Ficha de ejemplo</span>' : ''}
    <div class="empresa-acciones">
      ${e.contacto?.whatsapp ? `<a class="boton boton-wa" href="${wa(e.contacto.whatsapp)}" rel="nofollow">WhatsApp</a>` : ''}
      ${e.contacto?.email ? `<a class="boton boton-linea" href="mailto:${esc(e.contacto.email)}">Email</a>` : ''}
      ${e.contacto?.web ? `<a class="boton boton-linea" href="${esc(e.contacto.web)}" rel="nofollow noopener">Web</a>` : ''}
      ${!e.contacto?.whatsapp && !e.contacto?.email && !e.contacto?.web ? '<span class="sin-contacto">Sin datos de contacto</span>' : ''}
    </div>
  </div>
</article>`;

/** Empresa en formato compacto, para mostrarla dentro de la ruta o de una página de la guía. */
const empresaMini = (e) => `
<li class="mini${e.destacada ? ' mini-destacada' : ''}">
  <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(catNombre[e.categoria] || e.categoria)}${e.ejemplo ? ', ficha de ejemplo' : ''}</span></span>
  ${e.contacto?.whatsapp ? `<a class="mini-wa" href="${wa(e.contacto.whatsapp)}" rel="nofollow" aria-label="WhatsApp de ${esc(e.nombre)}">WhatsApp</a>` : ''}
</li>`;

const senal = (p) => `
<a class="senal" href="${u(p.ruta)}">
  <span class="senal-titulo">${esc(p.meta.titulo)}</span>
  <span class="senal-pie">${estado(p.meta.estado)}<span class="senal-paises">${paises(p.meta.paises)}</span></span>
</a>`;

const itemNovedad = (n, { conLugar = true } = {}) => {
  const lugar = n.guia && guiaPorRuta[n.guia];
  return `
<li class="novedad${n.estado ? ` novedad-${esc(n.estado)}` : ''}">
  <div class="novedad-cuando">${tiempo(n.fecha)}<span class="novedad-tema">${esc(n.tema)}</span></div>
  <div class="novedad-cuerpo">
    <h3>${esc(n.titulo)}</h3>
    ${n.detalle ? `<p>${esc(n.detalle)}</p>` : ''}
    <p class="novedad-pie">${conLugar && lugar ? `<a href="${u(lugar.ruta)}">${esc(lugar.meta.titulo)}</a><span aria-hidden="true">/</span>` : ''}Fuente: <a href="${esc(
      n.fuente.url
    )}" rel="noopener">${esc(n.fuente.nombre)}</a></p>
  </div>
</li>`;
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
    estados: ESTADOS,
    paises: PAISES,
    base: B,
    ...extra,
  }).replace(/</g, '\\u003c')}</script>`;

// Inicio
{
  const pasos = guia.filter((p) => p.seccion === 'pasos');
  const otros = guia.filter((p) => p.seccion !== 'pasos');
  add(
    '/',
    layout({
      ruta: '/',
      claseBody: 'portada',
      scripts: ['/assets/inicio.js'],
      datos: datosRutas(),
      cuerpo: `
<section class="hero">
  <div class="marco">
    <h1>Del Atlántico al Pacífico por carretera, tramo a tramo</h1>
    <p class="hero-sub">Cómo está cada tramo y frontera hoy, qué papeles necesitas y quién te ayuda en cada punto de la ruta Brasil, Paraguay, Argentina, Chile.</p>
    <div id="tu-ruta" hidden></div>
    ${formPlanificador('planificar-hero')}
  </div>
  <div class="marco hero-ruta">
    ${rutaHTML()}
    <ul class="leyenda" aria-label="Leyenda de estados">${Object.keys(ESTADOS)
      .map((k) => `<li>${estado(k)}</li>`)
      .join('')}</ul>
  </div>
</section>

<section class="marco seccion">
  <div class="seccion-cabeza">
    <h2>Últimos cambios en el corredor</h2>
    <a href="${u('/novedades/')}">Todas las novedades</a>
  </div>
  <ol class="novedades">${novedades.slice(0, 4).map((n) => itemNovedad(n)).join('')}</ol>
</section>

<section class="marco seccion">
  <div class="seccion-cabeza">
    <h2>Pasos fronterizos</h2>
    <a href="${u('/guia/')}">Toda la guía</a>
  </div>
  <div class="senales">${pasos.map(senal).join('')}</div>
  ${otros.length ? `<ul class="enlaces-guia">${otros.map((p) => `<li><a href="${u(p.ruta)}">${esc(p.meta.titulo)}</a>${estado(p.meta.estado)}</li>`).join('')}</ul>` : ''}
</section>

<section class="marco seccion">
  <div class="banda">
    <div>
      <h2>¿Das servicio en el corredor?</h2>
      <p>Aparece en el punto de la ruta donde trabajas. Quien planifica un viaje por ahí te ve y te escribe directamente por WhatsApp.</p>
    </div>
    <a class="boton boton-amarillo" href="${u('/anunciate/')}">Anunciar mi empresa</a>
  </div>
</section>`,
    })
  );
}

// Novedades
add(
  '/novedades/',
  layout({
    titulo: 'Novedades del corredor',
    descripcion: 'Cambios de estado, avances de obras y acuerdos del Corredor Bioceánico, con fecha y fuente.',
    ruta: '/novedades/',
    cuerpo: `
<div class="marco">
  <header class="cabeza-pagina"><h1>Novedades del corredor</h1><p>Cambios de estado de pasos y tramos, avances de obras y acuerdos entre países. Cada novedad lleva su fecha y su fuente.</p></header>
  <ol class="novedades novedades-pagina">${novedades.map((n) => itemNovedad(n)).join('')}</ol>
</div>`,
  })
);

// Índice de la guía
{
  const grupos = Object.entries(SECCIONES)
    .map(([sec, nombre]) => {
      const ps = guia.filter((p) => p.seccion === sec);
      return ps.length ? `<section class="seccion"><h2>${esc(nombre)}</h2><div class="senales">${ps.map(senal).join('')}</div></section>` : '';
    })
    .join('');
  add(
    '/guia/',
    layout({
      titulo: 'Guía del corredor',
      descripcion: 'Pasos fronterizos, tramos y documentos del Corredor Bioceánico, con estado y fuentes.',
      ruta: '/guia/',
      cuerpo: `<div class="marco"><header class="cabeza-pagina"><h1>Guía del corredor</h1><p>Cada página indica su estado, sus fuentes y la fecha de la última revisión.</p></header>${grupos}</div>`,
    })
  );
}

// Páginas de la guía
for (const p of guia) {
  const zona = p.meta.puntos || [];
  const emp = empresasEn(zona);
  const nov = novedades.filter((n) => n.guia === `${p.seccion}/${p.slug}`);
  const nombresZona = zona.map((z) => nodoNombre[z] || z).join(', ').replace(/, ([^,]*)$/, ' y $1');
  add(
    p.ruta,
    layout({
      titulo: p.meta.titulo,
      descripcion: p.meta.resumen,
      ruta: p.ruta,
      cuerpo: `
<div class="marco">
  <nav class="migas" aria-label="Estás en"><a href="${u('/guia/')}">Guía</a><span aria-hidden="true">/</span>${esc(SECCIONES[p.seccion] || p.seccion)}</nav>
  <header class="senal senal-grande">
    <h1 class="senal-titulo">${esc(p.meta.titulo)}</h1>
    <span class="senal-pie">${estado(p.meta.estado)}<span class="senal-paises">${paises(p.meta.paises)}</span></span>
  </header>
  <p class="revisado">Revisado el ${fecha(p.meta.revisado)}${nov.length ? `. Último cambio: ${tiempo(nov[0].fecha)}` : ''}</p>
  ${p.meta.borrador ? '<p class="aviso-borrador"><strong>Borrador.</strong> Este contenido aún no está verificado. No lo uses como referencia para viajar.</p>' : ''}
  <div class="guia-cuerpo">
    <article class="articulo">
      <p class="resumen">${esc(p.meta.resumen)}</p>
      ${p.html}
      ${
        nov.length
          ? `<section class="cambios-pagina"><h2 id="ultimos-cambios">Últimos cambios</h2><ol class="novedades novedades-compactas">${nov
              .map((n) => itemNovedad(n, { conLugar: false }))
              .join('')}</ol></section>`
          : ''
      }
    </article>
    <aside class="lateral">
      ${
        zona.length
          ? `<section class="caja caja-suave caja-zona">
        <h2>Quién te ayuda en ${esc(nombresZona)}</h2>
        ${
          emp.length
            ? `<ul class="minis">${emp.slice(0, 4).map(empresaMini).join('')}</ul>
               <a class="enlace-mas" href="${u(`/directorio/?punto=${zona[0]}`)}">Ver todas las empresas de la zona</a>`
            : `<p>Aún no hay empresas en esta zona.</p>`
        }
        <a class="boton boton-linea" href="${u('/anunciate/')}">Aparecer aquí</a>
      </section>`
          : ''
      }
      ${
        p.indice.length > 2
          ? `<nav class="indice" aria-label="En esta página"><h2>En esta página</h2><ol>${p.indice.map((h) => `<li><a href="#${h.id}">${esc(h.t)}</a></li>`).join('')}${
              nov.length ? '<li><a href="#ultimos-cambios">Últimos cambios</a></li>' : ''
            }</ol></nav>`
          : ''
      }
      <div class="caja">
        <h2>¿Viajas por aquí?</h2>
        <p>Mira todos los tramos, fronteras, papeles y empresas de tu ruta.</p>
        <a class="boton" href="${u('/planificador/')}">Planificar ruta</a>
      </div>
    </aside>
  </div>
</div>`,
    })
  );
}

// Planificador
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
      descripcion: 'Elige origen y destino en el Corredor Bioceánico y mira tramos, fronteras, estado, papeles y empresas en cada punto.',
      ruta: '/planificador/',
      scripts: ['/assets/planificador.js'],
      datos: datosRutas({ empresas: emp }),
      cuerpo: `
<div class="marco">
  <header class="cabeza-pagina"><h1>Planificar ruta</h1><p>Elige desde dónde y hasta dónde. Te mostramos cada tramo, las fronteras, cómo están hoy, los papeles que necesitas y quién te ayuda en cada punto. Guardamos tu ruta en este dispositivo para que la tengas a mano al volver.</p></header>
  ${formPlanificador('planificar-pagina')}
  <div id="resultado-ruta" aria-live="polite"></div>
  <noscript><p>Activa JavaScript para usar el planificador.</p></noscript>
</div>`,
    })
  );
}

// Directorio
{
  const paisesUsados = [...new Set(empresas.map((e) => e.pais))];
  const cuenta = (fn) => empresas.filter(fn).length;
  add(
    '/directorio/',
    layout({
      titulo: 'Empresas del corredor',
      descripcion: 'Transitarios, transportistas, despachantes, depósitos y servicios en cada punto del Corredor Bioceánico.',
      ruta: '/directorio/',
      scripts: ['/assets/directorio.js'],
      cuerpo: `
<div class="marco">
  <header class="cabeza-pagina"><h1>Empresas del corredor</h1><p>Busca por punto de la ruta y contacta directamente. ¿Falta la tuya? <a href="${u('/anunciate/')}">Date de alta gratis</a>.</p></header>
  <div class="directorio">
    <form class="filtros" onsubmit="return false" aria-label="Filtrar empresas">
      <label class="filtro-buscar"><span>Punto de la ruta</span>
        <select id="f-punto"><option value="">Toda la ruta</option>${rutas.nodos
          .map((n) => `<option value="${esc(n.id)}">${esc(n.nombre)} (${cuenta((e) => (e.puntos || []).includes(n.id))})</option>`)
          .join('')}</select>
      </label>
      <label class="filtro-buscar"><span>Buscar</span><input type="search" id="f-texto" placeholder="Nombre, ciudad o servicio"></label>
      <fieldset>
        <legend>País</legend>
        <div class="segmentos">
          <label><input type="radio" name="pais" value="" checked><span>Todos</span></label>
          ${paisesUsados.map((p) => `<label><input type="radio" name="pais" value="${esc(p)}"><span>${esc(PAISES[p] || p)}</span></label>`).join('')}
        </div>
      </fieldset>
      <fieldset class="tipos">
        <legend>Tipo de empresa</legend>
        <label class="opcion"><input type="radio" name="tipo" value="" checked><span>Todas</span><span class="n">${empresas.length}</span></label>
        ${categorias
          .map(
            (c) =>
              `<label class="opcion"><input type="radio" name="tipo" value="${esc(c.id)}"><span>${esc(c.nombre)}</span><span class="n">${cuenta((e) => e.categoria === c.id)}</span></label>`
          )
          .join('')}
      </fieldset>
    </form>
    <section class="resultados" aria-label="Resultados">
      <p class="contador" id="contador" role="status">${empresas.length} empresas</p>
      <div id="lista-empresas">${empresas.map(filaEmpresa).join('')}</div>
      <div class="vacio" id="sin-resultados" hidden>
        <p><strong>No hay empresas con esos filtros.</strong> Prueba con otro punto, país o tipo, o borra la búsqueda.</p>
        <button class="boton boton-linea" type="button" id="limpiar">Quitar filtros</button>
      </div>
    </section>
  </div>
</div>`,
    })
  );
}

// Anúnciate
{
  const planes = site.planes
    .map(
      (pl) => `
<section class="plan${pl.id === 'destacada' ? ' plan-destacado' : ''}">
  <h2>${esc(pl.nombre)}</h2>
  <p class="precio">${esc(pl.precio)}</p>
  <ul class="lista-check">${pl.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  ${
    pl.id === 'destacada'
      ? pl.enlacePago
        ? `<a class="boton boton-amarillo" href="${esc(pl.enlacePago)}" rel="noopener">Contratar con PayPal</a><p class="nota">Pago mensual con PayPal o tarjeta. Factura incluida. Cancelas cuando quieras.</p>`
        : '<p class="nota">Disponible en cuanto abramos los pagos (PayPal o tarjeta, con factura). Si te interesa, dínoslo al darte de alta.</p>'
      : '<a class="boton" href="#alta">Darme de alta gratis</a>'
  }
</section>`
    )
    .join('');
  const asunto = encodeURIComponent('Alta en el directorio de la Guía del Corredor');
  const cuerpoMail = encodeURIComponent(
    'Empresa:\nPaís y ciudad:\nTipo (transitario, transportista, despachante…):\nPuntos de la ruta donde das servicio:\nServicios:\nEmail y WhatsApp de contacto:\nWeb:\n'
  );
  const waAlta = site.contacto.whatsapp
    ? `<a class="boton boton-wa" href="${wa(site.contacto.whatsapp)}?text=${encodeURIComponent('Hola, quiero dar de alta mi empresa en la Guía del Corredor.')}">Enviar por WhatsApp</a>`
    : '';
  add(
    '/anunciate/',
    layout({
      titulo: 'Anunciar mi empresa',
      descripcion: 'Aparece en el punto del Corredor Bioceánico donde das servicio. Ficha básica gratis.',
      ruta: '/anunciate/',
      cuerpo: `
<div class="marco">
  <header class="cabeza-pagina"><h1>Anunciar mi empresa</h1><p>Tu empresa aparece en el punto de la ruta donde trabajas: en el planificador, en las páginas de la guía y en el buscador. Quien pasa por ahí te encuentra y te escribe directamente.</p></header>
  <div class="planes">${planes}</div>
  <section class="seccion alta" id="alta">
    <h2>Cómo darse de alta</h2>
    <ol class="pasos">
      <li><strong>Envíanos tus datos</strong> por email o WhatsApp: empresa, tipo, servicios, contacto y en qué puntos de la ruta trabajas.</li>
      <li><strong>Revisamos la ficha</strong> y la publicamos en menos de 48 horas.</li>
      <li><strong>Te avisamos</strong> con el enlace para que la compartas.</li>
    </ol>
    <div class="acciones">
      ${site.contacto.email ? `<a class="boton" href="mailto:${esc(site.contacto.email)}?subject=${asunto}&body=${cuerpoMail}">Enviar por email</a>` : ''}
      ${waAlta}
    </div>
  </section>
</div>`,
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
<div class="marco">
  <header class="cabeza-pagina"><h1>Cómo trabajamos la información</h1></header>
  <div class="articulo articulo-solo">
    <p>La ${esc(site.nombreCompleto)} reúne en un solo sitio la información práctica para mover mercancía por carretera entre Brasil, Paraguay, Argentina y Chile: rutas, pasos fronterizos, documentos y empresas que dan servicio en el camino.</p>
    <h2>Fuentes y revisión</h2>
    <ul>
      <li>Cada página y cada novedad indica sus <strong>fuentes</strong> y su <strong>fecha</strong>.</li>
      <li>Usamos fuentes oficiales (ministerios, aduanas, vialidad) y prensa de referencia.</li>
      <li>Los requisitos aduaneros los revisa un despachante de aduana antes de publicarse como definitivos.</li>
      <li>Si ves un dato desactualizado, escríbenos y lo corregimos.</li>
    </ul>
    <h2>Tu ruta y tus datos</h2>
    <p>El planificador guarda tu última ruta solo en tu navegador, para mostrártela al volver. No pedimos registro ni guardamos datos personales.</p>
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
    cuerpo: `<div class="marco"><header class="cabeza-pagina"><h1>Esta página no existe</h1><p>Puede que el enlace esté mal o que la hayamos movido.</p></header><p class="acciones"><a class="boton" href="${u('/')}">Ir al inicio</a><a class="boton boton-linea" href="${u('/guia/')}">Ver la guía</a></p></div>`,
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
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas
  .filter((p) => !p.ruta.endsWith('.html'))
  .map((p) => `  <url><loc>${urlBase}${p.ruta}</loc><lastmod>${hoy}</lastmod></url>`)
  .join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  site.indexable === false ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${urlBase}/sitemap.xml\n`
);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

console.log(`OK: ${paginas.length} páginas en dist/ (${guia.length} de guía, ${empresas.length} empresas, ${novedades.length} novedades).`);
