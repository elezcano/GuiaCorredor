// HU-133 (R5, R9): portada «Hoy». Con una ruta guardada en este dispositivo, su veredicto en una frase
// (mismo cálculo que el planificador, comun.js → GC.diag), sus pasos primero y una barra de acciones.
// Sin ruta guardada se ve el buscador. Nada sale del dispositivo.
(function () {
  const GC = window.GC;
  const esc = GC.esc;

  // «hace N min» desde que se generaron los datos.
  const hora = document.querySelector('.hoy-hora[data-generado]');
  if (hora) {
    const min = Math.round((Date.now() - Date.parse(hora.dataset.generado)) / 60000);
    if (min >= 0 && min < 48 * 60) {
      const e = document.createElement('span');
      e.className = 'hoy-edad';
      e.textContent = min < 1 ? ' · ahora mismo' : min < 60 ? ` · hace ${min} min` : ` · hace ${Math.floor(min / 60)} h`;
      hora.appendChild(e);
    }
  }

  const ruta = GC.leerMiRuta();
  if (!ruta) return;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const max = datos.nodos.length - 1;
  if (ruta.desde > max || ruta.hasta > max) return;

  const DG = GC.diag(datos);
  const ops = GC.opciones(datos, ruta.desde, ruta.hasta);
  const dgs = Object.fromEntries(ops.map((o) => [o.id, DG.diagnostico(o)]));
  const op = DG.recomendar(ops, dgs);
  const dg = dgs[op.id];
  const { titulo, porque } = DG.frase(op, dg, ops, dgs);
  const nombre = (i) => datos.nodos[i].nombre;
  const recorrido = `${nombre(ruta.desde)} → ${nombre(ruta.hasta)}`;
  const enlace = `${datos.base}/planificador/?desde=${ruta.desde}&hasta=${ruta.hasta}${ruta.carga ? `&carga=${encodeURIComponent(ruta.carga)}` : ''}`;
  const forma = { verde: 'abierto', ambar: 'restricciones', rojo: 'cerrado' }[dg.nivel];
  const icono = datos.operativa[forma].icono;
  const texto = `${recorrido}: ${titulo}. ${porque} Confírmalo antes de salir. ${new URL(enlace, location.origin).href}`;

  const panel = document.getElementById('tu-ruta');
  panel.className = `veredicto veredicto-${dg.nivel}`;
  panel.innerHTML = `
    <p class="ruta-pill"><strong>${esc(recorrido)}</strong><button type="button" class="btn-texto" id="olvidar-ruta">Quitar</button></p>
    <div class="veredicto-caja"><span class="veredicto-forma">${icono}</span><div><p class="veredicto-titulo">${esc(titulo)}</p>${porque ? `<p class="veredicto-porque">${esc(porque)}</p>` : ''}</div></div>
    <div class="acc"><a class="btn btn-principal" href="${enlace}">Ver ruta</a><a class="ib wa" href="https://wa.me/?text=${encodeURIComponent(texto)}" rel="noopener" aria-label="Compartir por WhatsApp" title="Compartir por WhatsApp">${datos.iconos.chat}</a></div>`;
  panel.hidden = false;

  // El buscador queda plegado debajo, para cambiar de ruta.
  const buscar = document.getElementById('sin-ruta');
  const h2 = buscar.querySelector('h2');
  const formBuscar = buscar.querySelector('form');
  h2.innerHTML = '<button type="button" class="hoy-plegar" aria-expanded="false">Planificar otra ruta</button>';
  formBuscar.hidden = true;
  h2.firstChild.addEventListener('click', (e) => {
    formBuscar.hidden = !formBuscar.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!formBuscar.hidden));
  });
  document.getElementById('origen').value = String(ruta.desde);
  document.getElementById('destino').value = String(ruta.hasta);

  // Tus pasos primero, marcados.
  const ids = new Set(op.tramos.filter((t) => t.paso).map((t) => t.paso.id));
  ops.forEach((o) => o.tramos.forEach((t) => t.paso && ids.add(t.paso.id)));
  document.querySelectorAll('.tablero-fila[data-paso]').forEach((f) => f.classList.toggle('en-tu-ruta', ids.has(f.dataset.paso)));
  if (ids.size) document.getElementById('t-pasos-hoy').textContent = 'Tus pasos';

  document.getElementById('olvidar-ruta').addEventListener('click', () => {
    GC.olvidarMiRuta();
    location.reload();
  });
})();
