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
    /** HU-116: distancia de un tramo con su tipo: con fuente, calculada (OpenStreetMap u otra), estimada o null. */
    kmTramo(t) {
      if (typeof t.km === 'number') return { km: t.km, tipo: t.kmTipo === 'calculado' ? 'calculado' : 'fuente' };
      if (typeof t.kmCalc === 'number') return { km: t.kmCalc, tipo: 'osm' };
      if (t.estimacion) return { km: t.estimacion.km, tipo: 'estimado' };
      return null;
    },
    /** Opciones de ruta entre dos nodos. Si un tramo tiene paso alternativo, devuelve dos opciones comparables. */
    opciones(datos, a, b) {
      // HU-115: la red es un árbol (ruta principal + ramales). Se busca el único camino entre los dos nodos.
      const idx = Object.fromEntries(datos.nodos.map((n, k) => [n.id, k]));
      const vecinos = datos.nodos.map(() => []);
      datos.tramos.forEach((t) => {
        vecinos[idx[t.desde]].push([idx[t.hasta], t, true]);
        vecinos[idx[t.hasta]].push([idx[t.desde], t, false]);
      });
      const previo = { [a]: null };
      const cola = [a];
      while (cola.length) {
        const x = cola.shift();
        if (x === b) break;
        for (const [y, t, sentido] of vecinos[x]) if (!(y in previo)) (previo[y] = [x, t, sentido]), cola.push(y);
      }
      const base = [];
      for (let x = b; previo[x]; x = previo[x][0]) {
        const [, t, sentido] = previo[x];
        base.unshift({ ...t, de: sentido ? t.desde : t.hasta, a: sentido ? t.hasta : t.desde });
      }
      // Tramo de la ruta principal que toca cada nodo (para resaltar la carretera de la portada).
      const nPrincipal = datos.tramos.filter((t) => !t.ramal).length + 1;
      const enPrincipal = (k) => (k < nPrincipal ? k : idx[datos.tramos.find((t) => t.ramal && idx[t.hasta] === k)?.desde] ?? k);
      const [i, j] = [enPrincipal(a), enPrincipal(b)].sort((x, y) => x - y);
      const conAlternativa = base.findIndex((t) => t.alternativa);
      const variantes = [{ tramos: base, via: null }];
      if (conAlternativa >= 0) {
        const t = base[conAlternativa];
        variantes[0].via = sinParentesis(t.paso.nombre);
        const alt = base.map((x, k) =>
          k === conAlternativa
            ? { ...x, paso: { id: t.alternativa.id, nombre: t.alternativa.nombre, guia: t.alternativa.guia }, estado: t.alternativa.estado || x.estado, vista: t.alternativa.vista || x.vista, estimacion: t.alternativa.estimacion || null, kmCalc: t.alternativa.kmCalc ?? null, alternativa: null, nota: null }
            : x
        );
        variantes.push({ tramos: alt, via: sinParentesis(t.alternativa.nombre) });
      }
      // Tramos sin km con fuente: estimación provisional calculada en el build (t.estimacion), marcada como tal.
      // Incidencias de un tramo: si la incidencia es de un paso, solo cuenta en la variante que pasa por él.
      const incDe = (t) => (datos.incidencias || []).filter((x) => (x.paso ? t.paso?.id === x.paso : (x.tramos || []).includes(t.id)));
      const ops = variantes.map((v, k) => {
        let km = 0;
        let sinKm = 0;
        let kmEstimado = 0;
        const estimados = [];
        const fronteras = [];
        const problemas = [];
        v.tramos.forEach((t) => {
          if (typeof t.km === 'number') km += t.km;
          else {
            sinKm++;
            if (t.estimacion) (kmEstimado += t.estimacion.km), estimados.push(t);
          }
          if (t.paso) fronteras.push(sinParentesis(t.paso.nombre));
          incDe(t).forEach((x) => problemas.includes(x) || problemas.push(x));
        });
        // HU-116: distancia por tipo (con fuente, calculada, estimada en línea recta o sin dato).
        const distancia = { total: 0, fuente: 0, calculado: 0, estimado: 0, sinDato: 0 };
        v.tramos.forEach((t) => {
          const d = GC.kmTramo(t);
          if (!d) return void distancia.sinDato++;
          distancia.total += d.km;
          distancia[d.tipo === 'fuente' ? 'fuente' : d.tipo === 'estimado' ? 'estimado' : 'calculado'] += d.km;
        });
        return {
          distancia,
          id: k === 0 ? 'principal' : 'alternativa',
          nombre: v.via ? `Por ${v.via}` : 'Ruta directa',
          fronteras,
          km,
          sinKm,
          conKm: v.tramos.length - sinKm,
          kmEstimado,
          estimados,
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
