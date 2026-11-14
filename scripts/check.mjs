// Revisa los datos y el contenido antes de publicar.
// Errores = no se puede publicar. Avisos = se puede, pero hay que mirarlo.
import { readJSON, loadGuia, CAMPOS_OBLIGATORIOS, ESTADOS, SECCIONES } from './lib.mjs';

const errores = [];
const avisos = [];

const site = readJSON('data/site.json');
const categorias = readJSON('data/categorias.json').map((c) => c.id);
const empresas = readJSON('data/directorio.json');
const rutas = readJSON('data/rutas.json');
const guia = loadGuia();
const rutasGuia = new Set(guia.map((p) => `${p.seccion}/${p.slug}`));

// Configuración
if (/example\.com/.test(site.url)) avisos.push('data/site.json: "url" sigue siendo example.com.');
if (/example\.com/.test(site.contacto.email)) avisos.push('data/site.json: el email de contacto es de ejemplo.');
if (!site.contacto.whatsapp) avisos.push('data/site.json: falta el WhatsApp de contacto.');
const destacada = site.planes.find((p) => p.id === 'destacada');
if (destacada && !destacada.enlacePago) avisos.push('data/site.json: la ficha destacada no tiene enlace de pago.');

// Guía
for (const p of guia) {
  for (const c of CAMPOS_OBLIGATORIOS) if (!p.meta[c]) errores.push(`${p.archivo}: falta "${c}" en la cabecera.`);
  if (p.meta.estado && !ESTADOS[p.meta.estado]) errores.push(`${p.archivo}: estado "${p.meta.estado}" no válido (${Object.keys(ESTADOS).join(', ')}).`);
  if (!SECCIONES[p.seccion]) errores.push(`${p.archivo}: carpeta "${p.seccion}" no reconocida.`);
  if (!/## Fuentes/.test(p.body) && p.seccion !== 'documentos') errores.push(`${p.archivo}: falta la sección "## Fuentes".`);
  if (p.meta.borrador) avisos.push(`${p.archivo}: sigue marcado como borrador.`);
  const dias = (Date.now() - new Date(p.meta.revisado)) / 86400000;
  if (dias > 90) avisos.push(`${p.archivo}: revisado hace ${Math.round(dias)} días; toca revisarlo.`);
}

// Directorio
const ids = new Set();
for (const e of empresas) {
  if (ids.has(e.id)) errores.push(`directorio: id repetido "${e.id}".`);
  ids.add(e.id);
  if (!categorias.includes(e.categoria)) errores.push(`directorio: "${e.id}" tiene categoría desconocida "${e.categoria}".`);
  for (const c of ['nombre', 'pais', 'ciudad']) if (!e[c]) errores.push(`directorio: "${e.id}" sin "${c}".`);
  if (e.ejemplo) avisos.push(`directorio: "${e.id}" es una ficha de ejemplo; bórrala o pon "mostrarEjemplos": false antes de publicar.`);
}

// Rutas
const nodos = rutas.nodos.map((n) => n.id);
if (rutas.tramos.length !== nodos.length - 1) errores.push('rutas: debe haber exactamente un tramo entre cada par de nodos consecutivos.');
rutas.tramos.forEach((t, i) => {
  if (t.desde !== nodos[i] || t.hasta !== nodos[i + 1]) errores.push(`rutas: el tramo ${i + 1} debe ir de "${nodos[i]}" a "${nodos[i + 1]}".`);
  if (!ESTADOS[t.estado]) errores.push(`rutas: tramo ${i + 1} con estado no válido "${t.estado}".`);
  for (const g of [t.guia, t.paso?.guia, t.alternativa?.guia].filter(Boolean))
    if (!rutasGuia.has(g)) errores.push(`rutas: tramo ${i + 1} enlaza a "${g}", que no existe en content/guia.`);
});

for (const a of avisos) console.log(`AVISO  ${a}`);
for (const e of errores) console.log(`ERROR  ${e}`);
console.log(`\n${errores.length} errores, ${avisos.length} avisos.`);
process.exit(errores.length ? 1 : 0);
