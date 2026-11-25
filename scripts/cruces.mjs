// Tiempos de cruce reportados por quienes cruzan.
// Los reportes llegan a un formulario de Google; su hoja se publica como CSV y aquí se agregan.
// Configuración en data/site.json → "cruces": { "enlacePrellenado": "...", "csv": "..." }.
// Para probar en local sin internet: CRUCES_CSV_FILE=ruta/al/archivo.csv
import fs from 'node:fs';

export const TRAMOS_TIEMPO = [
  { id: '0-1', nombre: 'Menos de 1 h', corto: '<1 h' },
  { id: '1-2', nombre: '1–2 h', corto: '1–2 h' },
  { id: '2-4', nombre: '2–4 h', corto: '2–4 h' },
  { id: '4-8', nombre: '4–8 h', corto: '4–8 h' },
  { id: '8+', nombre: 'Más de 8 h', corto: '>8 h' },
];
// Claves fijas del formulario y de los datos: «chile» = hacia el Pacífico (oeste), «brasil» = hacia el Atlántico (este).
// El texto que se ve depende de los dos países de cada paso (sentidosPaso): en Jama, «Hacia Argentina», nunca «Hacia Brasil».
export const SENTIDOS = { chile: 'Hacia Chile', brasil: 'Hacia Brasil' };
export const ORDEN_CORREDOR = ['CL', 'AR', 'PY', 'BR']; // de oeste a este
const NOMBRE_PAIS = { CL: 'Chile', AR: 'Argentina', PY: 'Paraguay', BR: 'Brasil' };
/** Textos de los dos sentidos de un paso, a partir de sus lados: { chile: 'Hacia <país oeste>', brasil: 'Hacia <país este>' }. */
export function sentidosPaso(lados) {
  const ps = Object.keys(lados || {}).filter((k) => ORDEN_CORREDOR.includes(k)).sort((a, b) => ORDEN_CORREDOR.indexOf(a) - ORDEN_CORREDOR.indexOf(b));
  if (ps.length !== 2) return SENTIDOS;
  return { chile: `Hacia ${NOMBRE_PAIS[ps[0]]}`, brasil: `Hacia ${NOMBRE_PAIS[ps[1]]}` };
}
export const DIAS = 7; // ventana de reportes
export const MINIMO = 3; // reportes necesarios para dar un tiempo

const CAMPOS_CRUCE = ['paso', 'sentido', 'tiempo', 'fecha', 'dispositivo'];
/** Claves del formulario de solicitudes de empresas (docs/como-editar.md#formulario-de-google-de-solicitudes). */
// Claves del formulario de cotización (decisión 37): las 9 de V2 y las 13 del formulario en 3 pasos.
export const CAMPOS_COTIZACION = ['tipo', 'desde', 'hasta', 'carga', 'peso', 'fecha', 'empresa', 'telefono', 'email', 'id', 'servicio', 'origen_pais', 'destino_pais', 'paso', 'cuando', 'mercancia', 'viajes', 'equipo', 'especial', 'nombre', 'perfil', 'compartir'];
export const CAMPOS_SOLICITUD = ['tipo', 'nombre', 'razonsocial', 'pais', 'localidad', 'categoria', 'servicios', 'puntos', 'cobertura', 'persona', 'email', 'telefono', 'web', 'referencias', 'cambio'];

/**
 * Lee un enlace prellenado de Google Forms y devuelve dónde enviar.
 * Cada pregunta se rellena con su clave (por defecto: paso, sentido, tiempo, fecha, dispositivo).
 */
export function configEnvio(enlace, CAMPOS = CAMPOS_CRUCE) {
  if (!enlace) return null;
  let url;
  try {
    url = new URL(enlace);
  } catch {
    return { error: 'el enlace prellenado no es una URL válida' };
  }
  const campos = {};
  for (const [k, v] of url.searchParams) {
    const c = v.trim().toLowerCase();
    if (k.startsWith('entry.') && CAMPOS.includes(c)) campos[c] = k;
  }
  const faltan = CAMPOS.filter((c) => !campos[c]);
  if (faltan.length) return { error: `al enlace prellenado le faltan: ${faltan.join(', ')}` };
  if (!/\/viewform/.test(url.pathname)) return { error: 'el enlace prellenado debe ser de un formulario (…/viewform)' };
  return { accion: `${url.origin}${url.pathname.replace(/\/viewform.*$/, '/formResponse')}`, campos };
}

function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') (campo += '"'), i++;
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') fila.push(campo), (campo = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo), filas.push(fila), (fila = []), (campo = '');
    } else campo += c;
  }
  if (campo || fila.length) fila.push(campo), filas.push(fila);
  return filas.filter((f) => f.some((x) => x.trim()));
}

async function leerCSV(cfg) {
  if (process.env.CRUCES_CSV_FILE) return fs.readFileSync(process.env.CRUCES_CSV_FILE, 'utf8');
  if (!cfg?.csv) return null;
  const r = await fetch(cfg.csv, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/**
 * Agrega los reportes de los últimos DIAS días por paso y sentido.
 * Devuelve { porPaso, avisos, actualizado }. Nunca rompe la publicación: si falla la lectura, avisa y sigue sin datos.
 */
export async function cargarCruces(cfg, idsPasos, hoy = new Date()) {
  const avisos = [];
  const porPaso = {};
  let texto = null;
  try {
    texto = await leerCSV(cfg);
  } catch (e) {
    avisos.push(`No se pudieron leer los tiempos de cruce (${e.message}). Se publica sin ellos.`);
  }
  if (!texto) return { porPaso, avisos, actualizado: hoy.toISOString() };

  const [cabecera, ...filas] = parseCSV(texto);
  const col = Object.fromEntries(CAMPOS.map((c) => [c, cabecera.findIndex((h) => h.trim().toLowerCase() === c)]));
  const faltan = CAMPOS.filter((c) => col[c] < 0);
  if (faltan.length) {
    avisos.push(`La hoja de tiempos de cruce no tiene las columnas: ${faltan.join(', ')}.`);
    return { porPaso, avisos, actualizado: hoy.toISOString() };
  }

  const dia = (d) => d.toISOString().slice(0, 10);
  const desde = dia(new Date(hoy.getTime() - (DIAS - 1) * 864e5));
  const hasta = dia(new Date(hoy.getTime() + 864e5)); // margen por husos horarios
  const validos = new Map(); // un reporte por dispositivo, paso y día: cuenta el último
  let descartados = 0;
  for (const f of filas) {
    const r = Object.fromEntries(CAMPOS.map((c) => [c, (f[col[c]] || '').trim()]));
    const ok =
      idsPasos.has(r.paso) &&
      SENTIDOS[r.sentido] &&
      TRAMOS_TIEMPO.some((t) => t.id === r.tiempo) &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) &&
      r.fecha <= hasta &&
      /^[a-z0-9]{8,40}$/i.test(r.dispositivo);
    if (!ok) {
      descartados++;
      continue;
    }
    if (r.fecha < desde) continue;
    validos.set(`${r.dispositivo}|${r.paso}|${r.fecha}`, r);
  }
  if (descartados) avisos.push(`Tiempos de cruce: ${descartados} reporte(s) con datos no válidos descartados.`);

  for (const r of validos.values()) {
    const p = (porPaso[r.paso] ||= {});
    const s = (p[r.sentido] ||= { n: 0, cuenta: Object.fromEntries(TRAMOS_TIEMPO.map((t) => [t.id, 0])), ultimo: '' });
    s.n++;
    s.cuenta[r.tiempo]++;
    if (r.fecha > s.ultimo) s.ultimo = r.fecha;
  }
  // Mediana sobre tramos ordenados: resiste mejor que la media a reportes extremos.
  for (const p of Object.values(porPaso))
    for (const s of Object.values(p)) {
      if (s.n < MINIMO) continue;
      let acumulado = 0;
      for (const t of TRAMOS_TIEMPO) {
        acumulado += s.cuenta[t.id];
        if (acumulado >= s.n / 2) {
          s.mediana = t.id;
          break;
        }
      }
    }
  return { porPaso, avisos, actualizado: hoy.toISOString() };
}
