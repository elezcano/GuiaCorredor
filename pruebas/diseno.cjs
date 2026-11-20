// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Sistema de diseño V2 en móvil (390), tablet (820) y escritorio (1440):
// sin scroll lateral, filas de botones en una línea, menú lateral o inferior, iconos coherentes,
// señales de carril en el tablero, objetivos táctiles de 44 px y una pantalla en las vistas principales.
// Deja una captura de cada vista (también en modo noche) para revisarlas a ojo.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = [];
const ok = (c, m) => c || f.push(m);

const VISTAS = { movil: [390, 844], tablet: [820, 1180], web: [1440, 900] };
const PAGINAS = ['/', '/pasos/', '/planificador/?desde=0&hasta=8', '/guia/pasos/jama/', '/directorio/', '/cotizar/', '/anunciate/', '/pt/'];
// Vistas de consulta que deben caber en una pantalla de escritorio (el pie puede quedar debajo).
const UNA_PANTALLA = ['/', '/pasos/', '/directorio/'];

(async () => {
  const b = await lanzar();
  for (const [vista, [w, h]] of Object.entries(VISTAS)) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    for (const ruta of PAGINAS) {
      const donde = `${vista} ${ruta}`;
      await p.goto(B + ruta);
      const r = await p.evaluate(() => {
        const vis = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
        const menu = document.querySelector('.menu-app').getBoundingClientRect();
        return {
          lateral: document.documentElement.scrollWidth - innerWidth,
          // Cada fila de acciones: todos sus hijos visibles a la misma altura.
          filas: [...document.querySelectorAll('.acc')].filter(vis).filter((a) => new Set([...a.children].filter(vis).map((c) => Math.round(c.getBoundingClientRect().top))).size > 1).length,
          menu: { izq: menu.left, arriba: menu.top, alto: menu.height, ancho: menu.width },
          // Iconos: retícula 24, trazo 2 y color heredado (contorno) o relleno con currentColor.
          iconosMal: [...document.querySelectorAll('svg.icono')].filter((s) => s.getAttribute('viewBox') !== '0 0 24 24' || !(
            (s.getAttribute('stroke') === 'currentColor' && s.getAttribute('stroke-width') === '2') || s.getAttribute('fill') === 'currentColor')).length,
          // Objetivos táctiles del menú y de los botones de icono.
          pequenos: [...document.querySelectorAll('.menu-app a, .ib')].filter(vis).filter((x) => { const q = x.getBoundingClientRect(); return q.width && (q.width < 44 || q.height < 44); }).length,
          finMain: Math.round(document.querySelector('main').lastElementChild.getBoundingClientRect().bottom + scrollY),
        };
      });
      ok(r.lateral <= 0, `${donde}: scroll lateral de ${r.lateral} px`);
      ok(!r.filas, `${donde}: ${r.filas} fila(s) de botones saltan de línea`);
      ok(!r.iconosMal, `${donde}: ${r.iconosMal} icono(s) fuera del sistema (24, trazo 2, currentColor)`);
      ok(!r.pequenos, `${donde}: ${r.pequenos} botón(es) de menos de 44 px`);
      if (w > 760) ok(r.menu.izq === 0 && r.menu.arriba === 0 && r.menu.alto === h, `${donde}: el menú debe ir en el lateral`);
      else ok(r.menu.izq === 0 && Math.round(r.menu.arriba + r.menu.alto) === h && r.menu.ancho === w, `${donde}: el menú debe ir abajo`);
      if (vista === 'web' && UNA_PANTALLA.includes(ruta)) ok(r.finMain <= h, `${donde}: no cabe en una pantalla (${r.finMain} px)`);
      await p.screenshot({ path: captura(`diseno-${vista}${ruta.replace(/\W+/g, '-')}.png`) });
    }
    // Tablero de pasos: una señal de carril por paso, y una fila marcada en la ficha.
    await p.goto(B + '/pasos/');
    ok((await p.$$('.tablero-fila[data-paso] .luz')).length === (await p.$$('.tablero-fila[data-paso]')).length, `${vista}: cada paso del tablero lleva su señal`);
    await p.goto(B + '/guia/pasos/jama/');
    ok((await p.$$('.tablero-fila.sel')).length === 1, `${vista}: la ficha marca su paso en el tablero`);
    // Modo noche: el botón cambia el tema y se recuerda.
    await p.goto(B + '/');
    await p.click('#cambiar-tema');
    ok((await p.getAttribute('html', 'data-tema')) === 'oscuro', `${vista}: el modo noche no se activa`);
    await p.screenshot({ path: captura(`diseno-${vista}-noche.png`) });
    await p.click('#cambiar-tema');
    ok(!errs.length, `${vista}: errores de JavaScript: ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  fin('Sistema de diseño V2 (móvil, tablet y escritorio)', f);
})();
