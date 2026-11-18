// Utilidades comunes: tema claro/oscuro, fechas relativas, ruta guardada, cálculo de opciones y buscador.
(function () {
  const raiz = document.documentElement;
  const CLAVE_TEMA = 'guia-corredor:tema';
  const CLAVE_RUTA = 'guia-corredor:ruta';
  const CLAVE_MI_RUTA = 'guia-corredor:mi-ruta';
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
    /** HU-133 (R9): la ruta que el usuario guarda a propósito («Guardar ruta»). La usan Hoy, Fronteras y Servicios. */
    leerMiRuta() {
      try {
        const r = JSON.parse(leer(CLAVE_MI_RUTA) || 'null');
        return r && Number.isInteger(r.desde) && Number.isInteger(r.hasta) && r.desde !== r.hasta ? r : null;
      } catch {
        return null;
      }
    },
    guardarMiRuta(desde, hasta, carga) {
      guardar(CLAVE_MI_RUTA, JSON.stringify({ desde, hasta, carga, guardada: new Date().toISOString() }));
    },
    olvidarMiRuta() {
      try {
        localStorage.removeItem(CLAVE_MI_RUTA);
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
    /** HU-133: diagnóstico y veredicto de una ruta, compartido por el planificador y la portada «Hoy». */
    diag(datos) {
      const nombre = (id) => datos.nodos.find((n) => n.id === id)?.nombre || id;
      const tramoNombre = (t) => `${nombre(t.de)} → ${nombre(t.a)}`;
      const opDe = (t) => (t.vista?.confirmado ? t.vista.op : 'sin-confirmar');
      const TEXTO_OP = { abierto: 'Abierto', restricciones: 'Con restricciones', cerrado: 'No habilitado', 'sin-confirmar': 'Sin confirmar' };
      const textoEstado = (t) => {
        const op = opDe(t);
        const det = t.vista?.confirmado && datos.estados[t.vista.valor] && !['operativo', 'restricciones'].includes(t.vista.valor) ? datos.estados[t.vista.valor] : '';
        return TEXTO_OP[op] + (det && det !== TEXTO_OP[op] ? ` · ${det.toLowerCase()}` : '');
      };
      // HU-130: un aviso rojo de la fuente oficial (corte total, o no habilitado para carga) bloquea el tramo.
      const cortaAviso = (op, t) => op.incDe(t).some((i) => i.gravedad === 'rojo');
      const bloquea = (op, t) => opDe(t) === 'cerrado' || cortaAviso(op, t);
      const motivoBloqueo = (op, t) => {
        const i = opDe(t) === 'cerrado' ? null : op.incDe(t).find((x) => x.gravedad === 'rojo');
        return i ? `${i.afecta === 'carga' ? 'no habilitado para carga' : 'corte'} en ${i.ubicacion}` : textoEstado(t).toLowerCase();
      };
      function diagnostico(op) {
        const bloqueos = op.tramos.filter((t) => bloquea(op, t));
        const dudas = [];
        op.tramos.forEach((t) => {
          const o = opDe(t);
          if (bloquea(op, t)) return;
          const avisos = op.incDe(t).filter((i) => i.gravedad !== 'info');
          if (avisos.length) return avisos.forEach((i) => dudas.push(`${i.tipo}: ${i.ubicacion}`));
          if (t.paso && o === 'restricciones') dudas.push(`${sinParentesis(t.paso.nombre)}: con restricciones`);
          else if (t.paso && o === 'sin-confirmar') dudas.push(`${sinParentesis(t.paso.nombre)}: estado sin confirmar`);
          else if (!t.paso && o === 'restricciones') dudas.push(`${tramoNombre(t)}: con restricciones`);
        });
        const sinParte = op.tramos.filter((t) => !t.paso && !t.vista?.confirmado).length;
        const trozos = [];
        let actual = [];
        op.tramos.forEach((t) => {
          if (bloquea(op, t)) {
            if (actual.length) trozos.push(actual);
            actual = [];
          } else actual.push(t);
        });
        if (actual.length) trozos.push(actual);
        const nivel = bloqueos.length ? 'rojo' : dudas.length ? 'ambar' : 'verde';
        return { bloqueos, dudas, sinParte, trozos, nivel };
      }
      const ORDEN = { verde: 0, ambar: 1, rojo: 2 };
      const recomendar = (ops, dgs) => [...ops].sort((x, y) => ORDEN[dgs[x.id].nivel] - ORDEN[dgs[y.id].nivel] || dgs[x.id].dudas.length - dgs[y.id].dudas.length || x.distancia.total - y.distancia.total)[0];
      const corto = (n) => n.replace(/^Por (Paso de |Paso |el )?/, 'Por ');
      const via = (op, ops) => (ops.length > 1 && op.nombre.startsWith('Por ') ? ` p${corto(op.nombre).slice(1)}` : '');
      const quePasa = (op, t) => `${t.paso ? sinParentesis(t.paso.nombre) : tramoNombre(t)}: ${motivoBloqueo(op, t)}`;
      /** HU-133 (R5/R6): el veredicto en una frase, en segunda persona y con el verbo delante, y el porqué en otra. */
      function frase(op, dg, ops = [op], dgs = {}) {
        const v = via(op, ops);
        const titulo = {
          rojo: 'Hoy no puedes hacerla entera',
          ambar: `Puedes ir hoy${v}, con dudas`,
          verde: dg.sinParte ? `Nada te impide ir hoy${v}` : `Puedes ir hoy${v}`,
        }[dg.nivel];
        const porque = [];
        if (dg.bloqueos.length) porque.push(`Lo impide ${dg.bloqueos.map((t) => quePasa(op, t)).join('; ')}.`);
        else if (dg.dudas.length) porque.push(`Ojo: ${dg.dudas.slice(0, 2).join('; ')}${dg.dudas.length > 2 ? ` y ${dg.dudas.length - 2} más` : ''}.`);
        else if (dg.sinParte) porque.push(`${plural(dg.sinParte, 'tramo de carretera', 'tramos de carretera')} sin parte oficial: no sabemos su estado.`);
        // La otra opción, si no se puede: «Por Jama no: no habilitado para carga en …».
        // Solo si lo que la impide es distinto de lo que ya impide la elegida (p. ej. el mismo puente, no se repite).
        const clave = (t) => t.paso?.id || t.id;
        const ya = new Set(dg.bloqueos.map(clave));
        ops.forEach((o) => {
          const propio = o !== op && (dgs[o.id]?.bloqueos || []).find((t) => !ya.has(clave(t)));
          if (propio) porque.push(`${corto(o.nombre)} no: ${motivoBloqueo(o, propio)}${propio.paso ? '' : ` en ${tramoNombre(propio)}`}.`);
        });
        return { titulo, porque: porque.join(' ') };
      }
      return { opDe, textoEstado, bloquea, motivoBloqueo, diagnostico, recomendar, frase, ORDEN, tramoNombre };
    },
  };
  window.GC = GC;

  // HU-135: portugués de Brasil. Las páginas /pt/ llegan traducidas; lo que pinta JavaScript se traduce aquí
  // con el mismo diccionario. Lo marcado con lang="es" (textos oficiales y de datos) no se toca.
  const base = raiz.dataset.base || '';
  const PT = (raiz.lang || '').startsWith('pt');
  GC.PT = PT;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-idioma]');
    if (a) guardar('guia-corredor:idioma', a.dataset.idioma);
  });
  if (!PT && leer('guia-corredor:idioma') === 'pt') {
    const alt = document.querySelector('link[rel="alternate"][hreflang="pt-BR"]');
    if (alt) location.replace(new URL(alt.href).pathname + location.search + location.hash);
  }
  const idioma = PT && document.getElementById('datos-idioma');
  if (idioma) {
    const { frases, rutas } = JSON.parse(idioma.textContent);
    const claves = Object.keys(frases).filter((k) => frases[k] && frases[k] !== k).sort((a, b) => b.length - a.length);
    const L = 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
    const re = new RegExp(`(?<![${L}])(?:${claves.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![${L}])`, 'g');
    const tr = (t) => (t && /[A-Za-zÀ-ÿ]/.test(t) ? t.replace(re, (m) => frases[m]) : t);
    GC.tr = tr;
    const fuera = (el) => !el || !el.closest('[lang="es"]:not(html), script, style');
    const tieneRuta = (r) => (rutas.includes('*') ? !/\.\w+$/.test(r) && !r.startsWith('/api/') : r === '/' || rutas.some((x) => x !== '/' && r.startsWith(x)));
    const enlace = (a) => {
      const h = a.getAttribute('href');
      if (!h || a.hasAttribute('data-fijo')) return;
      if (/^(mailto:|https:\/\/wa\.me\/)/.test(h)) {
        const [b, q] = h.split('?');
        if (!q) return;
        const n = `${b}?${q
          .split('&')
          .map((par) => {
            const [k, v = ''] = par.split('=');
            return ['subject', 'body', 'text'].includes(k) ? `${k}=${encodeURIComponent(tr(decodeURIComponent(v)))}` : par;
          })
          .join('&')}`;
        if (n !== h) a.setAttribute('href', n);
        return;
      }
      if (!h.startsWith(`${base}/`) || h.startsWith(`${base}/pt/`) || h.startsWith(`${base}/assets/`)) return;
      const [r, extra = ''] = h.slice(base.length).split(/(?=[?#])/);
      if (tieneRuta(r)) a.setAttribute('href', `${base}/pt${r}${extra}`);
    };
    const traducir = (n) => {
      if (n.nodeType === 3) {
        if (fuera(n.parentElement)) {
          const t = tr(n.nodeValue);
          if (t !== n.nodeValue) n.nodeValue = t;
        }
        return;
      }
      if (n.nodeType !== 1 || !fuera(n)) return;
      ['aria-label', 'title', 'placeholder'].forEach((at) => {
        const v = n.getAttribute(at);
        if (v) {
          const t = tr(v);
          if (t !== v) n.setAttribute(at, t);
        }
      });
      if (n.tagName === 'A') enlace(n);
      n.querySelectorAll('a[href]').forEach(enlace);
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) traducir(w.currentNode);
      n.querySelectorAll('[aria-label],[title],[placeholder]').forEach((e) => fuera(e) && traducir(e));
    };
    // Lo que este mismo archivo ya pintó antes (tema, «hace N días») y lo que pinten los demás después.
    traducir(document.body);
    new MutationObserver((ms) =>
      ms.forEach((m) => {
        if (m.type === 'characterData') traducir(m.target);
        else if (m.type === 'attributes') m.attributeName === 'href' ? enlace(m.target) : traducir(m.target);
        else m.addedNodes.forEach(traducir);
      })
    ).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder', 'href'] });
  }

  // HU-133 (R10): sin conexión se ve lo último guardado, siempre con la hora de esos datos. Al volver la red, se actualiza.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  const generado = document.querySelector('meta[name="generado"]')?.content;
  const horaZona = (z) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: z }).format(new Date(generado));
  function sinRed() {
    if (document.getElementById('banda-sin-red') || !generado) return;
    const b = document.createElement('p');
    b.id = 'banda-sin-red';
    b.className = 'banda-sin-red';
    b.setAttribute('role', 'status');
    const dia = new Date(generado).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Salta' }).replace('.', '');
    b.textContent = PT
      ? `Sem conexão. Você está vendo os dados salvos de ${new Date(generado).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', timeZone: 'America/Campo_Grande' }).replace('.', '')} às ${horaZona('America/Argentina/Salta')} na Argentina (${horaZona('America/Campo_Grande')} em Campo Grande).`
      : `Sin conexión. Ves los datos guardados del ${dia} a las ${horaZona('America/Argentina/Salta')} en Argentina.`;
    document.querySelector('main')?.prepend(b);
  }
  if (!navigator.onLine) sinRed();
  addEventListener('offline', sinRed);
  addEventListener('online', () => {
    if (document.getElementById('banda-sin-red')) location.reload();
  });

  // Buscador de rutas: intercambiar origen y destino
  document.getElementById('intercambiar')?.addEventListener('click', () => {
    const o = document.getElementById('origen');
    const d = document.getElementById('destino');
    [o.value, d.value] = [d.value, o.value];
    o.dispatchEvent(new Event('change', { bubbles: true }));
  });
})();
