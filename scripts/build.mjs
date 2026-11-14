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
let empresas = readJSON('data/directorio.json');
if (site.mostrarEjemplos === false) empresas = empresas.filter((e) => !e.ejemplo);
empresas.sort((a, b) => Number(b.destacada) - Number(a.destacada) || a.nombre.localeCompare(b.nombre, 'es'));

const guia = loadGuia().map((p) => ({
  ...p,
  html: marked.parse(p.body).replace(/href="\/(?!\/)/g, `href="${B}/`),
}));

// ---------- piezas comunes ----------
const badgeEstado = (e) => `<span class="estado estado-${esc(e)}">${esc(ESTADOS[e] || e)}</span>`;
const badgesPaises = (ps = []) => ps.map((p) => `<span class="pais" title="${esc(PAISES[p] || p)}">${esc(p)}</span>`).join('');
const fecha = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};

function layout({ titulo, descripcion, ruta, cuerpo, scripts = [], datos = '' }) {
  const t = titulo ? `${titulo} · ${site.nombre}` : `${site.nombreCompleto}`;
  const canon = `${site.url.replace(/\/$/, '')}${u(ruta)}`;
  const nav = [
    ['/guia/', 'Guía'],
    ['/planificador/', 'Planificador'],
    ['/directorio/', 'Directorio'],
    ['/anunciate/', 'Anúnciate'],
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
<link rel="stylesheet" href="${u('/assets/styles.css')}">
</head>
<body>
<header class="cabecera">
  <div class="contenedor cabecera-inner">
    <a class="marca" href="${u('/')}"><span class="marca-icono" aria-hidden="true">◆</span>${esc(site.nombre)}</a>
    <nav class="nav">${nav}</nav>
  </div>
</header>
<div class="aviso"><div class="contenedor">${esc(site.aviso)}</div></div>
<main class="contenedor">
${cuerpo}
</main>
<footer class="pie">
  <div class="contenedor pie-inner">
    <div><strong>${esc(site.nombreCompleto)}</strong><br>${esc(site.lema)}</div>
    <div><a href="${u('/sobre/')}">Sobre la guía</a> · <a href="${u('/anunciate/')}">Aparece en el directorio</a>${site.contacto.email ? ` · <a href="mailto:${esc(site.contacto.email)}">Contacto</a>` : ''}</div>
  </div>
</footer>
${datos}
${scripts.map((s) => `<script src="${u(s)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

const tarjetaGuia = (p) => `
<a class="tarjeta" href="${u(p.ruta)}">
  <div class="tarjeta-meta">${badgeEstado(p.meta.estado)}${badgesPaises(p.meta.paises)}</div>
  <h3>${esc(p.meta.titulo)}</h3>
  <p>${esc(p.meta.resumen)}</p>
</a>`;

const tarjetaEmpresa = (e) => `
<article class="empresa${e.destacada ? ' destacada' : ''}" data-pais="${esc(e.pais)}" data-categoria="${esc(e.categoria)}" data-texto="${esc(
  [e.nombre, e.ciudad, ...(e.servicios || [])].join(' ').toLowerCase()
)}">
  <div class="tarjeta-meta">
    ${e.destacada ? '<span class="sello">Destacada</span>' : ''}${e.ejemplo ? '<span class="sello sello-ejemplo">Ficha de ejemplo</span>' : ''}
    <span class="pais">${esc(e.pais)}</span>
  </div>
  <h3>${esc(e.nombre)}</h3>
  <p class="empresa-sub">${esc(catNombre[e.categoria] || e.categoria)} · ${esc(e.ciudad)}</p>
  ${e.descripcion ? `<p>${esc(e.descripcion)}</p>` : ''}
  ${e.servicios?.length ? `<ul class="chips">${e.servicios.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  <div class="empresa-acciones">
    ${e.contacto?.whatsapp ? `<a class="boton boton-wa" href="https://wa.me/${esc(e.contacto.whatsapp.replace(/\D/g, ''))}" rel="nofollow">WhatsApp</a>` : ''}
    ${e.contacto?.email ? `<a class="boton boton-sec" href="mailto:${esc(e.contacto.email)}">Email</a>` : ''}
    ${e.contacto?.web ? `<a class="boton boton-sec" href="${esc(e.contacto.web)}" rel="nofollow noopener">Web</a>` : ''}
  </div>
</article>`;

// ---------- páginas ----------
const paginas = [];
const add = (ruta, html) => paginas.push({ ruta, html });

// Inicio
{
  const estadoCorredor = rutas.tramos
    .map((t) => {
      const de = rutas.nodos.find((n) => n.id === t.desde)?.nombre;
      const a = rutas.nodos.find((n) => n.id === t.hasta)?.nombre;
      const enlace = t.paso?.guia || t.guia;
      const etiqueta = t.paso ? t.paso.nombre : `${de} → ${a}`;
      return `<li>${badgeEstado(t.estado)} ${enlace ? `<a href="${u(`/guia/${enlace}/`)}">${esc(etiqueta)}</a>` : esc(etiqueta)}</li>`;
    })
    .join('');
  const destacadas = empresas.filter((e) => e.destacada).slice(0, 3);
  add(
    '/',
    layout({
      titulo: '',
      ruta: '/',
      cuerpo: `
<section class="portada">
  <h1>Todo lo que necesitas para mover carga por el Corredor Bioceánico</h1>
  <p class="entradilla">${esc(site.lema)}</p>
  <div class="acciones">
    <a class="boton" href="${u('/planificador/')}">Planificar una ruta</a>
    <a class="boton boton-sec" href="${u('/directorio/')}">Buscar empresas</a>
  </div>
</section>

<section class="bloque">
  <h2>Estado del corredor</h2>
  <ul class="lista-estado">${estadoCorredor}</ul>
  <p class="nota">Actualizado ${fecha(new Date().toISOString().slice(0, 10))}. Cada página indica su fuente y su fecha de revisión.</p>
</section>

<section class="bloque">
  <h2>Guía</h2>
  <div class="rejilla">${guia.map(tarjetaGuia).join('')}</div>
</section>

${
  destacadas.length
    ? `<section class="bloque"><h2>Empresas destacadas</h2><div class="rejilla">${destacadas.map(tarjetaEmpresa).join('')}</div>
<p><a href="${u('/directorio/')}">Ver todo el directorio →</a></p></section>`
    : ''
}

<section class="bloque llamada">
  <h2>¿Das servicio en el corredor?</h2>
  <p>Transitarios, transportistas, despachantes, depósitos, talleres: aparece gratis en el directorio.</p>
  <a class="boton" href="${u('/anunciate/')}">Dar de alta mi empresa</a>
</section>`,
    })
  );
}

// Índice de la guía
{
  const grupos = Object.entries(SECCIONES)
    .map(([sec, nombre]) => {
      const ps = guia.filter((p) => p.seccion === sec);
      return ps.length ? `<section class="bloque"><h2>${esc(nombre)}</h2><div class="rejilla">${ps.map(tarjetaGuia).join('')}</div></section>` : '';
    })
    .join('');
  add(
    '/guia/',
    layout({
      titulo: 'Guía del corredor',
      descripcion: 'Pasos fronterizos, tramos y documentos del Corredor Bioceánico, con estado y fuentes.',
      ruta: '/guia/',
      cuerpo: `<h1>Guía del corredor</h1><p class="entradilla">Cada página indica su estado, su fuente y la fecha de la última revisión.</p>${grupos}`,
    })
  );
}

// Páginas de la guía
for (const p of guia) {
  add(
    p.ruta,
    layout({
      titulo: p.meta.titulo,
      descripcion: p.meta.resumen,
      ruta: p.ruta,
      cuerpo: `
<nav class="migas"><a href="${u('/guia/')}">Guía</a> › ${esc(SECCIONES[p.seccion] || p.seccion)}</nav>
<div class="pagina-guia">
  <article class="articulo">
    <h1>${esc(p.meta.titulo)}</h1>
    <div class="tarjeta-meta">${badgeEstado(p.meta.estado)}${badgesPaises(p.meta.paises)}<span class="revisado">Revisado: ${fecha(p.meta.revisado)}</span></div>
    ${p.meta.borrador ? '<p class="borrador">Borrador: contenido pendiente de verificación.</p>' : ''}
    <p class="entradilla">${esc(p.meta.resumen)}</p>
    ${p.html}
  </article>
  <aside class="lateral">
    <div class="caja">
      <h3>¿Das servicio en esta zona?</h3>
      <p>Aparece en el directorio y que te encuentren quienes planifican esta ruta.</p>
      <a class="boton" href="${u('/anunciate/')}">Dar de alta mi empresa</a>
    </div>
    <div class="caja">
      <h3>Planifica tu viaje</h3>
      <p>Tramos, pasos y documentos de origen a destino.</p>
      <a class="boton boton-sec" href="${u('/planificador/')}">Abrir planificador</a>
    </div>
  </aside>
</div>`,
    })
  );
}

// Planificador
{
  const opciones = rutas.nodos.map((n, i) => `<option value="${i}">${esc(n.nombre)} (${esc(n.pais)})</option>`).join('');
  const datos = `<script type="application/json" id="datos-rutas">${JSON.stringify({ ...rutas, estados: ESTADOS, base: B }).replace(/</g, '\\u003c')}</script>`;
  add(
    '/planificador/',
    layout({
      titulo: 'Planificador de ruta',
      descripcion: 'Elige origen y destino en el Corredor Bioceánico y mira tramos, pasos fronterizos, estado y documentos.',
      ruta: '/planificador/',
      scripts: ['/assets/planificador.js'],
      datos,
      cuerpo: `
<h1>Planificador de ruta</h1>
<p class="entradilla">Elige origen y destino: te mostramos los tramos, los pasos fronterizos, su estado y los papeles que necesitas.</p>
<form class="formulario" id="form-ruta" onsubmit="return false">
  <label>Origen<select id="origen">${opciones}</select></label>
  <label>Destino<select id="destino">${opciones}</select></label>
</form>
<div id="resultado-ruta" aria-live="polite"></div>
<noscript><p>Activa JavaScript para usar el planificador.</p></noscript>`,
    })
  );
}

// Directorio
{
  const paisesUsados = [...new Set(empresas.map((e) => e.pais))];
  add(
    '/directorio/',
    layout({
      titulo: 'Directorio de empresas',
      descripcion: 'Transitarios, transportistas, despachantes, depósitos y servicios a lo largo del Corredor Bioceánico.',
      ruta: '/directorio/',
      scripts: ['/assets/directorio.js'],
      cuerpo: `
<h1>Directorio de empresas</h1>
<p class="entradilla">Empresas que dan servicio a lo largo del corredor. ¿Falta la tuya? <a href="${u('/anunciate/')}">Date de alta gratis</a>.</p>
<form class="formulario filtros" onsubmit="return false">
  <label>Buscar<input type="search" id="f-texto" placeholder="Nombre, ciudad o servicio"></label>
  <label>País<select id="f-pais"><option value="">Todos</option>${paisesUsados
    .map((p) => `<option value="${esc(p)}">${esc(PAISES[p] || p)}</option>`)
    .join('')}</select></label>
  <label>Tipo<select id="f-categoria"><option value="">Todos</option>${categorias
    .map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`)
    .join('')}</select></label>
</form>
<p class="nota" id="contador">${empresas.length} empresas</p>
<div class="rejilla" id="lista-empresas">${empresas.map(tarjetaEmpresa).join('')}</div>
<p class="vacio" id="sin-resultados" hidden>No hay empresas con esos filtros.</p>`,
    })
  );
}

// Anúnciate
{
  const planes = site.planes
    .map(
      (pl) => `
<div class="plan${pl.id === 'destacada' ? ' plan-destacado' : ''}">
  <h3>${esc(pl.nombre)}</h3>
  <p class="precio">${esc(pl.precio)}</p>
  <ul>${pl.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  ${
    pl.id === 'destacada'
      ? pl.enlacePago
        ? `<a class="boton" href="${esc(pl.enlacePago)}">Contratar</a>`
        : '<span class="boton boton-desactivado">Disponible pronto</span>'
      : ''
  }
</div>`
    )
    .join('');
  const asunto = encodeURIComponent('Alta en el directorio — Guía del Corredor');
  const cuerpoMail = encodeURIComponent(
    'Empresa:\nPaís y ciudad:\nTipo (transitario, transportista, despachante…):\nServicios:\nEmail y WhatsApp de contacto:\nWeb:\n'
  );
  const wa = site.contacto.whatsapp
    ? `<a class="boton boton-wa" href="https://wa.me/${esc(site.contacto.whatsapp.replace(/\D/g, ''))}?text=${encodeURIComponent('Hola, quiero dar de alta mi empresa en la Guía del Corredor.')}">Por WhatsApp</a>`
    : '';
  add(
    '/anunciate/',
    layout({
      titulo: 'Aparece en el directorio',
      descripcion: 'Da de alta tu empresa en el directorio del Corredor Bioceánico. Ficha básica gratis.',
      ruta: '/anunciate/',
      cuerpo: `
<h1>Aparece en el directorio</h1>
<p class="entradilla">Quien planifica un viaje por el corredor busca aquí transitarios, transportistas, despachantes y servicios en ruta.</p>
<div class="planes">${planes}</div>
<section class="bloque">
  <h2>Darse de alta</h2>
  <p>Mándanos los datos de tu empresa y la publicamos en menos de 48 horas.</p>
  <div class="acciones">
    ${site.contacto.email ? `<a class="boton" href="mailto:${esc(site.contacto.email)}?subject=${asunto}&body=${cuerpoMail}">Por email</a>` : ''}
    ${wa}
  </div>
</section>`,
    })
  );
}

// Sobre la guía
add(
  '/sobre/',
  layout({
    titulo: 'Sobre la guía',
    ruta: '/sobre/',
    cuerpo: `
<h1>Sobre la guía</h1>
<div class="articulo">
<p>La ${esc(site.nombreCompleto)} reúne en un solo sitio la información práctica para mover mercancía por carretera entre Brasil, Paraguay, Argentina y Chile: rutas, pasos fronterizos, documentos y empresas que dan servicio en el camino.</p>
<h2>Cómo trabajamos la información</h2>
<ul>
<li>Cada página indica sus <strong>fuentes</strong> y la <strong>fecha de la última revisión</strong>.</li>
<li>Usamos fuentes oficiales (ministerios, aduanas, vialidad) y prensa de referencia.</li>
<li>Los requisitos aduaneros los revisa un despachante de aduana antes de publicarse como definitivos.</li>
<li>Si ves un dato desactualizado, escríbenos y lo corregimos.</li>
</ul>
<h2>Qué no somos</h2>
<p>No transportamos mercancía, no intermediamos en contratos ni cobramos comisiones por operación. La contratación es directa entre empresas.</p>
</div>`,
  })
);

// 404
paginas.push({
  ruta: '/404.html',
  html: layout({
    titulo: 'Página no encontrada',
    ruta: '/404.html',
    cuerpo: `<h1>Página no encontrada</h1><p>Vuelve a la <a href="${u('/')}">portada</a> o a la <a href="${u('/guia/')}">guía</a>.</p>`,
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

console.log(`OK: ${paginas.length} páginas en dist/ (${guia.length} de guía, ${empresas.length} empresas).`);
