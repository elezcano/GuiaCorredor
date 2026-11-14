// Empresas: búsqueda con sugerencias al escribir (patrón buscador web), filtros por tipo, país y punto.
// El estado queda en la URL (?q=&tipo=&pais=&punto=).
(function () {
  const input = document.getElementById('f-texto');
  const lista = document.getElementById('sugerencias');
  const punto = document.getElementById('f-punto');
  const fichas = Array.from(document.querySelectorAll('#lista-empresas .empresa'));
  const contador = document.getElementById('contador');
  const vacio = document.getElementById('sin-resultados');
  const sugerencias = JSON.parse(document.getElementById('datos-sugerencias').textContent);
  const activos = { tipo: '', pais: '' };
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let actual = -1;

  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  punto.value = params.get('punto') || '';
  activos.tipo = params.get('tipo') || '';
  activos.pais = params.get('pais') || '';

  function filtrar() {
    const q = norm(input.value.trim());
    const pt = punto.value;
    let visibles = 0;
    for (const f of fichas) {
      const ok =
        (!pt || f.dataset.puntos.split(' ').includes(pt)) &&
        (!activos.pais || f.dataset.pais === activos.pais) &&
        (!activos.tipo || f.dataset.categoria === activos.tipo) &&
        (!q || q.split(/\s+/).every((p) => norm(f.dataset.texto).includes(p)));
      f.hidden = !ok;
      if (ok) visibles++;
    }
    const lugar = pt ? ` en ${punto.options[punto.selectedIndex].text.replace(/\s*\(\d+\)$/, '')}` : '';
    contador.textContent = `${visibles} ${visibles === 1 ? 'empresa' : 'empresas'}${lugar}`;
    vacio.hidden = visibles > 0;
    document.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(activos[b.dataset.filtro] === b.dataset.valor)));
    const url = new URL(location.href);
    [['q', input.value.trim()], ['tipo', activos.tipo], ['pais', activos.pais], ['punto', pt]].forEach(([k, v]) => (v ? url.searchParams.set(k, v) : url.searchParams.delete(k)));
    history.replaceState(null, '', url);
  }

  // Sugerencias (combobox accesible: flechas, Intro y Escape)
  function cerrar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    actual = -1;
  }
  function abrir() {
    const q = norm(input.value.trim());
    if (q.length < 2) return cerrar();
    const encontradas = sugerencias.filter((s) => norm(s.t).includes(q)).slice(0, 6);
    if (!encontradas.length) return cerrar();
    lista.innerHTML = encontradas
      .map((s, i) => `<li role="option" id="sug-${i}" aria-selected="false" data-valor="${s.t.replace(/"/g, '&quot;')}">${s.t.replace(/</g, '&lt;')}<span>${s.d}</span></li>`)
      .join('');
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    actual = -1;
  }
  function marcar(i) {
    const opts = lista.querySelectorAll('li');
    if (!opts.length) return;
    actual = (i + opts.length) % opts.length;
    opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === actual)));
    input.setAttribute('aria-activedescendant', opts[actual].id);
  }
  function elegir(valor) {
    input.value = valor;
    cerrar();
    filtrar();
  }
  input.addEventListener('input', () => {
    abrir();
    filtrar();
  });
  input.addEventListener('keydown', (e) => {
    if (lista.hidden) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      marcar(actual + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      marcar(actual - 1);
    } else if (e.key === 'Enter' && actual >= 0) {
      e.preventDefault();
      elegir(lista.querySelectorAll('li')[actual].dataset.valor);
    } else if (e.key === 'Escape') cerrar();
  });
  lista.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) {
      e.preventDefault();
      elegir(li.dataset.valor);
    }
  });
  input.addEventListener('blur', () => setTimeout(cerrar, 100));

  document.querySelector('.filtros-empresas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    activos[b.dataset.filtro] = b.dataset.valor;
    filtrar();
  });
  punto.addEventListener('change', filtrar);
  document.getElementById('limpiar').addEventListener('click', () => {
    input.value = '';
    punto.value = '';
    activos.tipo = '';
    activos.pais = '';
    filtrar();
    input.focus();
  });
  filtrar();
})();
