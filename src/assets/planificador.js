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

  const estado = (e) => `<span class="estado estado-${esc(e)}">${esc(datos.estados[e] || e)}</span>`;
  const enlace = (g, txt) => (g ? `<a href="${datos.base}/guia/${g}/">${esc(txt)}</a>` : esc(txt));
  const nodo = (id) => datos.nodos.find((n) => n.id === id);

  function ayuda(id, nombre) {
    const lista = datos.empresas.filter((e) => e.puntos.includes(id));
    if (!lista.length) return `<p class="it-ayuda-vacia">Aún no hay empresas en ${esc(nombre)}. <a href="${datos.base}/anunciate/">¿Das servicio aquí?</a></p>`;
    const items = lista
      .slice(0, 3)
      .map(
        (e) => `<li class="mini${e.destacada ? ' mini-destacada' : ''}">
          <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(e.cat)}${e.ejemplo ? ', ficha de ejemplo' : ''}</span></span>
          ${e.wa ? `<a class="btn btn-wa btn-pequeno" href="${esc(e.wa)}" rel="nofollow" aria-label="Escribir por WhatsApp a ${esc(e.nombre)}">${I_CHAT}</a>` : ''}
        </li>`
      )
      .join('');
    return `<div class="it-ayuda"><p>Te ayudan aquí</p><ul class="minis">${items}</ul>${
      lista.length > 3 ? `<a class="enlace-mas" href="${datos.base}/directorio/?punto=${id}">Ver las ${lista.length} empresas</a>` : ''
    }</div>`;
  }

  function itinerario(op) {
    const parada = (id) => {
      const n = nodo(id);
      return `<li class="it-parada"><span class="via" aria-hidden="true"></span><div class="contenido"><p class="it-nombre">${esc(n.nombre)}<span>${esc(datos.paises[n.pais])}</span></p>${ayuda(id, n.nombre)}</div></li>`;
    };
    const out = [parada(op.tramos[0].de)];
    op.tramos.forEach((t) => {
      out.push(`<li class="it-tramo tramo-${esc(t.estado)}"><span class="via" aria-hidden="true"></span><div class="contenido">
        <div class="it-fila">${typeof t.km === 'number' ? `<span class="it-km">${GC.km(t.km)}</span>` : '<span class="it-km-falta">Distancia por verificar</span>'}${estado(t.estado)}</div>
        ${t.paso ? `<p class="it-frontera">Frontera: ${enlace(t.paso.guia, t.paso.nombre)}</p>` : ''}
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
    return `<aside class="panel papeles" aria-label="Papeles para cruzar">
      <h3>Papeles para cruzar</h3>
      <p class="nota">${GC.plural(op.fronteras.length, 'frontera', 'fronteras')} con ${esc(nombreCarga().toLowerCase())}. Marca lo que ya tienes.</p>
      <ul>${docs.map((d) => `<li><label><input type="checkbox"><span>${esc(d.nombre)}</span></label></li>`).join('')}</ul>
      <p class="nota">${esc(datos.avisoDocumentos)}</p>
      <button type="button" class="btn btn-borde no-imprimir" data-imprimir>${I_IMPRIMIR}Imprimir lista</button>
    </aside>`;
  }

  function fila(op, k, abierta) {
    const det = `det-${op.id}`;
    const inc = op.problemas.length;
    return `<li class="opcion" data-sin-incidencias="${inc === 0}" data-recomendada="${!!op.recomendada}">
      <button class="opcion-fila" type="button" aria-expanded="${abierta}" aria-controls="${det}">
        <span class="opcion-nombre"><strong>${esc(op.nombre)}${op.recomendada ? '<span class="etiqueta">Recomendada</span>' : ''}</strong><span>${esc(op.fronteras.join(', ') || 'Sin fronteras')}</span></span>
        <span class="dato"><b>${op.fronteras.length}</b><span>${op.fronteras.length === 1 ? 'frontera' : 'fronteras'}</span></span>
        <span class="dato"><b>${op.km ? GC.km(op.km) : '?'}</b><span>${op.sinKm ? `${op.sinKm === 1 ? 'falta 1 tramo' : `faltan ${op.sinKm} tramos`}` : 'distancia total'}</span></span>
        <span class="dato ${inc ? 'dato-alerta' : 'dato-ok'}"><b>${inc}</b><span>${inc === 1 ? 'incidencia' : 'incidencias'}</span></span>
        <span class="chevron">${I_FLECHA}</span>
      </button>
      <div class="opcion-detalle" id="${det}"${abierta ? '' : ' hidden'}>
        ${inc ? `<p class="alerta"><strong>${GC.plural(inc, 'tramo no está', 'tramos no están')} plenamente operativo${inc === 1 ? '' : 's'}.</strong> Revisa su estado antes de salir.</p>` : ''}
        <div class="plan-viaje">${itinerario(op)}${papeles(op)}</div>
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
    const url = location.href;
    const rec = ops.find((o) => o.recomendada);
    const texto = `Ruta ${datos.nodos[a].nombre} a ${datos.nodos[b].nombre} (${rec.nombre.toLowerCase()}): ${GC.plural(rec.fronteras.length, 'frontera', 'fronteras')}, ${GC.plural(
      rec.problemas.length,
      'tramo con incidencias',
      'tramos con incidencias'
    )}. ${url}`;
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
              <button class="chip" type="button" data-f="recomendada" aria-pressed="${filtro === 'recomendada'}">Recomendada</button>
              <button class="chip" type="button" data-f="sin" aria-pressed="${filtro === 'sin'}">Sin incidencias</button>
            </div></div>`
          : ''
      }
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
