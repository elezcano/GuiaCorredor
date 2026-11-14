// Filtros con botones (chips) para listas y tablas: guía y novedades.
// Cada grupo [data-filtros="selector"] filtra los hijos del selector por sus data-* (valores separados por espacios).
(function () {
  document.querySelectorAll('[data-filtros]').forEach((grupo) => {
    const destino = document.querySelector(grupo.dataset.filtros);
    if (!destino) return;
    const items = Array.from(destino.children);
    const vacio = grupo.parentElement.querySelector('[data-vacio]');
    const activos = {};

    function aplicar() {
      let visibles = 0;
      items.forEach((it) => {
        const ok = Object.entries(activos).every(([k, v]) => !v || (it.dataset[k] || '').split(' ').includes(v));
        it.hidden = !ok;
        if (ok) visibles++;
      });
      grupo.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String((activos[b.dataset.filtro] || '') === b.dataset.valor)));
      if (vacio) vacio.hidden = visibles > 0;
    }

    grupo.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      activos[b.dataset.filtro] = b.dataset.valor;
      aplicar();
    });
    vacio?.querySelector('[data-limpiar]')?.addEventListener('click', () => {
      Object.keys(activos).forEach((k) => (activos[k] = ''));
      aplicar();
    });
  });
})();
