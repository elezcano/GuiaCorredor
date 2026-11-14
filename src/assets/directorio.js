// Filtros del directorio: texto, país y tipo de empresa.
(function () {
  const texto = document.getElementById('f-texto');
  const pais = document.getElementById('f-pais');
  const cat = document.getElementById('f-categoria');
  const fichas = Array.from(document.querySelectorAll('#lista-empresas .empresa'));
  const contador = document.getElementById('contador');
  const vacio = document.getElementById('sin-resultados');

  const params = new URLSearchParams(location.search);
  if (params.get('pais')) pais.value = params.get('pais');
  if (params.get('tipo')) cat.value = params.get('tipo');
  if (params.get('q')) texto.value = params.get('q');

  function filtrar() {
    const q = texto.value.trim().toLowerCase();
    let visibles = 0;
    for (const f of fichas) {
      const ok =
        (!pais.value || f.dataset.pais === pais.value) &&
        (!cat.value || f.dataset.categoria === cat.value) &&
        (!q || f.dataset.texto.includes(q));
      f.hidden = !ok;
      if (ok) visibles++;
    }
    contador.textContent = `${visibles} empresa${visibles === 1 ? '' : 's'}`;
    vacio.hidden = visibles > 0;
  }

  [texto, pais, cat].forEach((el) => el.addEventListener('input', filtrar));
  filtrar();
})();
