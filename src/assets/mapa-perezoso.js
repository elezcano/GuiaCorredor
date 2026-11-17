// HU-115: en la portada, el mapa interactivo se carga solo cuando su sección está a punto de verse,
// para no hacer más pesada la primera pantalla en el móvil. Hasta entonces (o si falla) se ve el esquema SVG.
(function () {
  const marco = document.querySelector('.mapa-vivo-marco');
  if (!marco || !('IntersectionObserver' in window)) return;
  const base = (document.querySelector('script[src$="/assets/mapa-perezoso.js"]')?.getAttribute('src') || '').replace(/mapa-perezoso\.js$/, '');
  const cargar = (src) =>
    new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = mal;
      document.body.appendChild(s);
    });
  const obs = new IntersectionObserver(
    (entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = base + 'vendor/maplibre-gl.css';
      document.head.appendChild(css);
      cargar(base + 'vendor/maplibre-gl.js')
        .then(() => cargar(base + 'mapa.js'))
        .catch(() => {});
    },
    { rootMargin: '400px 0px' }
  );
  obs.observe(marco);
})();
