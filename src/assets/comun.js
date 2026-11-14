// Utilidades comunes a todas las páginas.
(function () {
  // Fechas relativas: "hace 3 días". El texto original (fecha completa) queda como título.
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  document.querySelectorAll('time.rel').forEach((t) => {
    const d = new Date(t.getAttribute('datetime') + 'T12:00:00');
    if (isNaN(d)) return;
    const dias = Math.round((d - hoy) / 86400000);
    let txt;
    if (Math.abs(dias) < 7) txt = rtf.format(dias, 'day');
    else if (Math.abs(dias) < 45) txt = rtf.format(Math.round(dias / 7), 'week');
    else if (Math.abs(dias) < 365) txt = rtf.format(Math.round(dias / 30), 'month');
    else return;
    t.title = t.textContent;
    t.textContent = txt;
  });

  // Ruta guardada en este dispositivo (sin cuentas ni servidor).
  const CLAVE = 'guia-corredor:ruta';
  const GC = {
    leerRuta() {
      try {
        const r = JSON.parse(localStorage.getItem(CLAVE) || 'null');
        return r && Number.isInteger(r.desde) && Number.isInteger(r.hasta) && r.desde !== r.hasta ? r : null;
      } catch {
        return null;
      }
    },
    guardarRuta(desde, hasta) {
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ desde, hasta, guardada: new Date().toISOString() }));
      } catch {}
    },
    olvidarRuta() {
      try {
        localStorage.removeItem(CLAVE);
      } catch {}
    },
    /** Tramos entre dos nodos, en el sentido del viaje, con resumen. */
    calcular(datos, a, b) {
      const ida = a < b;
      const [i, j] = ida ? [a, b] : [b, a];
      const tramos = datos.tramos.slice(i, j).map((t) => ({ ...t, de: ida ? t.desde : t.hasta, a: ida ? t.hasta : t.desde }));
      if (!ida) tramos.reverse();
      let km = 0;
      let sinKm = 0;
      let fronteras = 0;
      tramos.forEach((t) => {
        if (typeof t.km === 'number') km += t.km;
        else sinKm++;
        if (t.paso) fronteras++;
      });
      return { tramos, km, sinKm, fronteras, problemas: tramos.filter((t) => t.estado !== 'operativo'), rango: [i, j] };
    },
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    plural: (n, s, p) => `${n} ${n === 1 ? s : p}`,
  };
  window.GC = GC;
})();
