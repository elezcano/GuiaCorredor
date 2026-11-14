// Portada: si hay una ruta guardada, la muestra como panel personal y la resalta en la carretera.
(function () {
  const GC = window.GC;
  const ruta = GC.leerRuta();
  if (!ruta) return;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  if (ruta.desde >= datos.nodos.length || ruta.hasta >= datos.nodos.length) return;

  const r = GC.calcular(datos, ruta.desde, ruta.hasta);
  const nombre = (i) => datos.nodos[i].nombre;
  const panel = document.getElementById('tu-ruta');
  const enlace = `${datos.base}/planificador/?desde=${ruta.desde}&hasta=${ruta.hasta}`;
  const incidencias = r.problemas.length
    ? `<li class="tu-ruta-alerta"><strong>${GC.plural(r.problemas.length, 'tramo con incidencias', 'tramos con incidencias')}</strong></li>`
    : '<li class="tu-ruta-ok"><strong>Todos los tramos operativos</strong></li>';

  panel.innerHTML = `
    <div class="tu-ruta-cabeza">
      <p>Tu última ruta</p>
      <h2>${GC.esc(nombre(ruta.desde))} a ${GC.esc(nombre(ruta.hasta))}</h2>
    </div>
    <ul class="tu-ruta-datos">
      ${incidencias}
      <li>${GC.plural(r.fronteras, 'frontera', 'fronteras')}</li>
      <li>${r.km ? `${r.km.toLocaleString('es-ES')} km conocidos` : 'Distancia por verificar'}</li>
    </ul>
    <div class="tu-ruta-acciones">
      <a class="boton boton-amarillo" href="${enlace}">Ver mi ruta</a>
      <button type="button" class="boton-texto" id="otra-ruta">Planificar otra</button>
    </div>`;
  panel.hidden = false;

  const form = document.querySelector('.planificar-hero');
  form.hidden = true;
  document.getElementById('origen').value = String(ruta.desde);
  document.getElementById('destino').value = String(ruta.hasta);
  document.getElementById('otra-ruta').addEventListener('click', () => {
    form.hidden = false;
    document.getElementById('origen').focus();
  });

  // Resaltar en la carretera los tramos y paradas de tu ruta.
  const [i, j] = r.rango;
  const carretera = document.getElementById('ruta-corredor');
  carretera.classList.add('con-ruta');
  carretera.querySelectorAll('li').forEach((li) => {
    const k = Number(li.dataset.i);
    const dentro = li.classList.contains('parada') ? k >= i && k <= j : k >= i && k < j;
    li.classList.toggle('en-ruta', dentro);
  });
})();
