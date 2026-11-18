// Buscador interno: carga el índice generado al publicar y filtra en el navegador.
(function () {
  const input = document.getElementById('q');
  const lista = document.getElementById('resultados');
  const estadoTxt = document.getElementById('buscar-estado');
  if (!input) return;
  const normal = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  let indice = [];

  function buscar() {
    const q = normal(input.value.trim());
    const url = new URL(location.href);
    if (q) url.searchParams.set('q', input.value.trim());
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
    if (!q) {
      lista.innerHTML = '';
      estadoTxt.textContent = '';
      return;
    }
    const palabras = q.split(/\s+/);
    const res = indice
      .map((it) => {
        const t = normal(it.t);
        const todo = `${t} ${normal(it.d)} ${normal(it.k)}`;
        if (!palabras.every((p) => todo.includes(p))) return null;
        return { it, peso: palabras.reduce((a, p) => a + (t.includes(p) ? 2 : 1), 0) };
      })
      .filter(Boolean)
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 30);
    estadoTxt.textContent = res.length ? `${res.length} ${res.length === 1 ? 'resultado' : 'resultados'}` : 'Sin resultados. Prueba con otra palabra, por ejemplo el nombre de un paso o de una ciudad.';
    lista.innerHTML = res
      .map(({ it }) => {
        const externo = /^https?:/.test(it.u);
        return `<li><a href="${GC.esc(it.u)}"${externo ? ' rel="noopener"' : ''}><span class="res-tipo">${GC.esc(it.k)}</span>${/^Novedad/.test(it.k) ? `<strong lang="es" class="txt-es">${GC.esc(it.t)}</strong>` : `<strong>${GC.esc(it.t)}</strong>`}<span lang="es" class="txt-es">${GC.esc(it.d)}</span></a></li>`;
      })
      .join('');
  }

  fetch(input.dataset.indice)
    .then((r) => r.json())
    .then((d) => {
      indice = d;
      const q = new URLSearchParams(location.search).get('q');
      if (q) input.value = q;
      buscar();
    })
    .catch(() => (estadoTxt.textContent = 'No se pudo cargar el índice. Recarga la página.'));
  input.addEventListener('input', buscar);
  input.closest('form').addEventListener('submit', (e) => e.preventDefault());
  input.focus();
})();
