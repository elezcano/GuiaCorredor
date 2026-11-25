// Sistema único de validación del portal. Lo usan la web, la API (api/v1) y las comprobaciones.
// Campos comunes de un registro (ver docs/datos-y-fuentes.md, parte 1 · Validación):
//   fuente:       id de data/fuentes.json (en memoria se resuelve a { id, nombre, url, tipo })
//   evidencia:    oficial | declaracion-empresa | tercero | calculo | estimacion | historico
//   publicado:    fecha (AAAA-MM-DD) en que la fuente publicó el dato (null si es una norma o no consta)
//   actualizado:  fecha en que se comprobó el dato contra la fuente por última vez (persona o asistente)
//   validacion:   'verificado' | 'por-verificar' | 'borrador'
//   verificacion: { verificadoPor, rol, fecha, alcance } o null. Solo una persona responsable la escribe.
// Un registro solo es 'verificado' si tiene verificacion de un verificador de VERIFICADORES.
// La IA nunca escribe 'verificado' ni 'verificacion'.
// La web calcula el NIVEL que muestra: verificado, por-verificar, caducado o borrador.

/** Identificadores de verificador aceptados. Representan un rol, no a una persona concreta. */
export const VERIFICADORES = {
  'responsable-editorial': 'Comprobación manual en la fuente',
  // HU-130 (decisión 22): lectura automática de una web oficial, publicada al momento. Solo en
  // estados y partes de pasos con fuente oficial (lo controla check.mjs); el responsable revisa después.
  vigilante: 'Leído de la web oficial',
};
export const EVIDENCIAS = {
  oficial: 'Dato oficial',
  'declaracion-empresa': 'Declarado por la empresa',
  tercero: 'Fuente de terceros',
  calculo: 'Cálculo',
  estimacion: 'Estimación',
  historico: 'Dato histórico',
};
export const TIPOS_FUENTE = ['oficial', 'prensa', 'referencia', 'empresa', 'otra'];
const esFecha = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '') && !Number.isNaN(Date.parse(x));

/** Fecha de verificación humana válida o null. */
export function fechaVerificacion(r) {
  const v = r?.verificacion;
  if (r?.validacion !== 'verificado' || !v || !VERIFICADORES[v.verificadoPor] || !esFecha(v.fecha)) return null;
  return v.fecha;
}

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
  const fecha = fechaVerificacion(registro);
  if (registro.validacion !== 'verificado' || !fecha) return 'por-verificar';
  return diasEntre(fecha, hoy) > (CADUCIDAD[tipo] ?? 30) ? 'caducado' : 'verificado';
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
    verificado: fechaVerificacion(registro),
    verificacion: fechaVerificacion(registro) ? registro.verificacion : null,
    evidencia: registro.evidencia || null,
    actualizado: registro.actualizado || null,
    texto: registro.texto || '',
  };
}

/** Comprueba los campos comunes (sobre el registro tal como está en el archivo, con la fuente como id). */
export function erroresRegistro(r, donde, { exigeFuente = true, permitePublicadoNulo = false, fuentes = null } = {}) {
  const e = [];
  if (exigeFuente && !r.fuente) e.push(`${donde}: falta "fuente".`);
  if (r.fuente && fuentes && !fuentes.has(r.fuente)) e.push(`${donde}: la fuente "${r.fuente}" no está en data/fuentes.json.`);
  for (const f of r.otrasFuentes || []) if (fuentes && !fuentes.has(f)) e.push(`${donde}: otrasFuentes cita "${f}", que no está en data/fuentes.json.`);
  if (!EVIDENCIAS[r.evidencia]) e.push(`${donde}: "evidencia" debe ser ${Object.keys(EVIDENCIAS).join(', ')}.`);
  if (!('publicado' in r)) e.push(`${donde}: falta "publicado".`);
  else if (r.publicado !== null && !esFecha(r.publicado)) e.push(`${donde}: "publicado" debe ser AAAA-MM-DD o null.`);
  else if (r.publicado === null && !permitePublicadoNulo) e.push(`${donde}: "publicado" no puede ser null.`);
  if (!('actualizado' in r)) e.push(`${donde}: falta "actualizado".`);
  else if (r.actualizado !== null && !esFecha(r.actualizado)) e.push(`${donde}: "actualizado" debe ser AAAA-MM-DD o null.`);
  if ('verificado' in r) e.push(`${donde}: "verificado" ya no se usa; la fecha va en "actualizado" y la verificación humana en "verificacion".`);
  if (!['verificado', 'por-verificar', 'borrador'].includes(r.validacion)) e.push(`${donde}: "validacion" debe ser verificado, por-verificar o borrador.`);
  if (!('verificacion' in r)) e.push(`${donde}: falta "verificacion" (null si nadie lo ha verificado).`);
  const v = r.verificacion;
  if (r.validacion === 'verificado') {
    if (!v) e.push(`${donde}: marcado como verificado sin "verificacion".`);
    else {
      if (!VERIFICADORES[v.verificadoPor]) e.push(`${donde}: "verificacion.verificadoPor" debe ser uno de: ${Object.keys(VERIFICADORES).join(', ')}.`);
      if (!esFecha(v.fecha)) e.push(`${donde}: "verificacion.fecha" debe ser AAAA-MM-DD.`);
      if (!v.alcance) e.push(`${donde}: "verificacion.alcance" vacío.`);
    }
    if (r.evidencia === 'estimacion' || r.evidencia === 'historico') e.push(`${donde}: una ${r.evidencia} no se puede marcar como verificada como dato actual.`);
  } else if (v) e.push(`${donde}: tiene "verificacion" pero "validacion" es ${r.validacion}. Estados incompatibles.`);
  if (r.publicado && r.actualizado && r.actualizado < r.publicado) e.push(`${donde}: "actualizado" (${r.actualizado}) es anterior a "publicado" (${r.publicado}).`);
  if (v?.fecha && r.publicado && v.fecha < r.publicado) e.push(`${donde}: verificado antes de publicarse.`);
  return e;
}

/** Registro de validación de una ficha de la guía (frontmatter Markdown). */
export const registroGuia = (m) => ({
  validacion: m.validacion || (m.borrador === true ? 'borrador' : 'por-verificar'),
  verificacion: m.verificadoPor ? { verificadoPor: m.verificadoPor, fecha: m.verificado, alcance: 'ficha completa' } : null,
});
