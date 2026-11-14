// Utilidades comunes: tema claro/oscuro, fechas relativas, ruta guardada, cálculo de opciones y buscador.
(function () {
  const raiz = document.documentElement;
  const CLAVE_TEMA = 'guia-corredor:tema';
  const CLAVE_RUTA = 'guia-corredor:ruta';
  const guardar = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const leer = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };

  // Tema
  const botonTema = document.getElementById('cambiar-tema');
  const pintarBoton = () => {
    const oscuro = raiz.dataset.tema === 'oscuro';
    botonTema?.setAttribute('aria-label', oscuro ? 'Activar modo claro' : 'Activar modo oscuro');
    botonTema?.setAttribute('aria-pressed', String(oscuro));
  };
  pintarBoton();
  botonTema?.addEventListener('click', () => {
    const oscuro = raiz.dataset.tema !== 'oscuro';
    if (oscuro) raiz.dataset.tema = 'oscuro';
    else delete raiz.dataset.tema;
    guardar(CLAVE_TEMA, oscuro ? 'oscuro' : 'claro');
    pintarBoton();
  });

  // Fechas relativas: "hace 3 semanas". La fecha completa queda como título.
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

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const sinParentesis = (s) => String(s).replace(/\s*\(.*\)$/, '');

  const GC = {
    esc,
    plural,
    sinParentesis,
    km: (n) => `${n.toLocaleString('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' })} km`,
    leerRuta() {
      try {
        const r = JSON.parse(leer(CLAVE_RUTA) || 'null');
        return r && Number.isInteger(r.desde) && Number.isInteger(r.hasta) && r.desde !== r.hasta ? r : null;
      } catch {
        return null;
      }
    },
    guardarRuta(desde, hasta, carga) {
      guardar(CLAVE_RUTA, JSON.stringify({ desde, hasta, carga, guardada: new Date().toISOString() }));
    },
    olvidarRuta() {
      try {
        localStorage.removeItem(CLAVE_RUTA);
      } catch {}
    },
    /** Opciones de ruta entre dos nodos. Si un tramo tiene paso alternativo, devuelve dos opciones comparables. */
    opciones(datos, a, b) {
      const ida = a < b;
      const [i, j] = ida ? [a, b] : [b, a];
      const base = datos.tramos.slice(i, j).map((t) => ({ ...t, de: ida ? t.desde : t.hasta, a: ida ? t.hasta : t.desde }));
      if (!ida) base.reverse();
      const conAlternativa = base.findIndex((t) => t.alternativa);
      const variantes = [{ tramos: base, via: null }];
      if (conAlternativa >= 0) {
        const t = base[conAlternativa];
        variantes[0].via = sinParentesis(t.paso.nombre);
        const alt = base.map((x, k) =>
          k === conAlternativa
            ? { ...x, paso: { id: t.alternativa.id, nombre: t.alternativa.nombre, guia: t.alternativa.guia }, estado: t.alternativa.estado || x.estado, vista: t.alternativa.vista || x.vista, alternativa: null, nota: null }
            : x
        );
        variantes.push({ tramos: alt, via: sinParentesis(t.alternativa.nombre) });
      }
      // Distancia en línea recta (km) entre dos puntos; se usa solo como estimación para tramos sin dato.
      const rad = (g) => (g * Math.PI) / 180;
      const recta = (p, q) => {
        const h = Math.sin(rad(q.lat - p.lat) / 2) ** 2 + Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(rad(q.lon - p.lon) / 2) ** 2;
        return 2 * 6371 * Math.asin(Math.sqrt(h));
      };
      const nodo = (id) => datos.nodos.find((n) => n.id === id);
      const geoPaso = (t) => t.paso && datos.pasosGeo?.[t.paso.id];
      const estimar = (t) => {
        const p = nodo(t.de), q = nodo(t.a), m = geoPaso(t);
        if (p?.lat == null || q?.lat == null) return 0;
        return m ? recta(p, m) + recta(m, q) : recta(p, q);
      };
      // Incidencias de un tramo: si la incidencia es de un paso, solo cuenta en la variante que pasa por él.
      const incDe = (t) => (datos.incidencias || []).filter((x) => (x.paso ? t.paso?.id === x.paso : (x.tramos || []).includes(t.id)));
      const ops = variantes.map((v, k) => {
        let km = 0;
        let sinKm = 0;
        let kmEstimado = 0;
        const fronteras = [];
        const problemas = [];
        v.tramos.forEach((t) => {
          if (typeof t.km === 'number') km += t.km;
          else {
            sinKm++;
            t.kmRecta = Math.round(estimar(t));
            kmEstimado += t.kmRecta;
          }
          if (t.paso) fronteras.push(sinParentesis(t.paso.nombre));
          incDe(t).forEach((x) => problemas.includes(x) || problemas.push(x));
        });
        return {
          id: k === 0 ? 'principal' : 'alternativa',
          nombre: v.via ? `Por ${v.via}` : 'Ruta directa',
          fronteras,
          km,
          sinKm,
          kmEstimado: Math.round(kmEstimado),
          conKm: v.tramos.length - sinKm,
          tramos: v.tramos,
          incDe,
          problemas,
          sinVerificar: v.tramos.filter((t) => !t.vista?.confirmado).length,
          rango: [i, j],
        };
      });
      const mejor = [...ops].sort((x, y) => x.problemas.length - y.problemas.length || x.sinKm - y.sinKm)[0];
      mejor.recomendada = true;
      return ops;
    },
  };
  window.GC = GC;

  // Buscador de rutas: intercambiar origen y destino
  document.getElementById('intercambiar')?.addEventListener('click', () => {
    const o = document.getElementById('origen');
    const d = document.getElementById('destino');
    [o.value, d.value] = [d.value, o.value];
    o.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
