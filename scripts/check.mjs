// Revisa los datos y el contenido antes de publicar.
// Errores = no se puede publicar. Avisos = se puede, pero hay que mirarlo.
// Orden: 1) esquemas JSON (estructura), 2) reglas de contenido y referencias, 3) calidad.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, loadGuia, CAMPOS_OBLIGATORIOS, ESTADOS, SECCIONES, PAISES } from './lib.mjs';
import { configEnvio, CAMPOS_SOLICITUD } from './cruces.mjs';
import { erroresRegistro, nivel, tipoEstado, VERIFICADORES } from './validacion.mjs';
import { cargar } from './datos.mjs';
import { validarEsquemas } from './esquemas.mjs';
import { API_VERSIONES } from './api.mjs';

const errores = [];
const avisos = [];
const HOY = new Date().toISOString().slice(0, 10);
const PAISES_IDS = Object.keys(PAISES);
const esFecha = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
const dias = (d) => (Date.parse(HOY) - Date.parse(d)) / 864e5;
const D = cargar();
const C = D.crudos; // datos tal como están en los archivos (fuente = id)
const idsFuente = new Set(D.fuentes.keys());
const registro = (r, donde, opciones) => errores.push(...erroresRegistro(r, donde, { fuentes: idsFuente, ...opciones }));

// 1. Esquemas
{
  const r = validarEsquemas();
  errores.push(...r.errores);
}
const caducado = (r, tipo, donde) => {
  if (nivel(r, tipo, HOY) === 'caducado') avisos.push(`${donde}: la verificación del ${r.verificado} ha caducado; vuelve a comprobarlo.`);
};

const site = readJSON('data/site.json');
const categorias = C.categorias.categorias.map((c) => c.id);
const empresas = C.empresas.empresas;
const rutas = C.rutas;
const guia = loadGuia();
const novedades = C.novedades.novedades;
const idsNodos = new Set(rutas.nodos.map((n) => n.id));
const rutasGuia = new Set(guia.map((p) => `${p.seccion}/${p.slug}`));
const pasosRuta = rutas.tramos.flatMap((t) => [t.paso, t.alternativa].filter(Boolean));
const idsPasoRuta = new Set(pasosRuta.map((p) => p.id));
const idsTramo = new Set(rutas.tramos.map((t) => t.id));

// Configuración
if (/example\.com/.test(site.url)) avisos.push('data/site.json: "url" sigue siendo example.com.');
if (/example\.com/.test(site.contacto.email || '')) errores.push('data/site.json: el email de contacto es de ejemplo.');
if (!site.contacto.email) errores.push('data/site.json: falta el email de contacto del proyecto (canal de solicitudes de empresas).');
else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.contacto.email)) errores.push('data/site.json: email de contacto no válido.');
{
  const e = site.solicitudes?.enlacePrellenado;
  if (!e) avisos.push('data/site.json: solicitudes de empresas por email; falta el formulario de Google ("solicitudes.enlacePrellenado"). Ver docs/como-editar.md.');
  else {
    const r = configEnvio(e, CAMPOS_SOLICITUD);
    if (r?.error) errores.push(`data/site.json: solicitudes.enlacePrellenado: ${r.error}.`);
  }
}
const destacada = site.planes.find((p) => p.id === 'destacada');
if (destacada && !destacada.enlacePago) avisos.push('data/site.json: la ficha destacada no tiene enlace de suscripción de PayPal.');
if (site.indexable === false) avisos.push('data/site.json: "indexable" es false; Google no indexará la web. Ponlo a true el día del lanzamiento.');
{
  const c = site.cruces || {};
  if (!c.enlacePrellenado) avisos.push('data/site.json: tiempos de cruce sin formulario ("cruces.enlacePrellenado"). Ver docs/como-editar.md.');
  else {
    const r = configEnvio(c.enlacePrellenado);
    if (r?.error) errores.push(`data/site.json: cruces.enlacePrellenado: ${r.error}.`);
  }
  if (c.enlacePrellenado && !c.csv) avisos.push('data/site.json: falta "cruces.csv"; los tiempos enviados no se mostrarán.');
}

// Guía (fichas Markdown)
for (const p of guia) {
  for (const c of CAMPOS_OBLIGATORIOS) if (!p.meta[c]) errores.push(`${p.archivo}: falta "${c}" en la cabecera.`);
  if (p.meta.estado) errores.push(`${p.archivo}: el estado no se escribe en la ficha; sale de data/pasos.json o data/rutas.json. Quita "estado".`);
  if (p.meta.borrador) errores.push(`${p.archivo}: usa "validacion: borrador" en lugar de "borrador: true".`);
  if (p.meta.validacion && !['verificado', 'por-verificar', 'borrador'].includes(p.meta.validacion)) errores.push(`${p.archivo}: validacion no válida "${p.meta.validacion}".`);
  if (p.meta.validacion === 'verificado' && (!esFecha(p.meta.verificado) || !VERIFICADORES[p.meta.verificadoPor])) errores.push(`${p.archivo}: marcada como verificada sin "verificado: AAAA-MM-DD" y "verificadoPor: responsable-editorial".`);
  if (p.meta.validacion === 'borrador') avisos.push(`${p.archivo}: texto en borrador (no afecta a los estados operativos, que se confirman con su propia verificación).`);
  if (/^## Estado\b/m.test(p.body)) avisos.push(`${p.archivo}: tiene una sección "## Estado" escrita a mano; el estado ya se genera desde los datos.`);
  if (!SECCIONES[p.seccion]) errores.push(`${p.archivo}: carpeta "${p.seccion}" no reconocida.`);
  if (!/## Fuentes/.test(p.body) && p.seccion !== 'documentos') errores.push(`${p.archivo}: falta la sección "## Fuentes".`);
  for (const pt of p.meta.puntos || []) if (!idsNodos.has(pt)) errores.push(`${p.archivo}: punto desconocido "${pt}".`);
  if (dias(p.meta.revisado) > 90) avisos.push(`${p.archivo}: revisado hace ${Math.round(dias(p.meta.revisado))} días; toca revisarlo.`);
}

// Rutas y tramos
// HU-115: ruta principal (un tramo entre cada par de nodos consecutivos) y ramales al final
// (un tramo con "ramal": true desde un nodo de la ruta principal hasta un nodo propio, que va al final de la lista).
const principales = rutas.tramos.filter((t) => !t.ramal);
const ramales = rutas.tramos.filter((t) => t.ramal);
const nodos = rutas.nodos.slice(0, principales.length + 1).map((n) => n.id);
const nodosRamal = rutas.nodos.slice(principales.length + 1).map((n) => n.id);
if (rutas.tramos.slice(0, principales.length).some((t) => t.ramal)) errores.push('rutas: los tramos de ramal van después de los de la ruta principal.');
if (nodosRamal.length !== ramales.length) errores.push('rutas: cada nodo después de la ruta principal necesita exactamente un tramo de ramal.');
ramales.forEach((t, k) => {
  if (!nodos.includes(t.desde)) errores.push(`rutas: el ramal "${t.id}" debe salir de un nodo de la ruta principal.`);
  if (t.hasta !== nodosRamal[k]) errores.push(`rutas: el ramal "${t.id}" debe ir hasta "${nodosRamal[k]}" (mismo orden que los nodos).`);
  if (t.paso || t.alternativa) errores.push(`rutas: el ramal "${t.id}" no puede tener paso fronterizo.`);
});
const vistos = new Set();
rutas.tramos.forEach((t, i) => {
  const donde = `rutas: tramo "${t.id || i + 1}"`;
  if (!t.id) errores.push(`rutas: el tramo ${i + 1} no tiene "id".`);
  if (vistos.has(t.id)) errores.push(`${donde}: id repetido.`);
  vistos.add(t.id);
  if (!t.ramal && (t.desde !== nodos[i] || t.hasta !== nodos[i + 1])) errores.push(`${donde}: debe ir de "${nodos[i]}" a "${nodos[i + 1]}".`);
  if ('estado' in t) errores.push(`${donde}: el estado va en "reporte" (o en data/pasos.json si es un paso).`);
  if (t.reporte) {
    if (!ESTADOS[t.reporte.valor]) errores.push(`${donde}: reporte.valor no válido "${t.reporte.valor}".`);
    registro(t.reporte, `${donde} (reporte)`);
    caducado(t.reporte, tipoEstado(t.reporte.valor), donde);
  }
  if (typeof t.km === 'number' && !['fuente', 'calculado'].includes(t.kmTipo)) errores.push(`${donde}: con km necesita kmTipo (fuente o calculado).`);
  if (t.kmTipo === 'fuente' && !idsFuente.has(t.kmFuente)) errores.push(`${donde}: kmTipo "fuente" sin kmFuente válida (id de data/fuentes.json).`);
  if (t.kmTipo === 'calculado' && !t.kmNota) errores.push(`${donde}: kmTipo "calculado" sin kmNota que explique el cálculo.`);
  for (const g of [t.guia, t.paso?.guia, t.alternativa?.guia].filter(Boolean)) if (!rutasGuia.has(g)) errores.push(`${donde}: enlaza a "${g}", que no existe en content/guia.`);
  if (!t.paso && !t.reporte) avisos.push(`${donde}: sin estado con fuente; se muestra «Por verificar · Sin datos».`);
  if (typeof t.km !== 'number') avisos.push(`${donde}: sin distancia con fuente; se muestra una estimación provisional.`);
});
for (const p of pasosRuta) if (!p.id) errores.push(`rutas: el paso "${p.nombre}" no tiene "id".`);

// Organismos
const orgs = C.organismos.organismos;
const idsOrg = new Set(orgs.map((o) => o.id));
for (const o of orgs) {
  const donde = `organismos: "${o.id}"`;
  if (!PAISES_IDS.includes(o.pais)) errores.push(`${donde}: país desconocido.`);
  if (!/^https?:\/\//.test(o.url)) errores.push(`${donde}: sin url válida.`);
  registro(o, donde, { exigeFuente: false, permitePublicadoNulo: true });
  caducado(o, 'organismo', donde);
}

// Pasos
const fichas = C.pasos.pasos;
for (const f of fichas) {
  const donde = `pasos: "${f.id}"`;
  if (!idsPasoRuta.has(f.id)) errores.push(`${donde}: no está en data/rutas.json.`);
  if (!f.estado || !ESTADOS[f.estado.valor]) errores.push(`${donde}: sin estado válido.`);
  else {
    registro(f.estado, `${donde} (estado)`);
    caducado(f.estado, tipoEstado(f.estado.valor), `${donde} (estado)`);
    if (f.estado.validacion !== 'verificado') avisos.push(`${donde}: estado sin verificar; se muestra «Por verificar» con el último dato.`);
  }
  for (const k of ['horarios', 'restricciones', 'acceso', 'servicios', 'contactos', 'horariosEspeciales', 'historial', 'controles', 'partes'])
    for (const [i, h] of (f[k] || []).entries()) {
      registro(h, `${donde} ${k}[${i}]`, { permitePublicadoNulo: true });
      if (k === 'horariosEspeciales' && (!esFecha(h.desde) || !esFecha(h.hasta))) errores.push(`${donde} ${k}[${i}]: necesita desde y hasta.`);
      if (k === 'historial' && esFecha(h.fecha) && h.fecha > HOY) errores.push(`${donde} historial[${i}]: fecha futura.`);
      if (k === 'horarios' && h.apertura && h.cierre && h.apertura >= h.cierre) errores.push(`${donde} horarios[${i}]: la apertura debe ser anterior al cierre.`);
      if (h.organismo && k === 'controles' && !idsOrg.has(h.organismo)) errores.push(`${donde} controles[${i}]: organismo desconocido "${h.organismo}".`);
      if (k === 'partes' && h.lado && !(h.lado in (f.lados || {}))) errores.push(`${donde} partes[${i}]: el lado ${h.lado} no es de este paso.`);
      if (k === 'partes' && h.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.hora)) errores.push(`${donde} partes[${i}]: hora no válida (HH:MM).`);
      if (k === 'partes' && h.organismo && !idsOrg.has(h.organismo)) errores.push(`${donde} partes[${i}]: organismo desconocido "${h.organismo}".`);
      if (k === 'contactos' && h.telefono && !/^\+[1-9]\d{7,14}$/.test(h.telefono)) errores.push(`${donde} contactos[${i}]: teléfono no internacional.`);
    }
  const ordenes = (f.controles || []).map((c) => c.orden);
  if (new Set(ordenes).size !== ordenes.length) errores.push(`${donde}: controles con orden repetido.`);
  for (const o of f.organismos || []) if (!idsOrg.has(o)) errores.push(`${donde}: cita el organismo desconocido "${o}".`);
  coordenadas(f.ubicacion?.coordenadas, donde, f.ubicacion?.coordenadasNota);
}
for (const id of idsPasoRuta) if (!fichas.some((f) => f.id === id)) errores.push(`pasos: "${id}" no tiene ficha en data/pasos.json.`);

// Incidencias
for (const i of C.incidencias.incidencias) {
  const donde = `incidencias: "${i.id}"`;
  for (const c of ['id', 'ubicacion', 'tramo', 'tipo', 'estado', 'descripcion']) if (!i[c]) errores.push(`${donde}: sin "${c}".`);
  registro(i, donde, { permitePublicadoNulo: true });
  if (!i.tramos?.length && !i.paso) errores.push(`${donde}: necesita "tramos" o "paso" para aparecer en fichas y planificador.`);
  for (const t of i.tramos || []) if (!idsTramo.has(t)) errores.push(`${donde}: tramo desconocido "${t}".`);
  if (i.paso && !idsPasoRuta.has(i.paso)) errores.push(`${donde}: paso desconocido "${i.paso}".`);
  if (i.estado === 'activa') caducado(i, 'incidencia', donde);
  if (i.estado === 'activa' && i.publicado && dias(i.publicado) > 60 && i.validacion !== 'verificado') avisos.push(`${donde}: activa, publicada hace más de 60 días y sin verificar; ¿sigue vigente?`);
  const fin = i.vigencia?.hasta || i.fin;
  if (i.estado === 'activa' && esFecha(fin) && fin < HOY) errores.push(`${donde}: sigue "activa" pero su vigencia acabó el ${fin}. Márcala como resuelta o actualiza la fecha.`);
  if (i.estado === 'resuelta' && i.evidencia !== 'historico') avisos.push(`${donde}: resuelta; su evidencia debería ser "historico".`);
  if (esFecha(i.inicio) && esFecha(fin) && fin < i.inicio) errores.push(`${donde}: termina antes de empezar.`);
}

// Novedades
for (const [k, n] of novedades.entries()) {
  const donde = `novedades[${k}]`;
  for (const c of ['publicado', 'tema', 'titulo']) if (!n[c]) errores.push(`${donde}: falta "${c}".`);
  registro(n, donde);
  if (n.estado) errores.push(`${donde}: las novedades no llevan estado; el estado está en data/pasos.json y data/rutas.json.`);
  if (!n.paises?.length) avisos.push(`${donde}: sin "paises"; no aparecerá al filtrar por país.`);
  if (n.guia && !rutasGuia.has(n.guia)) errores.push(`${donde}: enlaza a "${n.guia}", que no existe en content/guia.`);
}
const ultima = novedades.map((n) => n.publicado).sort().pop();
if (ultima && dias(ultima) > 30) avisos.push(`novedades: la última es del ${ultima}; la portada parecerá parada.`);

// Festivos
const fest = C.festivos;
for (const f of fest.festivos) {
  const donde = `festivos: "${f.nombre}" (${f.pais} ${f.fecha})`;
  if (!esFecha(f.fecha) || !PAISES_IDS.includes(f.pais) || !f.nombre) errores.push(`${donde}: registro incompleto.`);
  if (!['feriado', 'no-laborable', 'facultativo'].includes(f.tipo)) errores.push(`${donde}: tipo no válido "${f.tipo}".`);
  registro(f, donde, { permitePublicadoNulo: true });
}
const quedan = fest.festivos.filter((f) => f.fecha >= HOY);
if (!quedan.length) errores.push('festivos: no queda ningún festivo futuro; añade el año siguiente.');
else if ((Date.parse(fest.hasta) - Date.parse(HOY)) / 864e5 < 60) avisos.push(`festivos: el calendario acaba el ${fest.hasta}; añade el año siguiente.`);

// Avisos meteorológicos
for (const a of C.avisos.avisos) {
  if (!a.titulo || !a.zona || !esFecha(a.vigenteHasta)) errores.push(`avisos: "${a.titulo || '?'}" necesita titulo, zona y vigenteHasta.`);
  registro(a, `avisos: "${a.titulo || '?'}"`);
}

// Directorio
const ids = new Set();
for (const e of empresas) {
  const donde = `directorio: "${e.id}"`;
  if (ids.has(e.id)) errores.push(`${donde}: id repetido.`);
  ids.add(e.id);
  if (e.ejemplo) errores.push(`${donde}: es una ficha de ejemplo; no se publican empresas ficticias.`);
  if (!categorias.includes(e.categoria)) errores.push(`${donde}: categoría desconocida "${e.categoria}".`);
  for (const c of ['nombre', 'pais', 'ciudad']) if (!e[c]) errores.push(`${donde}: sin "${c}".`);
  registro(e, donde, { permitePublicadoNulo: true });
  if (e.validacion !== 'verificado') errores.push(`${donde}: solo se publican empresas revisadas por el responsable editorial (validacion: verificado con "verificacion").`);
  caducado(e, 'empresa', donde);
  for (const pt of e.puntos || []) if (!idsNodos.has(pt)) errores.push(`${donde}: punto desconocido "${pt}".`);
}
if (!empresas.length) avisos.push('directorio: vacío; la página de servicios muestra el aviso de alta.');

// Versiones de la API: avisar antes de retirar una versión obsoleta.
for (const [id, v] of Object.entries(API_VERSIONES)) {
  if (v.estado === 'obsoleta' && !v.retiradaPrevista) errores.push(`api ${id}: obsoleta sin "retiradaPrevista".`);
  if (v.retiradaPrevista && v.retiradaPrevista <= HOY) errores.push(`api ${id}: su retirada estaba prevista el ${v.retiradaPrevista}; quítala del registro (scripts/api.mjs).`);
  else if (v.retiradaPrevista && dias(v.retiradaPrevista) > -30) avisos.push(`api ${id}: se retira el ${v.retiradaPrevista}; avisa a los consumidores.`);
}

// 3. Calidad
// Duplicados de empresas por nombre normalizado y por teléfono.
const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(s\.?a\.?|s\.?r\.?l\.?|ltda|eireli|spa|e\.?i\.?r\.?l\.?)\b/g, '').replace(/[^a-z0-9]/g, '');
const dupl = (clave, etiqueta) => {
  const m = new Map();
  for (const e of empresas) for (const k of [clave(e)].flat().filter(Boolean)) m.set(k, [...(m.get(k) || []), e.id]);
  for (const [k, v] of m) if (v.length > 1) errores.push(`directorio: ${etiqueta} repetido (${k}) en ${v.join(', ')}.`);
};
dupl((e) => norm(e.nombre), 'nombre');
dupl((e) => [e.contacto?.telefono, e.contacto?.whatsapp].map((t) => t?.replace(/\D/g, '')), 'teléfono');
// Teléfonos en formato internacional (E.164, sin espacios).
const E164 = /^\+[1-9]\d{7,14}$/;
for (const e of empresas) for (const k of ['telefono', 'whatsapp']) if (e.contacto?.[k] && !E164.test(e.contacto[k])) errores.push(`directorio: "${e.id}" ${k} no está en formato internacional (+código y número, sin espacios).`);
if (site.contacto.whatsapp && !E164.test(site.contacto.whatsapp.replace(/[\s-]/g, ''))) errores.push('data/site.json: el WhatsApp de contacto no está en formato internacional.');
// Fuentes: ids únicos, URL repetida, fuentes sin uso.
{
  const usadas = new Set(JSON.stringify(C).match(/"(?:fuente|kmFuente)":"([a-z0-9-]+)"/g)?.map((x) => x.split('"')[3]));
  JSON.stringify(C, (k, v) => (k === 'otrasFuentes' && Array.isArray(v) && v.forEach((id) => usadas.add(id)), v));
  const urls = new Map();
  for (const f of C.fuentes.fuentes) {
    if (urls.has(f.url)) errores.push(`fuentes: "${f.id}" y "${urls.get(f.url)}" tienen la misma url.`);
    urls.set(f.url, f.id);
    if (!usadas.has(f.id)) avisos.push(`fuentes: "${f.id}" no la usa ningún dato.`);
  }
  if (urls.size !== new Set(C.fuentes.fuentes.map((f) => f.id)).size) errores.push('fuentes: hay ids repetidos.');
}
// Nodos: coordenadas con fuente dentro del ámbito del corredor (también lo exige el esquema).
for (const n of rutas.nodos) coordenadas(n.coordenadas, `rutas: nodo "${n.id}"`);
// Fechas futuras: nada se publica ni se verifica en el futuro.
JSON.stringify(C, (k, v) => {
  // Un día de margen: el servidor va en UTC y el equipo trabaja en España y Sudamérica.
  if (['publicado', 'actualizado'].includes(k) && esFecha(v) && dias(v) < -1) errores.push(`fecha futura en "${k}": ${v}.`);
  return v;
});
// Ninguna verificación la puede firmar el asistente. HU-130: el vigilante solo firma lo leído de una
// web oficial, en el estado y los partes de un paso y en las incidencias de carreteras (fase 2).
if (/"verificadoPor":"(?!responsable-editorial"|vigilante")/.test(JSON.stringify(C))) errores.push('verificacion: solo se admite verificadoPor "responsable-editorial" o "vigilante".');
{
  const tipoFuente = Object.fromEntries(C.fuentes.fuentes.map((f) => [f.id, f.tipo]));
  const permitidos = new Set();
  for (const p of C.pasos.pasos) for (const r of [p.estado, ...(p.partes || []), ...(p.historial || [])]) if (r) permitidos.add(r);
  for (const i of C.incidencias.incidencias) permitidos.add(i); // HU-130 fase 2: carreteras
  const recorrer = (o, ruta) => {
    if (Array.isArray(o)) return o.forEach((x, i) => recorrer(x, `${ruta}[${i}]`));
    if (!o || typeof o !== 'object') return;
    if (o.verificacion?.verificadoPor === 'vigilante') {
      if (!permitidos.has(o)) errores.push(`${ruta}: el vigilante solo puede firmar estados y partes de pasos, e incidencias.`);
      else if (tipoFuente[o.fuente] !== 'oficial' || o.evidencia !== 'oficial') errores.push(`${ruta}: el vigilante solo firma lo leído de una fuente oficial.`);
    }
    for (const [k, v] of Object.entries(o)) if (k !== 'verificacion') recorrer(v, `${ruta}.${k}`);
  };
  recorrer(C, 'datos');
}

function coordenadas(c, donde, nota) {
  if (!c) {
    if (!nota) avisos.push(`${donde}: sin coordenadas con fuente.`);
    return;
  }
  if (!idsFuente.has(c.fuente)) errores.push(`${donde}: coordenadas sin fuente válida.`);
  if (c.lat < -35 || c.lat > -15 || c.lon < -75 || c.lon > -45) errores.push(`${donde}: coordenadas fuera del ámbito del corredor (${c.lat}, ${c.lon}).`);
}

// HU-136: el CSV de fuentes del vigilante (columnas cerradas y referencias que existan).
{
  const { cargar: cargarCSV, validar: validarCSV } = await import('./fuentes-vigilancia.mjs');
  const fts = readJSON('data/fuentes.json');
  const rts = readJSON('data/rutas.json');
  const pss = readJSON('data/pasos.json');
  errores.push(
    ...validarCSV(cargarCSV(), {
      fuentes: new Map((fts.fuentes || fts).map((f) => [f.id, f])),
      pasos: new Set((pss.pasos || pss).map((p) => p.id)),
      tramos: new Set(rts.tramos.map((t) => t.id)),
    })
  );
}

// HU-135: cada frase del diccionario portugués tiene su traducción (texto no vacío).
{
  const dic = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'pt-BR.json'), 'utf8'));
  for (const [es, pt] of Object.entries(dic.frases || {})) if (typeof pt !== 'string' || !pt.trim()) errores.push(`src/i18n/pt-BR.json: «${es}» no tiene traducción.`);
}

for (const a of avisos) console.log(`AVISO  ${a}`);
for (const e of errores) console.log(`ERROR  ${e}`);
console.log(`\n${errores.length} errores, ${avisos.length} avisos.`);
process.exit(errores.length ? 1 : 0);
