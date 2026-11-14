// Planificador: itinerario tramo a tramo con las empresas de cada punto, resumen del viaje
// y lista de papeles imprimible. La ruta queda en la URL (?desde=0&hasta=7) y en este dispositivo.
(function () {
  const GC = window.GC;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const form = document.querySelector('.planificar-pagina');
  const origen = document.getElementById('origen');
  const destino = document.getElementById('destino');
  const salida = document.getElementById('resultado-ruta');
  const esc = GC.esc;
  const enlace = (g, txt) => (g ? `<a href="${datos.base}/guia/${g}/">${esc(txt)}</a>` : esc(txt));
  const estado = (e) => `<span class="estado estado-${esc(e)}">${esc(datos.estados[e] || e)}</span>`;

  const params = new URLSearchParams(location.search);
  const max = datos.nodos.length - 1;
  const leer = (k) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  };
  const guardada = GC.leerRuta();
  origen.value = String(leer('desde') ?? guardada?.desde ?? 0);
  destino.value = String(leer('hasta') ?? guardada?.hasta ?? max);

  const empresasDe = (id) => datos.empresas.filter((e) => e.puntos.includes(id));

  function ayuda(id, nombre) {
    const lista = empresasDe(id);
    const directorio = `${datos.base}/directorio/?punto=${id}`;
    if (!lista.length)
      return `<div class="it-ayuda it-ayuda-vacia">Aún no hay empresas en ${esc(nombre)}. <a href="${datos.base}/anunciate/">¿Das servicio aquí?</a></div>`;
    const items = lista
      .slice(0, 3)
      .map(
        (e) => `<li class="mini${e.destacada ? ' mini-destacada' : ''}">
          <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(e.cat)}${e.ejemplo ? ', ficha de ejemplo' : ''}</span></span>
          ${e.wa ? `<a class="mini-wa" href="${esc(e.wa)}" rel="nofollow">WhatsApp</a>` : ''}
        </li>`
      )
      .join('');
    return `<div class="it-ayuda"><p>Te ayudan aquí</p><ul class="minis">${items}</ul>${
      lista.length > 3 ? `<a class="enlace-mas" href="${directorio}">Ver las ${lista.length} empresas</a>` : ''
    }</div>`;
  }

  function pintar() {
    const a = Number(origen.value);
    const b = Number(destino.value);
    if (a === b) {
      salida.innerHTML = '<p class="alerta">El origen y el destino son el mismo punto. Elige otro destino.</p>';
      return;
    }
    GC.guardarRuta(a, b);
    const r = GC.calcular(datos, a, b);
    const nodo = (id) => datos.nodos.find((n) => n.id === id);

    const parada = (id) => {
      const n = nodo(id);
      return `<li class="it-parada"><span class="via" aria-hidden="true"></span><div class="contenido">
        <div><strong>${esc(n.nombre)}</strong><span>${esc(datos.paises[n.pais])}</span></div>
        ${ayuda(id, n.nombre)}
      </div></li>`;
    };
    const itinerario = [parada(r.tramos[0].de)];
    r.tramos.forEach((t) => {
      itinerario.push(`<li class="it-tramo tramo-${esc(t.estado)}"><span class="via" aria-hidden="true"></span><div class="contenido">
        <div class="it-fila">
          ${typeof t.km === 'number' ? `<span class="it-km">${t.km.toLocaleString('es-ES')} km</span>` : '<span class="it-km-falta">Distancia por verificar</span>'}
          ${estado(t.estado)}
        </div>
        ${t.guia ? `<p class="it-nota">${enlace(t.guia, 'Ver el tramo en la guía')}</p>` : ''}
        ${t.paso ? `<div class="it-frontera"><b>Frontera:</b> ${enlace(t.paso.guia, t.paso.nombre)}${t.alternativa ? `. Alternativa: ${enlace(t.alternativa.guia, t.alternativa.nombre)}` : ''}</div>` : ''}
        ${t.nota ? `<p class="it-nota">${esc(t.nota)}</p>` : ''}
      </div></li>`);
      itinerario.push(parada(t.a));
    });

    const papeles = r.fronteras
      ? `<aside class="checklist">
          <h2>Papeles para cruzar</h2>
          <p class="nota">Esta ruta cruza ${GC.plural(r.fronteras, 'frontera', 'fronteras')}. Marca lo que ya tienes.</p>
          <ul>${datos.documentosCruce.map((d) => `<li><label><input type="checkbox"><span>${esc(d.nombre)}</span></label></li>`).join('')}</ul>
          <p class="nota">${esc(datos.avisoDocumentos)}</p>
          <button type="button" class="boton boton-linea no-imprimir" id="imprimir">Imprimir lista</button>
        </aside>`
      : `<aside class="checklist"><h2>Papeles</h2><p class="nota">Esta ruta no cruza ninguna frontera.</p></aside>`;

    salida.innerHTML = `
      <div class="resumen-viaje">
        <div><strong>${r.km ? r.km.toLocaleString('es-ES') : '?'}</strong><span>${r.km ? 'km conocidos' : 'km'}${r.sinKm ? `, ${r.sinKm === 1 ? 'falta 1 tramo' : `faltan ${r.sinKm} tramos`} por medir` : ''}</span></div>
        <div><strong>${r.fronteras}</strong><span>${r.fronteras === 1 ? 'frontera' : 'fronteras'}</span></div>
        <div><strong>${r.tramos.length}</strong><span>tramos</span></div>
      </div>
      ${
        r.problemas.length
          ? `<p class="alerta"><span><strong>${GC.plural(r.problemas.length, 'tramo no está', 'tramos no están')} plenamente operativo${r.problemas.length === 1 ? '' : 's'}.</strong> Revisa su estado antes de salir.</span></p>`
          : ''
      }
      <div class="plan-viaje">
        <ol class="itinerario" aria-label="Itinerario">${itinerario.join('')}</ol>
        ${papeles}
      </div>
      <p class="nota guardado">Ruta guardada en este dispositivo: la verás en la portada al volver.</p>`;

    const imp = document.getElementById('imprimir');
    if (imp) imp.addEventListener('click', () => window.print());
  }

  function actualizar() {
    const url = new URL(location.href);
    url.searchParams.set('desde', origen.value);
    url.searchParams.set('hasta', destino.value);
    history.replaceState(null, '', url);
    pintar();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    actualizar();
  });
  origen.addEventListener('change', actualizar);
  destino.addEventListener('change', actualizar);
  pintar();
})();
