// Avisos (decisión 44): filtro «Mi ruta». Oculta las filas de la otra vía de los Andes (Jama o Sico).
(() => {
  const sel = document.querySelector('[data-mi-ruta]');
  if (!sel) return;
  const aplicar = () => {
    const v = sel.value;
    document.querySelectorAll('.av-fila[data-via]').forEach((li) => {
      li.hidden = !!v && li.dataset.via !== v;
    });
  };
  sel.addEventListener('change', aplicar);
  aplicar();
})();
// Un enlace a un aviso concreto (/avisos/#inc-…) abre su fila y la muestra.
(() => {
  const abrir = () => {
    const el = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    const d = el && el.closest('details');
    if (d) { d.open = true; el.scrollIntoView({ block: 'center' }); }
  };
  window.addEventListener('hashchange', abrir);
  abrir();
})();
