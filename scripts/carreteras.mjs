// HU-130 fase 2: estado de las carreteras del corredor, leído de las fuentes oficiales.
//
//   Argentina: Vialidad Nacional, página «Estado de rutas». La página carga una hoja de cálculo pública
//   (columnas: provincia, ruta, tramo, estado, calzada, km, conocé más, observaciones, actualizado). El
//   vigilante lee de la propia página qué hoja y qué pestaña usa, y la clave pública de su código: no se
//   guarda ninguna clave en el repositorio.
//   Chile: Dirección de Vialidad (MOP), visor SIEMOP de emergencias (capa pública de ArcGIS), región 02
//   (Antofagasta). Según el propio visor se actualiza una vez a la semana (lunes a mediodía) y a diario
//   solo en emergencias.
//
// Cada tramo oficial con algo que decir se convierte en una incidencia de data/incidencias.json firmada
// por el verificador «vigilante». Reglas:
//   - Argentina: CORTE TOTAL → rojo (corte); CORTE PARCIAL o RESTRINGIDA → ámbar; HABILITADA con
//     observaciones → informativo (se ve en el tramo, no cambia el veredicto del planificador).
//   - Chile: tránsito «No Operativo» → rojo; restricción «Peso restringido», «Sólo vehículos livianos» o
//     «Sólo vehículos doble tracción» → «No habilitado para carga» (rojo, afecta a la carga); el resto de
//     «Parcialmente operativo» → ámbar.
//   - Nunca marcha atrás: si la fuente trae una fecha más antigua que la publicada, se ignora.
//   - Lo que la fuente deja de listar (o vuelve a «habilitada» sin observaciones) se da por resuelto.
//   - Solo se tocan incidencias del vigilante; las cargadas a mano no se modifican.

const ZONA_AR = '-03:00';

/** Tramos oficiales de cada tramo de la Guía. paso: la incidencia solo cuenta en la variante por ese paso. */
export const CORRESPONDENCIAS = {
  ar: [
    // Purmamarca → Jama (variante por Jama del tramo «andes»).
    { guia: { paso: 'jama' }, provincia: 'Jujuy', ruta: '9', tramos: ['S.S. de Jujuy', 'Yala - Volcán', 'Volcán - Emp. RN 52'] },
    { guia: { paso: 'jama' }, provincia: 'Jujuy', ruta: '52', tramos: '*' },
    // Salta → Sico (variante por Sico).
    { guia: { paso: 'sico' }, provincia: 'Salta', ruta: '51', tramos: '*' },
    // Misión La Paz / Pozo Hondo → Jujuy por la RN 34 y la RN 66. El acceso desde Misión La Paz hasta
    // la RN 34 es ruta provincial: Vialidad Nacional no lo publica.
    { guia: { tramo: 'pozo-hondo' }, provincia: 'Salta', ruta: '34', tramos: ['Lte. Con Jujuy - Pichanal', 'Pichanal - Embarcación', 'Embarcación - Gral. E. Mosconi', 'Gral. E. Mosconi - Tartagal'] },
    { guia: { tramo: 'pozo-hondo' }, provincia: 'Jujuy', ruta: '34', tramos: '*' },
    { guia: { tramo: 'pozo-hondo' }, provincia: 'Jujuy', ruta: '66', tramos: '*' },
  ],
  // Chile: por rol de la carretera, solo las que pertenecen a un único tramo de la Guía. La Ruta 5 y la
  // Ruta 1 cruzan toda la región: necesitan un intervalo de km por tramo (pendiente) para no atribuir a
  // un tramo un problema que está a 300 km.
  cl: [
    { guia: { paso: 'jama' }, roles: ['27-CH', 'RUTA 27-CH', 'RUTA 27'] },
    { guia: { paso: 'sico' }, roles: ['23-CH', 'RUTA 23-CH', 'RUTA 23'], soloSector: /sico|socaire|toconao|peine|san pedro/i },
    { guia: { tramo: 'spa-calama' }, roles: ['23-CH', 'RUTA 23-CH', 'RUTA 23'], soloSector: /calama|san pedro/i },
    { guia: { tramo: 'calama-antofagasta' }, roles: ['25', 'RUTA 25'] },
    { guia: { tramo: 'calama-mejillones' }, roles: ['25', 'RUTA 25'] },
    { guia: { tramo: 'calama-iquique' }, roles: ['24', 'RUTA 24'] },
  ],
};

const limpio = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const sinPuntoInicial = (s) => s.replace(/^[\s.,;:-]+/, '');
const conTexto = (s) => /[a-záéíóúñ]{3}/i.test(s || '');
const slug = (s) => limpio(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** { paso } o { tramo } de la correspondencia → campos de la incidencia (paso, o tramos: [id]). */
const enGuia = (g) => (g.paso ? { paso: g.paso } : { tramos: [g.tramo] });
const punto = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);

// ---------- Argentina ----------
/** De la página «Estado de rutas»: hoja y pestaña. De poncho.min.js: la clave pública. */
export function configTablaAR(html, js = '') {
  const hoja = html.match(/["']?idSpread["']?\s*[:=]\s*["']([A-Za-z0-9_-]{20,})["']/)?.[1] || null;
  const pestana = html.match(/["']?hojaNombre["']?\s*[:=]\s*["']([^"']+)["']/)?.[1] || null;
  const clave = js.match(/gapi_key\s*:\s*["'](AIza[0-9A-Za-z_-]{30,})["']/)?.[1] || null;
  return { hoja, pestana, clave };
}

/** «17/11/2026 09:00» → { dia: '2026-11-17', hora: '09:00', instante } */
export function fechaAR(s) {
  const m = limpio(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const dia = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const hora = `${m[4].padStart(2, '0')}:${m[5]}`;
  return { dia, hora, instante: new Date(`${dia}T${hora}:00${ZONA_AR}`).toISOString() };
}

/** Filas de la hoja → lecturas por tramo oficial del corredor. */
export function leerAR(json) {
  const filas = json?.values || [];
  const cab = (filas[0] || []).map((x) => limpio(x).toLowerCase());
  const col = (n) => cab.indexOf(n);
  const c = { prov: col('filtro-provincia'), ruta: col('filtro-ruta'), tramo: col('filtro-tramo'), estado: col('estado'), calzada: col('calzada'), obs: col('observaciones'), act: col('actualizado') };
  if (Object.values(c).some((i) => i < 0)) throw new Error(`la tabla de Vialidad Nacional ha cambiado de columnas (${cab.join(', ')})`);
  const res = [];
  for (const f of filas.slice(2)) {
    const r = { provincia: limpio(f[c.prov]), ruta: limpio(f[c.ruta]), tramo: limpio(f[c.tramo]), estado: limpio(f[c.estado]).toUpperCase(), calzada: limpio(f[c.calzada]), obs: limpio(f[c.obs]), fecha: fechaAR(f[c.act]) };
    for (const m of CORRESPONDENCIAS.ar) {
      if (m.provincia !== r.provincia || m.ruta !== r.ruta) continue;
      if (m.tramos !== '*' && !m.tramos.some((t) => r.tramo.replace(/\s+/g, ' ').startsWith(t))) continue;
      res.push({ ...r, guia: m.guia });
    }
  }
  return res;
}

/** Una lectura argentina → incidencia (o null si no hay nada que decir). */
export function incidenciaAR(r, fuente) {
  const obs = conTexto(r.obs) ? punto(sinPuntoInicial(r.obs)) : '';
  const nivel = r.estado === 'CORTE TOTAL' ? 'rojo' : ['CORTE PARCIAL', 'RESTRINGIDA'].includes(r.estado) ? 'ambar' : r.estado === 'HABILITADA' ? (obs ? 'info' : null) : 'ambar';
  if (!nivel) return null;
  const etiqueta = { 'CORTE TOTAL': 'Corte total', 'CORTE PARCIAL': 'Corte parcial', RESTRINGIDA: 'Circulación restringida', HABILITADA: 'Habilitada' }[r.estado] || `Estado «${r.estado}»`;
  return {
    id: `vn-${slug(r.provincia)}-rn${slug(r.ruta)}-${slug(r.tramo)}`.slice(0, 80),
    paises: ['AR'],
    ubicacion: `RN ${r.ruta}, ${r.tramo} (${r.provincia})`,
    tramo: `RN ${r.ruta}: ${r.tramo}${r.calzada ? ` · ${r.calzada.toLowerCase()}` : ''}`,
    tipo: nivel === 'rojo' ? 'corte' : nivel === 'ambar' ? 'restriccion' : 'otro',
    estado: 'activa',
    gravedad: nivel,
    // Empieza por la carretera: en la ficha y en el planificador el aviso se lee suelto.
    descripcion: `RN ${r.ruta} (${r.tramo}): ${nivel === 'info' ? obs : `${etiqueta}.${obs ? ` ${obs}` : ''}`}`,
    ...enGuia(r.guia),
    fuente,
    publicado: r.fecha?.dia || null,
    horaFuente: r.fecha?.instante || null,
    ...(nivel === 'rojo' ? { impacto: 'Corte total: no pasa ningún vehículo.' } : {}),
  };
}

// ---------- Chile ----------
const RESTR_CARGA = /peso restringido|s[óo]lo veh[íi]culos livianos|s[óo]lo veh[íi]culos doble tracci[óo]n/i;
/** Emergencias de la capa SIEMOP (región 02) → lecturas por tramo de la Guía. */
export function leerCL(json) {
  const feats = json?.features;
  if (!Array.isArray(feats)) throw new Error('la capa de emergencias de Vialidad (MOP) no devuelve registros (¿ha cambiado?)');
  const vistos = new Set();
  const res = [];
  for (const { attributes: a } of feats) {
    if (!a || !('ROL' in a) || !('TRANSITO' in a)) throw new Error('la capa de emergencias de Vialidad (MOP) ha cambiado de campos');
    const clave = `${a.CORRELATIVO}|${a.KM_INICIO_SEGMENTO}|${a.KM_FIN_SEGMENTO}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const rol = limpio(a.ROL).toUpperCase();
    for (const m of CORRESPONDENCIAS.cl) {
      if (!m.roles.includes(rol)) continue;
      if (m.soloSector && !m.soloSector.test(a.NOMBRE_CAMINO || '')) continue;
      res.push({ a, guia: m.guia });
    }
  }
  return res;
}

const diaCL = (ms) => (ms ? new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' }) : null);
export function incidenciaCL({ a, guia }, fuente) {
  const transito = limpio(a.TRANSITO);
  const restr = limpio(a.RESTRICCION);
  const carga = RESTR_CARGA.test(restr);
  const nivel = /^no operativo/i.test(transito) ? 'rojo' : carga ? 'rojo' : /parcial/i.test(transito) || restr ? 'ambar' : 'info';
  const km = a.KM_INICIO_SEGMENTO != null ? ` (km ${a.KM_INICIO_SEGMENTO}–${a.KM_FIN_SEGMENTO})` : '';
  const quePasa = limpio(a.RESUMEN_EMERGENCIA || a.RESUMEN || a.DESCRIPCION_DETALLADA);
  const estado = nivel === 'rojo' && !carga ? 'Tránsito no operativo' : carga ? `No habilitado para carga: ${restr.toLowerCase()}` : transito ? `Tránsito ${transito.toLowerCase()}${restr ? `, ${restr.toLowerCase()}` : ''}` : restr;
  const editado = a.last_edited_date || a.FECHA || a.FECHA_INGRESO;
  return {
    id: `mop-${slug(a.CORRELATIVO || a.OBJECTID)}-${slug(a.KM_INICIO_SEGMENTO)}`.slice(0, 80),
    paises: ['CL'],
    ubicacion: `${limpio(a.ROL)}${km}, ${limpio(a.NOMBRE_CAMINO)}`,
    tramo: `${limpio(a.ROL)}${km}`,
    tipo: carga ? 'peso' : nivel === 'rojo' ? 'corte' : 'restriccion',
    estado: 'activa',
    gravedad: nivel,
    ...(carga ? { afecta: 'carga' } : {}),
    descripcion: `${limpio(a.ROL)}${km}: ${punto(estado)}${quePasa ? ` ${punto(quePasa)}` : ''} Registrado por Vialidad el ${diaCL(a.FECHA_EMERGENCIA || a.FECHA_INGRESO)?.split('-').reverse().join('/') || 'sin fecha'}.`,
    inicio: diaCL(a.FECHA_EMERGENCIA || a.FECHA_INGRESO),
    ...enGuia(guia),
    fuente,
    publicado: diaCL(editado),
    horaFuente: editado ? new Date(editado).toISOString() : null,
    ...(carga ? { impacto: `No habilitado para carga (${restr.toLowerCase()}).` } : nivel === 'rojo' ? { impacto: 'Tránsito no operativo.' } : {}),
  };
}

// ---------- Decisión: qué cambia en data/incidencias.json ----------
const sello = (ahora, que) => {
  const dia = ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Salta' });
  const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Salta' }).format(ahora);
  return {
    actualizado: dia,
    evidencia: 'oficial',
    validacion: 'verificado',
    verificacion: { verificadoPor: 'vigilante', rol: 'vigilante', fecha: dia, alcance: `Leído automáticamente de la web oficial el ${dia.split('-').slice(1).reverse().join('/')} a las ${hora} (hora de Argentina): ${que}.` },
  };
};
const delVigilante = (i) => i.verificacion?.verificadoPor === 'vigilante';
const DIAS_RESUELTAS = 15;

/**
 * nuevas: incidencias leídas ahora de UNA fuente (todas con la misma fuente). Puro: devuelve
 * { incidencias, cambios } sin tocar la lista original.
 */
export function aplicar(lista, nuevas, fuente, ahora = new Date()) {
  const res = structuredClone(lista);
  const cambios = [];
  const porId = new Map(res.map((i) => [i.id, i]));
  const hoy = ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Salta' });
  const vistas = new Set();
  // Nunca marcha atrás con la fuente entera: si lo leído es más antiguo que lo ya publicado de esa
  // fuente, es una copia vieja (caché) y se descarta.
  const maxPub = res.filter((i) => delVigilante(i) && i.fuente === fuente && i.horaFuente).map((i) => i.horaFuente).sort().pop();
  const maxNuevo = nuevas.map((n) => n.horaFuente).filter(Boolean).sort().pop();
  if (maxPub && maxNuevo && maxNuevo < maxPub) return { incidencias: lista, cambios: [], descartada: true };
  for (const n of nuevas) {
    vistas.add(n.id);
    const ya = porId.get(n.id);
    if (ya && !delVigilante(ya)) continue; // cargada a mano: no se toca
    if (ya && ya.horaFuente && n.horaFuente && n.horaFuente < ya.horaFuente) continue; // nunca marcha atrás
    const igual = ya && ya.estado === 'activa' && ya.descripcion === n.descripcion && ya.gravedad === n.gravedad;
    if (igual) continue;
    const reg = { ...n, ...sello(ahora, `${n.ubicacion}: ${n.descripcion}`) };
    if (ya) Object.keys(ya).forEach((k) => delete ya[k]), Object.assign(ya, reg);
    else res.push(reg), porId.set(reg.id, reg);
    cambios.push(`${ya ? 'Actualizado' : 'Nuevo'} · ${n.ubicacion}: ${n.descripcion}`);
  }
  for (const i of res) {
    if (!delVigilante(i) || i.fuente !== fuente) continue;
    if (i.estado === 'activa' && !vistas.has(i.id)) {
      i.estado = 'resuelta';
      i.fin = hoy;
      Object.assign(i, sello(ahora, `${i.ubicacion}: la fuente ya no lo lista`));
      cambios.push(`Resuelto · ${i.ubicacion}: la fuente oficial ya no lo lista.`);
    }
  }
  // Las resueltas del vigilante se guardan unos días (para el historial) y después se retiran.
  const limite = new Date(ahora.getTime() - DIAS_RESUELTAS * 864e5).toISOString().slice(0, 10);
  const final = res.filter((i) => !(delVigilante(i) && i.fuente === fuente && i.estado === 'resuelta' && (i.fin || '') < limite));
  return { incidencias: final, cambios };
}

/** La fuente lleva demasiado sin actualizarse (horas): dato oficial, pero viejo. */
export function antiguedadHoras(nuevas, ahora = new Date()) {
  const max = nuevas.map((n) => n.horaFuente).filter(Boolean).sort().pop();
  return max ? (ahora - new Date(max)) / 36e5 : null;
}
