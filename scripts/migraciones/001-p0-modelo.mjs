// Migración 001 (P0, 14/11/2026). Se ejecutó una vez; se conserva como registro.
// 1. Fuentes como entidad (data/fuentes.json); los registros guardan el id.
// 2. "verificado" (fecha de comprobación hecha por el asistente) pasa a "actualizado".
//    Ningún registro queda "verificado": no hubo verificación humana (verificacion = null).
// 3. Campo "evidencia" según el tipo de fuente.
// 4. Coordenadas con fuente; las que no tienen fuente se retiran.
// 5. Cada archivo lleva "$schema" y "version"; los que eran listas pasan a objeto.
import fs from 'node:fs';
import path from 'node:path';
const D = path.resolve(import.meta.dirname, '../../data');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const escribir = (f, o) => fs.writeFileSync(path.join(D, f), JSON.stringify(o, null, 2) + '\n');
const HOY = '2026-11-14';

const fuentes = new Map(); // url -> {id,...}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
function idFuente(f) {
  if (!f || typeof f !== 'object') return f;
  if (fuentes.has(f.url)) return fuentes.get(f.url).id;
  let id = slug(f.nombre), k = 2;
  const usados = new Set([...fuentes.values()].map((x) => x.id));
  while (usados.has(id)) id = `${slug(f.nombre)}-${k++}`;
  fuentes.set(f.url, { id, nombre: f.nombre, url: f.url, tipo: f.tipo === 'otra' ? 'otra' : f.tipo });
  return id;
}
const evidenciaDe = (f) => (f?.tipo === 'oficial' ? 'oficial' : 'tercero');

function migrar(o) {
  if (Array.isArray(o)) return o.forEach(migrar);
  if (!o || typeof o !== 'object') return;
  if ('validacion' in o) {
    if ('verificado' in o) { o.actualizado = o.verificado; delete o.verificado; }
    if (o.validacion === 'verificado') o.validacion = 'por-verificar';
    o.verificacion = null;
    if (!o.evidencia) o.evidencia = o.fuente ? evidenciaDe(o.fuente) : 'oficial';
  }
  if (o.kmFuente) { o.kmEvidencia = evidenciaDe(o.kmFuente); o.kmFuente = idFuente(o.kmFuente); }
  if (o.kmTipo === 'calculado') o.kmEvidencia = 'calculo';
  if (o.fuente && typeof o.fuente === 'object') o.fuente = idFuente(o.fuente);
  for (const v of Object.values(o)) migrar(v);
}

// Coordenadas: solo con fuente identificable (consulta del 14/11/2026).
const WP = (art) => ({ nombre: `Wikipedia (en): ${art.replace(/_/g, ' ')}`, url: `https://en.wikipedia.org/wiki/${art}`, tipo: 'referencia' });
const COORD = {
  'campo-grande': [-20.48389, -54.615, WP('Campo_Grande'), 'localidad'],
  'porto-murtinho': [-21.69889, -57.88278, WP('Porto_Murtinho'), 'localidad'],
  'carmelo-peralta': [-21.67985, -57.90729, { nombre: 'Geodatos: Carmelo Peralta', url: 'https://www.geodatos.net/en/coordinates/paraguay/carmelo-peralta', tipo: 'referencia' }, 'localidad'],
  'mariscal-estigarribia': [-22.03333, -60.63333, WP('Mariscal_Estigarribia'), 'localidad'],
  'pozo-hondo': [-22.37, -62.52, { nombre: 'Terralocate: Pozo Hondo', url: 'https://terralocate.com/place/py-pozo-hondo', tipo: 'referencia' }, 'localidad'],
  'salta-jujuy': [-24.783, -65.417, WP('Salta'), 'referencia', 'Punto de referencia: ciudad de Salta. El nodo agrupa Salta y Jujuy hasta separarlos (P1.1).'],
  'norte-chile': [-22.917, -68.2, WP('San_Pedro_de_Atacama'), 'referencia', 'Punto de referencia: San Pedro de Atacama. El nodo agrupa San Pedro de Atacama y Calama hasta separarlos (P1.1).'],
  'puertos-chile': [-23.65, -70.4, WP('Antofagasta'), 'referencia', 'Punto de referencia: Antofagasta. El nodo agrupa Antofagasta, Mejillones e Iquique hasta separarlos (P1.1).'],
};
const COORD_PASO = {
  jama: [-23.2375, -67.07639, WP('Paso_de_Jama'), 'paso', 'Límite internacional. El complejo argentino está unos 5 km al este.'],
  sico: [-23.833, -67.25, WP('Sico_Pass'), 'paso', 'Límite internacional.'],
};
const coord = ([lat, lon, f, precision, nota]) => ({ lat, lon, fuente: idFuente(f), evidencia: 'tercero', precision, consultado: HOY, ...(nota ? { nota } : {}) });

const ARCH = {
  'pasos.json': null, 'rutas.json': null, 'incidencias.json': null, 'festivos.json': null,
  'organismos.json': null, 'avisos.json': null, 'novedades.json': 'novedades', 'directorio.json': 'empresas', 'categorias.json': 'categorias',
};
const datos = {};
for (const [f, clave] of Object.entries(ARCH)) {
  let o = leer(f);
  if (clave) o = { [clave]: o };
  datos[f] = o;
}
// Coordenadas antes de migrar (para que las fuentes nuevas entren en el registro).
for (const n of datos['rutas.json'].nodos) {
  n.coordenadas = COORD[n.id] ? coord(COORD[n.id]) : null;
  delete n.lat; delete n.lon;
}
for (const p of datos['pasos.json'].pasos) {
  const u = p.ubicacion;
  delete u.lat; delete u.lon;
  u.coordenadas = COORD_PASO[p.id] ? coord(COORD_PASO[p.id]) : null;
  if (!u.coordenadas) u.coordenadasNota = p.id === 'pozo-hondo' ? 'Sin coordenadas propias del paso; el mapa usa la localidad de Pozo Hondo.' : 'Sin coordenadas con fuente; el mapa dibuja el paso entre sus dos localidades.';
}
for (const o of Object.values(datos)) migrar(o);

const ESQ = { 'pasos.json': 'pasos', 'rutas.json': 'rutas', 'incidencias.json': 'incidencias', 'festivos.json': 'festivos', 'organismos.json': 'organismos', 'avisos.json': 'avisos', 'novedades.json': 'novedades', 'directorio.json': 'empresas', 'categorias.json': 'categorias' };
for (const [f, o] of Object.entries(datos)) {
  delete o.$schema; delete o.version;
  escribir(f, { $schema: `./esquemas/${ESQ[f]}.schema.json`, version: '1.0.0', ...o });
}
escribir('fuentes.json', {
  $schema: './esquemas/fuentes.schema.json',
  version: '1.0.0',
  nota: 'Registro único de fuentes. Los datos citan la fuente por su id. tipo: oficial (organismo público o norma) | prensa | referencia (enciclopedias, gazetteers, cartografía) | empresa (lo declara la propia empresa) | otra.',
  fuentes: [...fuentes.values()].sort((a, b) => a.id.localeCompare(b.id)),
});
console.log(`${fuentes.size} fuentes`);
