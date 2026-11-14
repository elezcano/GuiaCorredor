// Filtros con botones (chips) y selectores para listas y tablas.
// Cada grupo [data-filtros="selector"] filtra los hijos del selector por sus data-* (valores separados por espacios).
// Los hijos con [data-cabecera] agrupan a los siguientes y se ocultan si su grupo queda vacío.
(function () {
  document.querySelectorAll('[data-filtros]').forEach((grupo) => {
    const destino = document.querySelector(grupo.dataset.filtros);
    if (!destino) return;
    const hijos = Array.from(destino.children);
    const items = hijos.filter((h) => !h.hasAttribute('data-cabecera'));
    const vacio = grupo.parentElement.querySelector('[data-vacio]');
    const activos = {};

    function aplicar() {
      let visibles = 0;
      items.forEach((it) => {
        const ok = Object.entries(activos).every(([k, v]) => !v || (it.dataset[k] || '').split(' ').includes(v));
        it.hidden = !ok;
        if (ok) visibles++;
      });
      let cab = null;
      let conHijos = false;
      hijos.forEach((h) => {
        if (h.hasAttribute('data-cabecera')) {
          if (cab) cab.hidden = !conHijos;
          cab = h;
          conHijos = false;
        } else if (!h.hidden) conHijos = true;
      });
      if (cab) cab.hidden = !conHijos;
      grupo.querySelectorAll('button[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String((activos[b.dataset.filtro] || '') === b.dataset.valor)));
      grupo.querySelectorAll('select[data-filtro]').forEach((s) => (s.value = activos[s.dataset.filtro] || ''));
      if (vacio) vacio.hidden = visibles > 0;
    }

    grupo.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-filtro]');
      if (!b) return;
      activos[b.dataset.filtro] = b.dataset.valor;
      aplicar();
    });
    grupo.addEventListener('change', (e) => {
      const s = e.target.closest('select[data-filtro]');
      if (!s) return;
      activos[s.dataset.filtro] = s.value;
      aplicar();
    });
    vacio?.querySelector('[data-limpiar]')?.addEventListener('click', () => {
      Object.keys(activos).forEach((k) => (activos[k] = ''));
      aplicar();
    });
  });
})();
