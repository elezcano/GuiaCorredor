// Filtros del directorio: punto de la ruta, búsqueda, país y tipo. El estado queda en la URL (?punto=&q=&pais=&tipo=).
(function () {
  const form = document.querySelector('.filtros');
  const punto = document.getElementById('f-punto');
  const texto = document.getElementById('f-texto');
  const fichas = Array.from(document.querySelectorAll('#lista-empresas .empresa'));
  const contador = document.getElementById('contador');
  const vacio = document.getElementById('sin-resultados');
  const limpiar = document.getElementById('limpiar');

  const valor = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const marcar = (name, v) => {
    const el = form.querySelector(`input[name="${name}"][value="${CSS.escape(v)}"]`);
    if (el) el.checked = true;
  };

  const params = new URLSearchParams(location.search);
  if (params.get('punto')) punto.value = params.get('punto');
  if (params.get('q')) texto.value = params.get('q');
  if (params.get('pais')) marcar('pais', params.get('pais'));
  if (params.get('tipo')) marcar('tipo', params.get('tipo'));

  function filtrar() {
    const q = texto.value.trim().toLowerCase();
    const pt = punto.value;
    const pais = valor('pais');
    const tipo = valor('tipo');
    let visibles = 0;
    for (const f of fichas) {
      const ok =
        (!pt || f.dataset.puntos.split(' ').includes(pt)) &&
        (!pais || f.dataset.pais === pais) &&
        (!tipo || f.dataset.categoria === tipo) &&
        (!q || f.dataset.texto.includes(q));
      f.hidden = !ok;
      if (ok) visibles++;
    }
    const lugar = pt ? ` en ${punto.options[punto.selectedIndex].text.replace(/\s*\(\d+\)$/, '')}` : '';
    contador.textContent = `${visibles} ${visibles === 1 ? 'empresa' : 'empresas'}${lugar}`;
    vacio.hidden = visibles > 0;

    const url = new URL(location.href);
    [['punto', pt], ['q', q], ['pais', pais], ['tipo', tipo]].forEach(([k, v]) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k)));
    history.replaceState(null, '', url);
  }

  form.addEventListener('input', filtrar);
  form.addEventListener('change', filtrar);
  limpiar.addEventListener('click', () => {
    punto.value = '';
    texto.value = '';
    marcar('pais', '');
    marcar('tipo', '');
    filtrar();
    punto.focus();
  });
  filtrar();
})();
