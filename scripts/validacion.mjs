// Sistema único de validación del portal.
// Todo registro con información operativa lleva: fuente, publicado, verificado y validacion.
//   fuente:     { nombre, url, tipo: 'oficial' | 'prensa' | 'otra' }
//   publicado:  fecha (AAAA-MM-DD) en que la fuente publicó el dato (null si es una norma o no consta)
//   verificado: fecha en que alguien del equipo comprobó el dato contra la fuente (null si nadie)
//   validacion: 'verificado' | 'por-verificar' | 'borrador'
// La web calcula el NIVEL que muestra: verificado, por-verificar, caducado o borrador.
// Regla: un estado operativo solo se muestra como confirmado si su nivel es 'verificado'.

export const NIVELES = {
  verificado: { texto: 'Verificado', orden: 3 },
  'por-verificar': { texto: 'Sin verificar', orden: 2 },
  caducado: { texto: 'Verificación caducada', orden: 1 },
  borrador: { texto: 'Borrador', orden: 0 },
};

// Días que dura una verificación según el tipo de dato.
export const CADUCIDAD = {
  'estado-operativo': 30, // operativo, con restricciones, intermitente
  'estado-obra': 120, // en obras, cerrado, cierre programado
  horario: 180,
  incidencia: 60,
  ficha: 365,
  organismo: 365,
  festivo: Infinity, // vale para su fecha
  empresa: 365,
};

const ESTADOS_DE_OBRA = new Set(['en-obras', 'cerrado', 'cierre-programado']);
export const tipoEstado = (valor) => (ESTADOS_DE_OBRA.has(valor) ? 'estado-obra' : 'estado-operativo');

export const diasEntre = (desde, hasta) => (desde ? Math.floor((Date.parse(hasta) - Date.parse(desde)) / 864e5) : Infinity);

/** Nivel de validación de un registro en una fecha dada. */
export function nivel(registro, tipo, hoy) {
  if (!registro) return 'por-verificar';
  if (registro.validacion === 'borrador' || registro.borrador === true) return 'borrador';
  if (registro.validacion !== 'verificado' || !registro.verificado) return 'por-verificar';
  return diasEntre(registro.verificado, hoy) > (CADUCIDAD[tipo] ?? 30) ? 'caducado' : 'verificado';
}

/** El peor de varios niveles: una ficha borrador arrastra a sus datos. */
export const peor = (...ns) => ns.filter(Boolean).sort((a, b) => NIVELES[a].orden - NIVELES[b].orden)[0] || 'por-verificar';

/**
 * Estado operativo que se puede mostrar.
 * Devuelve { valor, ultimo, nivel, confirmado, fuente, publicado, verificado, texto }.
 * Si no está verificado, valor = 'pendiente' ("Por verificar") y 'ultimo' guarda el dato reportado.
 */
export function estadoMostrable(registro, hoy, nivelFicha) {
  if (!registro?.valor) return { valor: 'pendiente', ultimo: null, nivel: 'por-verificar', confirmado: false };
  const n = peor(nivel(registro, tipoEstado(registro.valor), hoy), nivelFicha);
  const confirmado = n === 'verificado';
  return {
    valor: confirmado ? registro.valor : 'pendiente',
    ultimo: registro.valor,
    nivel: n,
    confirmado,
    fuente: registro.fuente || null,
    publicado: registro.publicado || null,
    verificado: registro.verificado || null,
    texto: registro.texto || '',
  };
}

/** Comprueba los campos comunes. Devuelve lista de errores (texto). */
export function erroresRegistro(r, donde, { exigeFuente = true, permitePublicadoNulo = false } = {}) {
  const e = [];
  const esFecha = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
  if (exigeFuente && !(r.fuente?.nombre && /^https?:\/\//.test(r.fuente?.url || ''))) e.push(`${donde}: falta fuente (nombre y url).`);
  if (r.fuente && r.fuente.tipo && !['oficial', 'prensa', 'otra'].includes(r.fuente.tipo)) e.push(`${donde}: fuente.tipo debe ser oficial, prensa u otra.`);
  if (!('publicado' in r)) e.push(`${donde}: falta "publicado".`);
  else if (r.publicado !== null && !esFecha(r.publicado)) e.push(`${donde}: "publicado" debe ser AAAA-MM-DD o null.`);
  else if (r.publicado === null && !permitePublicadoNulo) e.push(`${donde}: "publicado" no puede ser null.`);
  if (!('verificado' in r)) e.push(`${donde}: falta "verificado".`);
  else if (r.verificado !== null && !esFecha(r.verificado)) e.push(`${donde}: "verificado" debe ser AAAA-MM-DD o null.`);
  if (!['verificado', 'por-verificar', 'borrador'].includes(r.validacion)) e.push(`${donde}: "validacion" debe ser verificado, por-verificar o borrador.`);
  if (r.validacion === 'verificado' && !r.verificado) e.push(`${donde}: marcado como verificado sin fecha de verificación.`);
  return e;
}
