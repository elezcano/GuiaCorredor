// Resultados de ruta, al estilo de un buscador de vuelos: opciones comparables, filtros,
// itinerario desplegable con empresas en cada parada, papeles según la carga y compartir.
// La búsqueda queda en la URL (?desde=&hasta=&carga=) y en este dispositivo.
(function () {
  const GC = window.GC;
  const esc = GC.esc;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const form = document.querySelector('.buscador');
  const origen = document.getElementById('origen');
  const destino = document.getElementById('destino');
  const salida = document.getElementById('resultado');
  const max = datos.nodos.length - 1;
  let filtro = 'todas';

  const ICONO = (d) => `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const I_CHAT = ICONO('M4 20l1.5-4.5A8 8 0 1 1 8.5 19z');
  const I_ENLACE = ICONO('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1');
  const I_FLECHA = ICONO('M6 9l6 6 6-6');
  const I_IMPRIMIR = ICONO('M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z');

  const params = new URLSearchParams(location.search);
  const guardada = GC.leerRuta();
  const entero = (k) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  };
  origen.value = String(entero('desde') ?? guardada?.desde ?? 0);
  destino.value = String(entero('hasta') ?? guardada?.hasta ?? max);
  const cargaInicial = params.get('carga') || guardada?.carga;
  if (cargaInicial) {
    const c = form.querySelector(`input[name="carga"][value="${CSS.escape(cargaInicial)}"]`);
    if (c) c.checked = true;
  }
  const carga = () => form.querySelector('input[name="carga"]:checked')?.value || 'general';
  const nombreCarga = () => datos.tiposCarga.find((c) => c.id === carga())?.nombre || '';

  // Semáforo operativo: mismo criterio que scripts/lib.mjs (operativaDe).
  const operativaDe = (valor, tipo = 'paso') =>
    valor === 'operativo' ? 'abierto' : ['restricciones', 'intermitente', 'cierre-programado'].includes(valor) ? 'restricciones' : valor === 'cerrado' ? 'cerrado' : valor === 'en-obras' ? (tipo === 'paso' ? 'cerrado' : 'restricciones') : 'sin-confirmar';
  const estado = (e, op = operativaDe(e)) => {
    const o = datos.operativa[op];
    const det = datos.estados[e] && !['pendiente', 'operativo', 'restricciones'].includes(e) && datos.estados[e] !== o.texto ? `<span class="estado-detalle">· ${esc(datos.estados[e])}</span>` : '';
    return `<span class="estado estado-${esc(e)} op-${op}">${o.icono}<span class="estado-texto">${esc(o.texto)}</span>${det}</span>`;
  };
  const anioActual = new Date().toISOString().slice(0, 4);
  const fechaCorta = (iso) =>
    new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(iso.slice(0, 4) !== anioActual ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace('.', '');
  const TAGS = { calculado: 'Calculado', 'sin-dato': 'Sin dato', estimado: 'Estimación provisional', verificado: 'Verificado', 'sin-verificar': 'Sin verificar', ruta: 'Dato de la ruta' };
  const tag = (t) => `<span class="tag tag-${t}">${TAGS[t]}</span>`;
  // Mismo criterio que el resto del portal: solo lo verificado se muestra como confirmado.
  function vista(v) {
    if (v?.confirmado) return `${estado(v.valor, v.op)}<span class="estado-fecha">Verificado el ${esc(fechaCorta(v.verificado))}</span>`;
    if (!v?.ultimo) return `${estado('pendiente')}<span class="estado-fecha">Sin datos</span>`;
    const origen = v.fuente?.tipo ? `, ${datos.tiposFuente[v.fuente.tipo]}` : '';
    const dato = v.ultimo === 'pendiente' ? 'Sin estado confirmado' : `Último dato: ${(datos.estados[v.ultimo] || v.ultimo).toLowerCase()}`;
    return `${estado('pendiente')}<span class="estado-fecha">${esc(dato)}, ${v.publicado ? esc(fechaCorta(v.publicado)) : 'sin fecha'}${esc(origen)}</span>`;
  }
  const enlace = (g, txt) => (g ? `<a href="${datos.base}/guia/${g}/">${esc(txt)}</a>` : esc(txt));
  const nodo = (id) => datos.nodos.find((n) => n.id === id);

  function ayuda(id, nombre) {
    const lista = datos.empresas.filter((e) => e.puntos.includes(id));
    if (!lista.length) return `<p class="it-ayuda-vacia">Aún no hay empresas en ${esc(nombre)}. <a href="${datos.base}/anunciate/">¿Das servicio aquí?</a></p>`;
    const items = lista
      .slice(0, 3)
      .map(
        (e) => `<li class="mini${e.destacada ? ' mini-destacada' : ''}">
          <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(e.cat)}${''}</span></span>
          ${e.wa ? `<a class="btn btn-wa btn-pequeno" href="${esc(e.wa)}" rel="nofollow" aria-label="Escribir por WhatsApp a ${esc(e.nombre)}">${I_CHAT}</a>` : ''}
        </li>`
      )
      .join('');
    return `<div class="it-ayuda"><p>Te ayudan aquí</p><ul class="minis">${items}</ul>${
      lista.length > 3 ? `<a class="enlace-mas" href="${datos.base}/directorio/?punto=${id}">Ver las ${lista.length} empresas</a>` : ''
    }</div>`;
  }

  // Incidencias activas del tramo (las mismas que en Avisos y en la ficha del tramo).
  const enlaceAviso = (i) => `<a href="${esc(datos.avisos)}#inc-${esc(i.id)}">Ver aviso</a>`;
  function avisosTramo(op, t) {
    return op
      .incDe(t)
      .map((i) => `<p class="it-aviso"><strong>${esc(i.tipo)}:</strong> ${esc(i.texto)} ${enlaceAviso(i)}</p>`)
      .join('');
  }

  const paisesDe = (op) => [...new Set(op.tramos.flatMap((t) => [nodo(t.de).pais, nodo(t.a).pais]))];
  // Festivos de los próximos 21 días en los países que cruza la ruta.
  function festivosLista(op) {
    const ps = new Set(paisesDe(op));
    const hoy = new Date().toISOString().slice(0, 10);
    const limite = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
    return (datos.festivos || []).filter((f) => ps.has(f.pais) && f.fecha >= hoy && f.fecha <= limite);
  }

  // Ficha de resultados: resumen de la opción con menos incidencias.
  function resumen(ops, a, b) {
    const op = ops.find((o) => o.recomendada);
    const fila = (t, c) => `<div class="res-fila"><dt>${t}</dt><dd>${c}</dd></div>`;
    const pasos = op.tramos.filter((t) => t.paso);
    const conf = op.tramos.filter((t) => t.vista?.confirmado).length;
    const obras = op.tramos.filter((t) => !t.vista?.confirmado && t.vista?.ultimo === 'en-obras').length;
    const operativos = op.tramos.filter((t) => !t.vista?.confirmado && t.vista?.ultimo && t.vista.ultimo !== 'en-obras').length;
    const sinDatos = op.tramos.filter((t) => !t.vista?.ultimo).length;
    const docs = datos.documentosCruce.filter((d) => !d.cargas || d.cargas.includes(carga()));
    const fest = festivosLista(op);
    const alts = ops.filter((o) => o !== op);
    const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const nombreT = (t) => `${nodo(t.de).nombre} – ${nodo(t.a).nombre}`;
    const sinEst = op.sinKm - op.estimados.length;
    const distancia = op.sinKm
      ? `<p>${op.conKm ? `${GC.km(op.km)} con fuente en ${op.conKm} de ${op.tramos.length} tramos ${tag('calculado')}` : 'Ningún tramo tiene distancia con fuente.'}</p>
         ${op.estimados.length ? `<p>+ ≈ ${GC.km(op.kmEstimado)} estimados ${tag('estimado')} en ${GC.plural(op.estimados.length, 'tramo sin verificar', 'tramos sin verificar')}:</p>
         <ul class="res-lista">${op.estimados.map((t) => `<li>${esc(nombreT(t))}: ≈ ${GC.km(t.estimacion.km)}${t.estimacion.imprecisa ? ' (muy aproximado)' : ''}</li>`).join('')}</ul>` : ''}
         ${sinEst ? `<p>${GC.plural(sinEst, 'tramo sin dato ni estimación', 'tramos sin dato ni estimación')} ${tag('sin-dato')}</p>` : ''}
         <p class="res-nota">Total orientativo: más de ${GC.km(Math.round(op.km + op.kmEstimado))}. Las estimaciones son provisionales, en línea recta: por carretera la distancia es mayor.</p>`
      : `<p>${GC.km(op.km)} ${tag('calculado')}</p>`;
    return `<section class="panel ficha-resultado" aria-labelledby="t-resumen">
      <h3 id="t-resumen">Resumen del viaje</h3>
      <p class="nota">${esc(op.nombre)}${ops.length > 1 ? ', la opción con menos incidencias registradas' : ''}.</p>
      <dl class="res-datos">
        ${fila('Origen y destino', `${esc(nodo(datos.nodos[a].id).nombre)} → ${esc(nodo(datos.nodos[b].id).nombre)} ${tag('ruta')}`)}
        ${fila('Distancia', distancia)}
        ${fila('Países', `${esc(paisesDe(op).map((p) => datos.paises[p]).join(' → '))} ${tag('ruta')}`)}
        ${fila(
          'Pasos fronterizos',
          pasos.length
            ? `<ul>${pasos.map((t) => `<li>${enlace(t.paso.guia, t.paso.nombre)} ${vista(t.vista)} ${tag(t.vista?.confirmado ? 'verificado' : 'sin-verificar')}</li>`).join('')}</ul>`
            : 'Ninguno'
        )}
        ${fila(
          'Tramos',
          `${GC.plural(op.tramos.length, 'tramo', 'tramos')}: ${conf} confirmados, ${obras} en obras según el último dato, ${operativos} operativos según el último dato, ${sinDatos} sin datos ${tag(conf === op.tramos.length ? 'verificado' : 'sin-verificar')}`
        )}
        ${fila(
          'Incidencias',
          op.problemas.length
            ? `<ul>${op.problemas.map((i) => `<li><strong>${esc(i.tipo)}</strong> · ${esc(i.ubicacion)}: ${esc(i.texto)} <span class="res-nota">${esc(i.fuente)}${i.publicado ? `, ${esc(fechaCorta(i.publicado))}` : ''}</span> ${tag(i.nivel === 'verificado' ? 'verificado' : 'sin-verificar')} ${enlaceAviso(i)}</li>`).join('')}</ul>`
            : 'Ninguna registrada'
        )}
        ${fila(
          'Festivos, próximos 21 días',
          fest.length
            ? `<ul>${fest.map((f) => `<li><strong>${esc(fmt(f.fecha))}</strong> ${esc(datos.paises[f.pais])}: ${esc(f.nombre)} ${tag(f.porConfirmar ? 'sin-verificar' : 'verificado')}</li>`).join('')}</ul><a class="enlace-mas" href="${esc(datos.calendario)}">Abrir el calendario aduanero</a>`
            : `Ninguno en ${esc(paisesDe(op).map((p) => datos.paises[p]).join(', '))}. <a href="${esc(datos.calendario)}">Calendario aduanero</a>`
        )}
        ${fila('Documentación', op.fronteras.length ? `${GC.plural(docs.length, 'documento', 'documentos')} para ${esc(nombreCarga().toLowerCase())}. <a href="#papeles-${op.id}" data-abrir="det-${op.id}">Ver la lista</a>` : 'No cruza fronteras.')}
        ${fila(
          'Alternativas',
          alts.length
            ? `<ul>${alts
                .map((o) => `<li>${esc(o.nombre)}: ${GC.plural(o.problemas.length, 'incidencia', 'incidencias')}, ${o.sinKm ? `más de ${GC.km(Math.round(o.km + o.kmEstimado))} ${tag('estimado')}` : GC.km(o.km)} <button class="btn-texto" type="button" data-abrir="det-${o.id}">Ver opción</button></li>`)
                .join('')}</ul>`
            : 'No hay alternativas documentadas para este recorrido.'
        )}
      </dl>
      <p class="res-leyenda"><b>Verificado:</b> revisado por el responsable editorial. <b>Sin verificar:</b> dato publicado por la fuente, sin revisar. <b>Calculado:</b> suma de datos con fuente. <b>Estimación provisional:</b> línea recta entre puntos con coordenadas; por carretera es más.</p>
    </section>`;
  }

  // Tiempo de cruce reportado en el sentido del viaje.
  function cruce(t) {
    const idx = (id) => datos.nodos.findIndex((n) => n.id === id);
    const sentido = idx(t.a) > idx(t.de) ? 'chile' : 'brasil';
    const s = datos.cruces.porPaso[t.paso.id]?.[sentido];
    if (!s?.mediana) return '';
    const tramo = datos.cruces.tramos.find((x) => x.id === s.mediana);
    return `<p class="it-cruce">Tiempo de cruce: <strong>${esc(tramo.nombre)}</strong> <span>${GC.plural(s.n, 'reporte', 'reportes')} en ${datos.cruces.dias} días</span></p>`;
  }

  function itinerario(op) {
    const parada = (id) => {
      const n = nodo(id);
      return `<li class="it-parada"><span class="via" aria-hidden="true"></span><div class="contenido"><p class="it-nombre">${esc(n.nombre)}<span>${esc(datos.paises[n.pais])}</span></p>${ayuda(id, n.nombre)}</div></li>`;
    };
    const out = [parada(op.tramos[0].de)];
    op.tramos.forEach((t) => {
      out.push(`<li class="it-tramo tramo-${esc(t.estado)} tramo-op-${esc(t.vista?.op || "sin-confirmar")}"><span class="via" aria-hidden="true"></span><div class="contenido">
        <div class="it-fila">${
          typeof t.km === 'number'
            ? `<span class="it-km">${GC.km(t.km)}</span>${t.kmTipo === 'calculado' ? tag('calculado') : ''}`
            : t.estimacion
              ? `<span class="it-km-falta">≈ ${GC.km(t.estimacion.km)}</span>${tag('estimado')}`
              : `<span class="it-km-falta">Distancia sin fuente</span>${tag('sin-dato')}`
        }<span class="it-estado">${vista(t.vista)}</span></div>
        ${t.paso ? `<p class="it-frontera">Frontera: ${enlace(t.paso.guia, t.paso.nombre)}</p>` : ''}
        ${t.paso ? cruce(t) : ''}
        ${typeof t.km !== 'number' && t.estimacion ? `<p class="it-nota it-estimacion">${esc(t.estimacion.aviso)}</p>` : ''}
        ${avisosTramo(op, t)}
        ${t.guia ? `<p class="it-nota">${enlace(t.guia, 'Abrir el tramo en la guía')}</p>` : ''}
        ${t.nota ? `<p class="it-nota">${esc(t.nota)}</p>` : ''}
      </div></li>`);
      out.push(parada(t.a));
    });
    return `<ol class="itinerario" aria-label="Itinerario">${out.join('')}</ol>`;
  }

  function papeles(op) {
    if (!op.fronteras.length) return `<aside class="panel papeles"><h3>Papeles</h3><p class="nota">Esta ruta no cruza ninguna frontera.</p></aside>`;
    const docs = datos.documentosCruce.filter((d) => !d.cargas || d.cargas.includes(carga()));
    return `<aside class="panel papeles" id="papeles-${op.id}" aria-label="Papeles para cruzar">
      <h3>Papeles para cruzar</h3>
      <p class="nota">${GC.plural(op.fronteras.length, 'frontera', 'fronteras')} con ${esc(nombreCarga().toLowerCase())}. Marca lo que ya tienes.</p>
      <ul>${docs.map((d) => `<li><label><input type="checkbox"><span>${esc(d.nombre)}</span></label></li>`).join('')}</ul>
      <p class="nota">${esc(datos.avisoDocumentos)}</p>
      <button type="button" class="btn btn-borde no-imprimir" data-imprimir>${I_IMPRIMIR}Imprimir lista</button>
    </aside>`;
  }

  let ops_n = 1;
  function fila(op, k, abierta) {
    const det = `det-${op.id}`;
    const inc = op.problemas.length;
    return `<li class="opcion" data-sin-incidencias="${inc === 0}" data-recomendada="${!!op.recomendada}">
      <button class="opcion-fila" type="button" aria-expanded="${abierta}" aria-controls="${det}">
        <span class="opcion-nombre"><strong>${esc(op.nombre)}${op.recomendada && ops_n > 1 ? '<span class="etiqueta">Menos incidencias</span>' : ''}</strong><span>${esc(op.fronteras.join(', ') || 'Sin fronteras')}</span></span>
        <span class="dato"><b>${op.fronteras.length}</b><span>${op.fronteras.length === 1 ? 'frontera' : 'fronteras'}</span></span>
        <span class="dato"><b>${op.sinKm ? `≈ ${GC.km(Math.round(op.km + op.kmEstimado))}` : GC.km(op.km)}</b><span>${op.sinKm ? 'en parte estimado' : 'con fuente'}</span></span>
        <span class="dato ${inc ? 'dato-alerta' : 'dato-ok'}"><b>${inc}</b><span>${inc === 1 ? 'incidencia' : 'incidencias'}</span></span>
        <span class="chevron">${I_FLECHA}</span>
      </button>
      <div class="opcion-detalle" id="${det}"${abierta ? '' : ' hidden'}>
        ${inc ? `<p class="alerta"><strong>${GC.plural(inc, 'incidencia registrada', 'incidencias registradas')} en esta ruta.</strong> Revisa los avisos antes de salir.</p>` : ''}
        ${op.sinVerificar ? `<p class="aviso aviso-por-verificar"><span><strong>${GC.plural(op.sinVerificar, 'tramo sin verificar', 'tramos sin verificar')}.</strong> Su estado se muestra como «Por verificar» con el último dato conocido.</span></p>` : ''}
        <div class="plan-viaje">${itinerario(op)}<div class="plan-lateral">${papeles(op)}</div></div>
      </div>
    </li>`;
  }

  function pintar() {
    const a = Number(origen.value);
    const b = Number(destino.value);
    if (a === b) {
      salida.innerHTML = '<p class="aviso">El origen y el destino son el mismo punto. Elige otro destino.</p>';
      return;
    }
    GC.guardarRuta(a, b, carga());
    const ops = GC.opciones(datos, a, b);
    ops_n = ops.length;
    const url = location.href;
    const rec = ops.find((o) => o.recomendada);
    const texto = `Ruta ${datos.nodos[a].nombre} a ${datos.nodos[b].nombre} (${rec.nombre.toLowerCase()}): ${GC.plural(rec.fronteras.length, 'frontera', 'fronteras')}, ${GC.plural(
      rec.problemas.length,
      'incidencia registrada',
      'incidencias registradas'
    )}. Estados sin verificar: confirma antes de salir. ${url}`;
    salida.innerHTML = `
      <div class="resultado-cabeza">
        <div><h2>${esc(datos.nodos[a].nombre)} a ${esc(datos.nodos[b].nombre)}</h2><p>${GC.plural(ops.length, 'opción', 'opciones')} de ruta para ${esc(nombreCarga().toLowerCase())}.</p></div>
        <div class="acciones">
          <a class="btn btn-wa" href="https://wa.me/?text=${encodeURIComponent(texto)}" rel="noopener">${I_CHAT}Compartir por WhatsApp</a>
          <button class="btn btn-borde" type="button" id="copiar">${I_ENLACE}<span>Copiar enlace</span></button>
        </div>
      </div>
      ${
        ops.length > 1
          ? `<div class="resultado-filtros"><div class="chips" role="group" aria-label="Filtrar opciones">
              <button class="chip" type="button" data-f="todas" aria-pressed="${filtro === 'todas'}">Todas</button>
              <button class="chip" type="button" data-f="recomendada" aria-pressed="${filtro === 'recomendada'}">Menos incidencias</button>
              <button class="chip" type="button" data-f="sin" aria-pressed="${filtro === 'sin'}">Sin incidencias</button>
            </div></div>`
          : ''
      }
      ${resumen(ops, a, b)}
      <h3 class="titulo-opciones">${ops.length > 1 ? 'Opciones de ruta' : 'Itinerario'}</h3>
      <ul class="opciones">${ops.map((op, k) => fila(op, k, op.recomendada)).join('')}</ul>
      <p class="vacio" id="sin-opciones" hidden>Ninguna opción está libre de incidencias ahora mismo. <button class="btn-texto" type="button" data-f="todas">Ver todas</button></p>
      <p class="texto-suave nota-guardado">Guardamos esta búsqueda en este dispositivo para que la tengas al volver.</p>`;
    aplicarFiltro();
  }

  function aplicarFiltro() {
    let visibles = 0;
    salida.querySelectorAll('.opcion').forEach((li) => {
      const ok = filtro === 'todas' || (filtro === 'recomendada' && li.dataset.recomendada === 'true') || (filtro === 'sin' && li.dataset.sinIncidencias === 'true');
      li.hidden = !ok;
      if (ok) visibles++;
    });
    salida.querySelectorAll('[data-f]').forEach((b) => b.matches('.chip') && b.setAttribute('aria-pressed', String(b.dataset.f === filtro)));
    const vacio = document.getElementById('sin-opciones');
    if (vacio) vacio.hidden = visibles > 0;
  }

  salida.addEventListener('click', (e) => {
    const filaBtn = e.target.closest('.opcion-fila');
    if (filaBtn) {
      const abierta = filaBtn.getAttribute('aria-expanded') === 'true';
      filaBtn.setAttribute('aria-expanded', String(!abierta));
      document.getElementById(filaBtn.getAttribute('aria-controls')).hidden = abierta;
      return;
    }
    const f = e.target.closest('[data-f]');
    if (f) {
      filtro = f.dataset.f;
      aplicarFiltro();
      return;
    }
    if (e.target.closest('[data-imprimir]')) window.print();
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) {
      const det = document.getElementById(abrir.dataset.abrir);
      if (det) {
        det.hidden = false;
        det.closest('.opcion').hidden = false;
        det.previousElementSibling?.setAttribute('aria-expanded', 'true');
        if (abrir.tagName === 'BUTTON') det.closest('.opcion').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }
    const copiar = e.target.closest('#copiar');
    if (copiar) {
      navigator.clipboard?.writeText(location.href).then(
        () => (copiar.querySelector('span').textContent = 'Enlace copiado'),
        () => (copiar.querySelector('span').textContent = 'No se pudo copiar')
      );
    }
  });

  function actualizar() {
    const url = new URL(location.href);
    url.searchParams.set('desde', origen.value);
    url.searchParams.set('hasta', destino.value);
    url.searchParams.set('carga', carga());
    history.replaceState(null, '', url);
    pintar();
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    actualizar();
  });
  form.addEventListener('change', actualizar);
  pintar();
})();
