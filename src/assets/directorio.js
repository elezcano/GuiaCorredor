// Filtros del directorio: búsqueda, país y tipo. El estado queda en la URL (?q=&pais=&tipo=).
(function () {
  const form = document.querySelector('.filtros');
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
  if (params.get('q')) texto.value = params.get('q');
  if (params.get('pais')) marcar('pais', params.get('pais'));
  if (params.get('tipo')) marcar('tipo', params.get('tipo'));

  function filtrar() {
    const q = texto.value.trim().toLowerCase();
    const pais = valor('pais');
    const tipo = valor('tipo');
    let visibles = 0;
    for (const f of fichas) {
      const ok = (!pais || f.dataset.pais === pais) && (!tipo || f.dataset.categoria === tipo) && (!q || f.dataset.texto.includes(q));
      f.hidden = !ok;
      if (ok) visibles++;
    }
    contador.textContent = `${visibles} ${visibles === 1 ? 'empresa' : 'empresas'}`;
    vacio.hidden = visibles > 0;

    const url = new URL(location.href);
    [['q', q], ['pais', pais], ['tipo', tipo]].forEach(([k, v]) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k)));
    history.replaceState(null, '', url);
  }

  form.addEventListener('input', filtrar);
  form.addEventListener('change', filtrar);
  limpiar.addEventListener('click', () => {
    texto.value = '';
    marcar('pais', '');
    marcar('tipo', '');
    filtrar();
    texto.focus();
  });
  filtrar();
})();
