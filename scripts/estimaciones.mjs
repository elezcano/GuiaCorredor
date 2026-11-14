// Estimaciones provisionales de distancia (decisión del 15/11/2026, hasta tener distancias oficiales: P1.7).
// Solo para tramos SIN distancia con fuente. Línea recta entre las coordenadas con fuente de los extremos
// (pasando por el paso fronterizo si tiene coordenadas). Por carretera la distancia real es MAYOR.
// La calcula el build una vez y la usan igual la web (planificador, fichas) y api/v1.
// Se activan o desactivan en data/site.json → "estimaciones": { "provisionales": true }.

const rad = (g) => (g * Math.PI) / 180;
export function recta(p, q) {
  const h = Math.sin(rad(q.lat - p.lat) / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(rad(q.lon - p.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const redondear = (km) => (km < 50 ? Math.round(km) : Math.round(km / 10) * 10);
const etiqueta = (n) => (n.coordenadas?.precision === 'referencia' ? `${n.nombre} (punto de referencia: ${n.coordenadas.nota?.match(/referencia: ([^.]+)/)?.[1] || 'una de sus localidades'})` : n.nombre);

/**
 * Estimación de un tramo, opcionalmente por un paso concreto.
 * @returns { km, evidencia:'estimacion', metodo, puntos, imprecisa, aviso } o null si faltan coordenadas.
 */
export function estimarTramo(t, nodo, pasoUbic) {
  const a = nodo(t.desde), b = nodo(t.hasta);
  if (a?.lat == null || b?.lat == null) return null;
  const m = pasoUbic?.lat != null ? pasoUbic : null;
  const km = m ? recta(a, m) + recta(m, b) : recta(a, b);
  const imprecisa = [a, b].some((n) => n.coordenadas?.precision === 'referencia');
  const puntos = [etiqueta(a), ...(m ? [pasoUbic.nombre] : []), etiqueta(b)];
  return {
    km: redondear(km),
    evidencia: 'estimacion',
    metodo: 'linea-recta',
    puntos,
    imprecisa,
    aviso: `Estimación provisional sin verificar: línea recta ${puntos.join(' → ')}. Por carretera la distancia es mayor.${imprecisa ? ' Uno de los extremos agrupa varias localidades: el error puede ser grande.' : ''}`,
  };
}

/** Añade t.estimacion (y t.alternativa.estimacion) a los tramos sin km. Devuelve los tramos. */
export function aplicarEstimaciones(rutas, pasos, activas = true) {
  const nodos = Object.fromEntries(rutas.nodos.map((n) => [n.id, n]));
  const ubic = (id) => {
    const p = pasos.find((x) => x.id === id);
    return p ? { lat: p.ubicacion.lat, lon: p.ubicacion.lon, nombre: p.nombre } : null;
  };
  for (const t of rutas.tramos) {
    t.estimacion = null;
    if (t.alternativa) t.alternativa.estimacion = null;
    if (!activas || typeof t.km === 'number') continue;
    t.estimacion = estimarTramo(t, (id) => nodos[id], t.paso ? ubic(t.paso.id) : null);
    if (t.alternativa) t.alternativa.estimacion = estimarTramo(t, (id) => nodos[id], ubic(t.alternativa.id));
  }
  return rutas.tramos;
}
