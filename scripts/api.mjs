// Exportación pública de datos: api/v1 (P0.5). Contrato en docs/ia-dev.md.
// La genera build.mjs con las MISMAS funciones de estado que pintan la web, para que la web,
// Claude y cualquier otro consumidor lean los mismos datos y los mismos estados.
// Cambios compatibles (campos nuevos) suben la versión menor; un cambio incompatible crea api/v2
// y api/v1 se sigue publicando durante la transición (6 meses, docs/ia-dev.md).
import { CADUCIDAD, EVIDENCIAS, NIVELES, VERIFICADORES, tipoEstado } from './validacion.mjs';

export const API_VERSION = '1.0.0';

const sumar = (fecha, dias) => (fecha && Number.isFinite(dias) ? new Date(Date.parse(fecha) + dias * 864e5).toISOString().slice(0, 10) : null);

/**
 * @param ctx { D, HOY, site, urlBase, nivelReg(r,tipo), estadoPaso(id), estadoTramo(t), nodoNombre }
 * @returns { [archivo]: objeto }
 */
export function generarApi(ctx) {
  const { D, HOY, site, urlBase, nivelReg, estadoPaso, nodoNombre } = ctx;
  const generado = new Date().toISOString();
  // Procedencia y validación de un registro, con la fuente resuelta y el nivel ya calculado.
  const pv = (r, tipo) => {
    if (!r) return null;
    const { verificado, fuente, lat, lon, ...resto } = r; // "verificado" y lat/lon son internos
    const n = nivelReg(r, tipo);
    return {
      ...resto,
      fuente: fuente || null,
      nivel: n,
      nivelTexto: NIVELES[n].texto,
      caducaEl: verificado ? sumar(verificado, CADUCIDAD[tipo]) : null,
    };
  };
  const mostrar = (v) => ({ valor: v.valor, ultimoReportado: v.ultimo, confirmado: v.confirmado, nivelMostrado: v.nivel, texto: v.texto });
  const coord = (c) => (c ? { ...c, fuente: typeof c.fuente === 'string' ? D.fuentes.get(c.fuente) || null : c.fuente } : null);
  const envolver = (recurso, registros, extra = {}) => ({ api: 'v1', version: API_VERSION, generado, recurso, ...extra, registros });

  const pasos = D.pasos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    lados: p.lados,
    ubicacion: { texto: p.ubicacion.texto, coordenadas: coord(p.ubicacion.coordenadas), nota: p.ubicacion.coordenadasNota || null },
    estado: { ...pv(p.estado, tipoEstado(p.estado.valor)), mostrar: mostrar(estadoPaso(p.id)) },
    horarios: p.horarios.map((h) => pv(h, 'horario')),
    horariosEspeciales: (p.horariosEspeciales || []).map((h) => pv(h, 'horario')),
    restricciones: (p.restricciones || []).map((h) => pv(h, 'estado-operativo')),
    acceso: (p.acceso || []).map((h) => pv(h, 'ficha')),
    servicios: (p.servicios || []).map((h) => pv(h, 'ficha')),
    contactos: (p.contactos || []).map((h) => pv(h, 'ficha')),
    organismos: p.organismos,
    revisado: p.revisado,
    url: `${urlBase}/pasos/#${p.id}`,
  }));

  const incidencias = D.incidencias.map((i) => ({ ...pv(i, 'incidencia'), url: `${urlBase}/avisos/#inc-${i.id}` }));
  const incDeTramo = (t) => D.incidencias.filter((i) => (i.paso ? t.paso?.id === i.paso || t.alternativa?.id === i.paso : (i.tramos || []).includes(t.id))).map((i) => i.id);

  const tramos = D.rutas.tramos.map((t) => ({
    id: t.id,
    desde: { id: t.desde, nombre: nodoNombre[t.desde] },
    hasta: { id: t.hasta, nombre: nodoNombre[t.hasta] },
    distancia:
      typeof t.km === 'number'
        ? { km: t.km, evidencia: t.kmEvidencia || null, fuente: t.kmFuente || null, nota: t.kmNota || null }
        : { km: null, evidencia: null, fuente: null, nota: 'Sin distancia con fuente. No se estima.' },
    paso: t.paso ? { id: t.paso.id, nombre: t.paso.nombre } : null,
    alternativa: t.alternativa ? { id: t.alternativa.id, nombre: t.alternativa.nombre } : null,
    estado: { reporte: t.reporte ? pv(t.reporte, tipoEstado(t.reporte.valor)) : null, mostrar: mostrar(t.vista) },
    incidencias: incDeTramo(t),
    nota: t.nota || null,
  }));

  const nodos = D.rutas.nodos.map((n) => ({ id: n.id, nombre: n.nombre, pais: n.pais, coordenadas: coord(n.coordenadas) }));
  const conAlt = D.rutas.tramos.find((t) => t.alternativa);
  const rutas = [
    { id: 'principal', nombre: 'Ruta principal', nodos: nodos.map((n) => n.id), tramos: D.rutas.tramos.map((t) => t.id), pasos: D.rutas.tramos.filter((t) => t.paso).map((t) => t.paso.id) },
    ...(conAlt
      ? [{ id: `por-${conAlt.alternativa.id}`, nombre: `Alternativa por ${conAlt.alternativa.nombre}`, nodos: nodos.map((n) => n.id), tramos: D.rutas.tramos.map((t) => t.id), pasos: D.rutas.tramos.filter((t) => t.paso).map((t) => (t === conAlt ? t.alternativa.id : t.paso.id)) }]
      : []),
  ];

  const calendario = {
    festivos: D.festivos.festivos.filter((f) => f.fecha >= HOY).map((f) => pv(f, 'festivo')),
    horariosPorPaso: D.pasos.map((p) => ({ paso: p.id, horarios: p.horarios.map((h) => pv(h, 'horario')), horariosEspeciales: (p.horariosEspeciales || []).map((h) => pv(h, 'horario')) })),
    pendiente: D.festivos.pendiente || [],
    regla: 'Un festivo nacional no implica que la aduana cierre. Solo cuenta lo que publica el organismo de cada paso.',
  };

  const empresas = D.empresas.map((e) => ({ ...pv(e, 'empresa'), sede: { pais: e.pais, ciudad: e.ciudad }, cobertura: { puntos: e.puntos, detalle: e.cobertura || null } }));
  const fuentes = [...D.fuentes.values()];
  const organismos = D.organismos.map((o) => pv(o, 'organismo'));

  const archivos = {
    'pasos.json': envolver('pasos', pasos),
    'tramos.json': envolver('tramos', tramos),
    'rutas.json': envolver('rutas', rutas, { nodos }),
    'incidencias.json': envolver('incidencias', incidencias),
    'calendario.json': envolver('calendario', [calendario]),
    'empresas.json': envolver('empresas', empresas),
    'fuentes.json': envolver('fuentes', fuentes),
    'organismos.json': envolver('organismos', organismos),
  };
  archivos['indice.json'] = {
    api: 'v1',
    version: API_VERSION,
    generado,
    sitio: { nombre: site.nombreCompleto, url: urlBase, contacto: site.contacto.email || null },
    contrato: 'https://github.com/elezcano/GuiaCorredor/blob/main/docs/ia-dev.md',
    reglas: [
      'Solo nivel "verificado" significa que el responsable editorial revisó el dato y su evidencia.',
      'mostrar.nivelMostrado combina el nivel del dato y el de su ficha de la guía (una ficha en borrador arrastra a sus datos). mostrar.confirmado = false: el valor que se muestra es "pendiente" (Por verificar); ultimoReportado es el último dato publicado por la fuente, sin confirmar.',
      'evidencia "estimacion" o "calculo" nunca es un dato oficial; "historico" nunca es la situación actual.',
      'Distancia con km null: no hay dato con fuente. No estimar.',
      'Un festivo no implica cierre de aduana.',
    ],
    niveles: NIVELES,
    evidencias: EVIDENCIAS,
    verificadores: VERIFICADORES,
    versionesDatos: D.versiones,
    recursos: Object.entries(archivos).map(([f, o]) => ({ recurso: o.recurso, url: `${urlBase}/api/v1/${f}`, registros: o.registros.length })),
  };
  return archivos;
}
