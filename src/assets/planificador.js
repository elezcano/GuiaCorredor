// Planificador de ruta: muestra tramos, pasos, estado y documentos entre dos nodos del corredor.
(function () {
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const origen = document.getElementById('origen');
  const destino = document.getElementById('destino');
  const salida = document.getElementById('resultado-ruta');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nombre = (id) => datos.nodos.find((n) => n.id === id)?.nombre || id;
  const enlace = (g, txt) => (g ? `<a href="${datos.base}/guia/${g}/">${esc(txt)}</a>` : esc(txt));
  const estado = (e) => `<span class="estado estado-${esc(e)}">${esc(datos.estados[e] || e)}</span>`;

  destino.value = String(datos.nodos.length - 1);

  function pintar() {
    let a = Number(origen.value);
    let b = Number(destino.value);
    if (a === b) {
      salida.innerHTML = '<p class="vacio">Elige un origen y un destino distintos.</p>';
      return;
    }
    const sentido = a < b ? 1 : -1;
    const [i, j] = a < b ? [a, b] : [b, a];
    let tramos = datos.tramos.slice(i, j);
    if (sentido < 0) tramos = tramos.slice().reverse();

    let km = 0;
    let sinDato = 0;
    let pasos = 0;
    const filas = tramos
      .map((t) => {
        const [de, a2] = sentido > 0 ? [t.desde, t.hasta] : [t.hasta, t.desde];
        if (typeof t.km === 'number') km += t.km;
        else sinDato++;
        if (t.paso) pasos++;
        const paso = t.paso
          ? `<div class="fila-paso">Frontera: ${enlace(t.paso.guia, t.paso.nombre)}${t.alternativa ? ` · alternativa: ${enlace(t.alternativa.guia, t.alternativa.nombre)}` : ''}</div>`
          : '';
        return `<tr>
          <td>${enlace(t.guia, `${nombre(de)} → ${nombre(a2)}`)}${paso}${t.nota ? `<div class="nota">${esc(t.nota)}</div>` : ''}</td>
          <td class="num">${typeof t.km === 'number' ? t.km.toLocaleString('es-ES') + ' km' : '<span class="nota">por verificar</span>'}</td>
          <td>${estado(t.estado)}</td>
        </tr>`;
      })
      .join('');

    const alertas = tramos.filter((t) => t.estado !== 'operativo');
    const docs = pasos
      ? `<section class="bloque"><h2>Documentos para cruzar</h2><ul>${datos.documentosCruce
          .map((d) => `<li>${esc(d.nombre)}</li>`)
          .join('')}</ul><p class="nota">${esc(datos.avisoDocumentos)}</p></section>`
      : '';

    salida.innerHTML = `
      <div class="resumen-ruta">
        <div><strong>${tramos.length}</strong><span>tramos</span></div>
        <div><strong>${pasos}</strong><span>fronteras</span></div>
        <div><strong>${km ? km.toLocaleString('es-ES') + ' km' : '—'}</strong><span>${sinDato ? `conocidos (${sinDato} tramo${sinDato > 1 ? 's' : ''} por verificar)` : 'en total'}</span></div>
      </div>
      ${alertas.length ? `<p class="borrador">Atención: ${alertas.length} tramo${alertas.length > 1 ? 's' : ''} de esta ruta no está${alertas.length > 1 ? 'n' : ''} plenamente operativo${alertas.length > 1 ? 's' : ''}.</p>` : ''}
      <table class="tabla"><thead><tr><th>Tramo</th><th>Distancia</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>
      ${docs}`;
  }

  origen.addEventListener('change', pintar);
  destino.addEventListener('change', pintar);
  pintar();
})();
