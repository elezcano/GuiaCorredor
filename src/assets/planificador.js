// Planificador: itinerario tramo a tramo, resumen del viaje y lista de papeles imprimible.
// La ruta elegida queda en la URL (?desde=0&hasta=7) para poder compartirla.
(function () {
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const form = document.querySelector('.planificar-pagina');
  const origen = document.getElementById('origen');
  const destino = document.getElementById('destino');
  const salida = document.getElementById('resultado-ruta');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enlace = (g, txt) => (g ? `<a href="${datos.base}/guia/${g}/">${esc(txt)}</a>` : esc(txt));
  const estado = (e) => `<span class="estado estado-${esc(e)}">${esc(datos.estados[e] || e)}</span>`;
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  const params = new URLSearchParams(location.search);
  const max = datos.nodos.length - 1;
  const leer = (k, def) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isInteger(v) && v >= 0 && v <= max ? v : def;
  };
  origen.value = String(leer('desde', 0));
  destino.value = String(leer('hasta', max));

  function pintar() {
    const a = Number(origen.value);
    const b = Number(destino.value);
    if (a === b) {
      salida.innerHTML = '<p class="alerta">El origen y el destino son el mismo punto. Elige otro destino.</p>';
      return;
    }
    const ida = a < b;
    const [i, j] = ida ? [a, b] : [b, a];
    let tramos = datos.tramos.slice(i, j).map((t) => ({ ...t, de: ida ? t.desde : t.hasta, a: ida ? t.hasta : t.desde }));
    if (!ida) tramos.reverse();
    const nodo = (id) => datos.nodos.find((n) => n.id === id);

    let km = 0;
    let sinKm = 0;
    let fronteras = 0;
    tramos.forEach((t) => {
      if (typeof t.km === 'number') km += t.km;
      else sinKm++;
      if (t.paso) fronteras++;
    });
    const problemas = tramos.filter((t) => t.estado !== 'operativo');

    const parada = (id) => {
      const n = nodo(id);
      return `<li class="it-parada"><span class="via" aria-hidden="true"></span><div class="contenido"><strong>${esc(n.nombre)}</strong><span>${esc(datos.paises[n.pais])}</span></div></li>`;
    };
    const itinerario = [parada(tramos[0].de)];
    tramos.forEach((t) => {
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

    const papeles = fronteras
      ? `<aside class="checklist">
          <h2>Papeles para cruzar</h2>
          <p class="nota">Esta ruta cruza ${plural(fronteras, 'frontera', 'fronteras')}. Marca lo que ya tienes.</p>
          <ul>${datos.documentosCruce.map((d) => `<li><label><input type="checkbox"><span>${esc(d.nombre)}</span></label></li>`).join('')}</ul>
          <p class="nota">${esc(datos.avisoDocumentos)}</p>
          <button type="button" class="boton boton-linea no-imprimir" id="imprimir">Imprimir lista</button>
        </aside>`
      : `<aside class="checklist"><h2>Papeles</h2><p class="nota">Esta ruta no cruza ninguna frontera.</p></aside>`;

    salida.innerHTML = `
      <div class="resumen-viaje">
        <div><strong>${km ? km.toLocaleString('es-ES') : '?'}</strong><span>${km ? 'km conocidos' : 'km'}${sinKm ? `, faltan ${plural(sinKm, 'tramo', 'tramos')} por medir` : ''}</span></div>
        <div><strong>${fronteras}</strong><span>${fronteras === 1 ? 'frontera' : 'fronteras'}</span></div>
        <div><strong>${tramos.length}</strong><span>tramos</span></div>
      </div>
      ${
        problemas.length
          ? `<p class="alerta"><span><strong>${plural(problemas.length, 'tramo no está', 'tramos no están')} plenamente operativo${problemas.length === 1 ? '' : 's'}.</strong> Revisa su estado antes de salir.</span></p>`
          : ''
      }
      <div class="plan-viaje">
        <ol class="itinerario" aria-label="Itinerario">${itinerario.join('')}</ol>
        ${papeles}
      </div>`;

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
