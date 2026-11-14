// Revisa los datos y el contenido antes de publicar.
// Errores = no se puede publicar. Avisos = se puede, pero hay que mirarlo.
import { readJSON, loadGuia, CAMPOS_OBLIGATORIOS, ESTADOS, SECCIONES, PAISES } from './lib.mjs';
const PAISES_IDS = Object.keys(PAISES);
import { configEnvio } from './cruces.mjs';

const errores = [];
const avisos = [];

const site = readJSON('data/site.json');
const categorias = readJSON('data/categorias.json').map((c) => c.id);
const empresas = readJSON('data/directorio.json');
const rutas = readJSON('data/rutas.json');
const guia = loadGuia();
const novedades = readJSON('data/novedades.json');
const idsNodos = new Set(rutas.nodos.map((n) => n.id));
const rutasGuia = new Set(guia.map((p) => `${p.seccion}/${p.slug}`));

// Configuración
if (/example\.com/.test(site.url)) avisos.push('data/site.json: "url" sigue siendo example.com.');
if (/example\.com/.test(site.contacto.email)) avisos.push('data/site.json: el email de contacto es de ejemplo.');
if (!site.contacto.whatsapp) avisos.push('data/site.json: falta el WhatsApp de contacto.');
const destacada = site.planes.find((p) => p.id === 'destacada');
if (destacada && !destacada.enlacePago) avisos.push('data/site.json: la ficha destacada no tiene enlace de suscripción de PayPal.');

// Tiempos de cruce
{
  const c = site.cruces || {};
  if (!c.enlacePrellenado) avisos.push('data/site.json: tiempos de cruce sin formulario ("cruces.enlacePrellenado"); nadie puede contar su tiempo. Ver docs/como-editar.md.');
  else {
    const r = configEnvio(c.enlacePrellenado);
    if (r?.error) errores.push(`data/site.json: cruces.enlacePrellenado: ${r.error}.`);
  }
  if (c.enlacePrellenado && !c.csv) avisos.push('data/site.json: falta "cruces.csv"; los tiempos enviados no se mostrarán.');
  if (c.csv && !/output=csv/.test(c.csv)) avisos.push('data/site.json: "cruces.csv" no parece un enlace publicado como CSV (…output=csv).');
}
const idsPaso = rutas.tramos.flatMap((t) => [t.paso, t.alternativa].filter(Boolean));
for (const p of idsPaso) if (!p.id) errores.push(`data/rutas.json: el paso "${p.nombre}" no tiene "id".`);

if (site.indexable === false) avisos.push('data/site.json: "indexable" es false; Google no indexará la web. Ponlo a true el día del lanzamiento.');

// Guía
const guiasDePaso = new Set(idsPaso.map((p) => p.guia).filter(Boolean));
for (const p of guia) {
  const esPaso = guiasDePaso.has(`${p.seccion}/${p.slug}`);
  for (const c of CAMPOS_OBLIGATORIOS) if (!p.meta[c] && !(esPaso && c === 'estado')) errores.push(`${p.archivo}: falta "${c}" en la cabecera.`);
  if (esPaso && p.meta.estado) avisos.push(`${p.archivo}: el estado de los pasos se edita en data/pasos.json; quita "estado" de la cabecera.`);
  if (p.meta.estado && !ESTADOS[p.meta.estado]) errores.push(`${p.archivo}: estado "${p.meta.estado}" no válido (${Object.keys(ESTADOS).join(', ')}).`);
  if (!SECCIONES[p.seccion]) errores.push(`${p.archivo}: carpeta "${p.seccion}" no reconocida.`);
  if (!/## Fuentes/.test(p.body) && p.seccion !== 'documentos') errores.push(`${p.archivo}: falta la sección "## Fuentes".`);
  for (const pt of p.meta.puntos || []) if (!idsNodos.has(pt)) errores.push(`${p.archivo}: punto desconocido "${pt}".`);
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
  if (!e.puntos?.length) avisos.push(`directorio: "${e.id}" no tiene puntos de la ruta; no aparecerá en el planificador ni en la guía.`);
  for (const pt of e.puntos || []) if (!idsNodos.has(pt)) errores.push(`directorio: "${e.id}" tiene un punto desconocido "${pt}".`);
  if (e.ejemplo) avisos.push(`directorio: "${e.id}" es una ficha de ejemplo; bórrala o pon "mostrarEjemplos": false antes de publicar.`);
}

// Novedades
for (const [i, n] of novedades.entries()) {
  for (const c of ['fecha', 'tema', 'titulo']) if (!n[c]) errores.push(`novedades[${i}]: falta "${c}".`);
  if (!n.paises?.length) avisos.push(`novedades[${i}]: sin "paises"; no aparecerá al filtrar por país.`);
  if (!n.fuente?.url || !n.fuente?.nombre) errores.push(`novedades[${i}]: toda novedad necesita fuente (nombre y url).`);
  if (n.estado && !ESTADOS[n.estado]) errores.push(`novedades[${i}]: estado no válido "${n.estado}".`);
  if (n.guia && !rutasGuia.has(n.guia)) errores.push(`novedades[${i}]: enlaza a "${n.guia}", que no existe en content/guia.`);
}
const ultima = novedades.map((n) => n.fecha).sort().pop();
if (ultima && (Date.now() - new Date(ultima)) / 86400000 > 30) avisos.push(`novedades: la última es del ${ultima}; la portada parecerá parada. Añade cambios recientes.`);

// Rutas
const nodos = rutas.nodos.map((n) => n.id);
if (rutas.tramos.length !== nodos.length - 1) errores.push('rutas: debe haber exactamente un tramo entre cada par de nodos consecutivos.');
rutas.tramos.forEach((t, i) => {
  if (t.desde !== nodos[i] || t.hasta !== nodos[i + 1]) errores.push(`rutas: el tramo ${i + 1} debe ir de "${nodos[i]}" a "${nodos[i + 1]}".`);
  if (!ESTADOS[t.estado]) errores.push(`rutas: tramo ${i + 1} con estado no válido "${t.estado}".`);
  for (const g of [t.guia, t.paso?.guia, t.alternativa?.guia].filter(Boolean))
    if (!rutasGuia.has(g)) errores.push(`rutas: tramo ${i + 1} enlaza a "${g}", que no existe en content/guia.`);
});

// Datos operativos
const HOY = new Date().toISOString().slice(0, 10);
const esFecha = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
const conFuente = (f) => f && f.nombre && /^https?:\/\//.test(f.url || '');
const orgs = readJSON('data/organismos.json').organismos;
const idsOrg = new Set(orgs.map((o) => o.id));
for (const o of orgs) {
  if (!PAISES_IDS.includes(o.pais)) errores.push(`organismos: "${o.id}" con país desconocido.`);
  if (!/^https?:\/\//.test(o.url)) errores.push(`organismos: "${o.id}" sin url válida.`);
  if (!esFecha(o.verificado)) errores.push(`organismos: "${o.id}" sin fecha "verificado".`);
  else if ((Date.parse(HOY) - Date.parse(o.verificado)) / 864e5 > 365) avisos.push(`organismos: el enlace de "${o.id}" se verificó hace más de un año.`);
}
const fichas = readJSON('data/pasos.json').pasos;
const idsRuta = new Set(idsPaso.map((p) => p.id));
for (const f of fichas) {
  if (!idsRuta.has(f.id)) errores.push(`pasos: "${f.id}" no está en data/rutas.json.`);
  if (!f.estado || !ESTADOS[f.estado.valor]) errores.push(`pasos: "${f.id}" sin estado válido.`);
  else {
    if (!conFuente(f.estado.fuente) || !esFecha(f.estado.fecha)) errores.push(`pasos: el estado de "${f.id}" necesita fuente (nombre y url) y fecha.`);
    const dias = (Date.parse(HOY) - Date.parse(f.estado.fecha)) / 864e5;
    if (['operativo', 'restricciones', 'intermitente'].includes(f.estado.valor) && dias > 30) avisos.push(`pasos: el estado de "${f.id}" tiene ${Math.round(dias)} días; la web lo muestra como "Por verificar".`);
  }
  for (const h of [...(f.horarios || []), ...(f.restricciones || []), ...(f.acceso || [])]) if (!conFuente(h.fuente)) errores.push(`pasos: "${f.id}" tiene un dato sin fuente: "${h.texto}".`);
  for (const o of f.organismos || []) if (!idsOrg.has(o)) errores.push(`pasos: "${f.id}" cita el organismo desconocido "${o}".`);
  if (typeof f.ubicacion?.lat !== 'number' || typeof f.ubicacion?.lon !== 'number') errores.push(`pasos: "${f.id}" sin coordenadas.`);
}
for (const id of idsRuta) if (!fichas.some((f) => f.id === id)) avisos.push(`pasos: "${id}" no tiene ficha en data/pasos.json.`);
const fest = readJSON('data/festivos.json');
for (const f of fest.festivos) {
  if (!esFecha(f.fecha) || !PAISES_IDS.includes(f.pais) || !f.nombre) errores.push(`festivos: registro incompleto (${f.fecha} ${f.pais} ${f.nombre}).`);
  if (!conFuente(f.fuente)) errores.push(`festivos: "${f.nombre}" (${f.fecha}) sin fuente.`);
  if (!['feriado', 'no-laborable', 'facultativo'].includes(f.tipo)) errores.push(`festivos: tipo no válido "${f.tipo}".`);
  if (!['confirmado', 'por-confirmar'].includes(f.estado)) errores.push(`festivos: estado no válido "${f.estado}".`);
}
const quedan = fest.festivos.filter((f) => f.fecha >= HOY);
if (!quedan.length) errores.push('festivos: no queda ningún festivo futuro; añade el año siguiente.');
else if ((Date.parse(fest.hasta) - Date.parse(HOY)) / 864e5 < 60) avisos.push(`festivos: el calendario acaba el ${fest.hasta}; añade el año siguiente.`);
for (const i of readJSON('data/incidencias.json').incidencias) {
  for (const c of ['id', 'ubicacion', 'tramo', 'tipo', 'estado', 'descripcion', 'actualizado']) if (!i[c]) errores.push(`incidencias: "${i.id}" sin "${c}".`);
  if (!conFuente(i.fuente)) errores.push(`incidencias: "${i.id}" sin fuente.`);
  if (i.paso && !idsRuta.has(i.paso)) errores.push(`incidencias: "${i.id}" cita un paso desconocido "${i.paso}".`);
  if (i.estado === 'activa' && (Date.parse(HOY) - Date.parse(i.actualizado)) / 864e5 > 60) avisos.push(`incidencias: "${i.id}" lleva más de 60 días sin revisar.`);
}
for (const a of readJSON('data/avisos.json').avisos) {
  if (!a.titulo || !a.zona || !esFecha(a.vigenteHasta) || !conFuente(a.fuente)) errores.push(`avisos: "${a.titulo || '?'}" necesita titulo, zona, vigenteHasta y fuente.`);
}

for (const a of avisos) console.log(`AVISO  ${a}`);
for (const e of errores) console.log(`ERROR  ${e}`);
console.log(`\n${errores.length} errores, ${avisos.length} avisos.`);
process.exit(errores.length ? 1 : 0);

