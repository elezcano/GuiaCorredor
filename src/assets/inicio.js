// Portada: si hay una ruta guardada, la muestra como panel personal, rellena el buscador y la resalta en la carretera.
(function () {
  const GC = window.GC;
  const ruta = GC.leerRuta();
  if (!ruta) return;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const max = datos.nodos.length - 1;
  if (ruta.desde > max || ruta.hasta > max) return;

  const ops = GC.opciones(datos, ruta.desde, ruta.hasta);
  const r = ops.find((o) => o.recomendada);
  const nombre = (i) => datos.nodos[i].nombre;
  const panel = document.getElementById('tu-ruta');
  const enlace = `${datos.base}/planificador/?desde=${ruta.desde}&hasta=${ruta.hasta}${ruta.carga ? `&carga=${encodeURIComponent(ruta.carga)}` : ''}`;
  const incidencias = r.problemas.length
    ? `<li class="tu-ruta-alerta">${GC.plural(r.problemas.length, 'tramo con incidencias', 'tramos con incidencias')}</li>`
    : '<li class="tu-ruta-ok">Todos los tramos operativos</li>';

  panel.innerHTML = `
    <div class="tu-ruta-cabeza">
      <p>Tu última ruta</p>
      <h2>${GC.esc(nombre(ruta.desde))} a ${GC.esc(nombre(ruta.hasta))}</h2>
    </div>
    <ul class="tu-ruta-datos">
      ${incidencias}
      <li>${GC.plural(r.fronteras.length, 'frontera', 'fronteras')}${ops.length > 1 ? `, ${ops.length} opciones` : ''}</li>
      <li>${r.km ? `${GC.km(r.km)} conocidos` : 'Distancia por verificar'}</li>
    </ul>
    <div class="tu-ruta-acciones">
      <a class="btn btn-principal" href="${enlace}">Abrir mi ruta</a>
      <button type="button" class="btn-texto" id="olvidar-ruta">Quitar</button>
    </div>`;
  panel.hidden = false;

  document.getElementById('origen').value = String(ruta.desde);
  document.getElementById('destino').value = String(ruta.hasta);


  const [i, j] = r.rango;
  const carretera = document.getElementById('ruta-corredor');
  carretera?.classList.add('con-ruta');
  carretera?.querySelectorAll('li').forEach((li) => {
    const k = Number(li.dataset.i);
    li.classList.toggle('en-ruta', li.classList.contains('parada') ? k >= i && k <= j : k >= i && k < j);
  });

  document.getElementById('olvidar-ruta').addEventListener('click', () => {
    GC.olvidarRuta();
    panel.hidden = true;
    carretera?.classList.remove('con-ruta');
    document.getElementById('origen').focus();
  });
})();
