// Carga única de los datos de data/. La usan build, check, informe y la exportación api/v1.
// Resuelve las fuentes (id → { id, nombre, url, tipo }) y expone en memoria:
//   r.verificado = fecha de verificación humana válida (o null). Nunca se guarda en los archivos.
//   nodo.lat / nodo.lon y paso.ubicacion.lat / lon desde "coordenadas" (o null).
import { readJSON } from './lib.mjs';
import { fechaVerificacion } from './validacion.mjs';

export const ARCHIVOS = {
  fuentes: ['fuentes.json', 'fuentes'],
  pasos: ['pasos.json', 'pasos'],
  rutas: ['rutas.json', null],
  incidencias: ['incidencias.json', 'incidencias'],
  festivos: ['festivos.json', null],
  organismos: ['organismos.json', 'organismos'],
  avisos: ['avisos.json', 'avisos'],
  novedades: ['novedades.json', 'novedades'],
  empresas: ['directorio.json', 'empresas'],
  categorias: ['categorias.json', 'categorias'],
};

/** Archivos tal como están en disco (sin resolver). */
export function crudos() {
  return Object.fromEntries(Object.entries(ARCHIVOS).map(([k, [f]]) => [k, readJSON(`data/${f}`)]));
}

export function cargar() {
  const c = crudos();
  const fuentes = new Map(c.fuentes.fuentes.map((f) => [f.id, f]));
  const resolver = (o) => {
    if (Array.isArray(o)) return o.forEach(resolver);
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.otrasFuentes)) o.otrasFuentes = o.otrasFuentes.map((id) => (typeof id === 'string' ? fuentes.get(id) || { id, nombre: id, url: '', tipo: 'otra' } : id));
    for (const k of ['fuente', 'kmFuente']) if (typeof o[k] === 'string') o[k] = fuentes.get(o[k]) || { id: o[k], nombre: o[k], url: '', tipo: 'otra' };
    if ('validacion' in o) o.verificado = fechaVerificacion(o);
    if ('coordenadas' in o) {
      o.lat = o.coordenadas?.lat ?? null;
      o.lon = o.coordenadas?.lon ?? null;
    }
    for (const v of Object.values(o)) resolver(v);
  };
  const d = JSON.parse(JSON.stringify(c));
  resolver(d);
  return {
    crudos: c,
    fuentes,
    pasos: d.pasos.pasos,
    rutas: d.rutas,
    incidencias: d.incidencias.incidencias,
    festivos: d.festivos,
    organismos: d.organismos.organismos,
    avisos: d.avisos.avisos,
    novedades: d.novedades.novedades,
    empresas: d.empresas.empresas,
    categorias: d.categorias.categorias,
    versiones: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.version])),
  };
}
