// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-105: ficha de paso por sentido de cruce, con botón «⇄».
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  const errs = [];
  for (const sch of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: sch });
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(B + '/guia/pasos/jama/');
    const lados = () => p.$$eval('.controles li', (l) => l.map((x) => x.dataset.lado));
    ok(/Sales de Argentina y entras en Chile/.test(await p.textContent('.sentido-nota')), 'sentido por defecto: Argentina → Chile');
    let l = await lados();
    ok(l.indexOf('AR') < l.indexOf('CL'), 'ida: los controles de Argentina van antes que los de Chile');
    await p.click('.btn-sentido');
    ok(/Sales de Chile y entras en Argentina/.test(await p.textContent('.sentido-nota')), 'el botón «⇄» no cambia el sentido');
    l = await lados();
    ok(l.indexOf('CL') < l.indexOf('AR'), 'vuelta: los controles de Chile van antes que los de Argentina');
    ok(p.url().includes('sentido=CL-AR'), 'el sentido no queda en la URL');
    ok((await p.getAttribute('.partes-lado', 'data-pais')) === 'CL', 'vuelta: el parte de Chile debe ir primero');
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'desborde en móvil ' + sch);
    await (await p.$('.sentido')).screenshot({ path: captura(`sentido-${sch}.png`) });
    await p.goto(B + '/guia/pasos/jama/?sentido=CL-AR');
    ok(/Sales de Chile/.test(await p.textContent('.sentido-nota')), 'el enlace con ?sentido=CL-AR no abre la ficha girada');
    await p.goto(B + '/guia/pasos/jama/?sentido=XX-YY');
    ok(/Sales de Argentina/.test(await p.textContent('.sentido-nota')), 'un sentido no válido debe volver al de por defecto');
    await p.close();
  }
  // 26/11/2026: «Tiempo de cruce» nombra los dos países de cada paso, nunca uno que no limita con él.
  const esperado = { jama: ['Chile', 'Argentina'], sico: ['Chile', 'Argentina'], 'pozo-hondo': ['Argentina', 'Paraguay'], 'carmelo-peralta-porto-murtinho': ['Paraguay', 'Brasil'] };
  for (const [id, [oeste, este]] of Object.entries(esperado)) {
    const h = await (await fetch(`${B}/guia/pasos/${id}/`)).text();
    const dt = [...h.matchAll(/<dt>Hacia ([^<]+)<\/dt>/g)].map((m) => m[1]);
    ok(dt.length === 0 || (dt[0] === oeste && dt[1] === este), `Tiempo de cruce en ${id}: Hacia ${oeste} / Hacia ${este}, no ${dt.join(' / ')}`);
  }
  // El planificador abre las fichas en el sentido del viaje
  const p = await b.newPage();
  await p.goto(B + '/planificador/?desde=8&hasta=0');
  const hrefs = await p.$$eval('a[href*="sentido="]', (l) => l.map((x) => x.getAttribute('href')));
  ok(hrefs.some((h) => h.includes('/jama/?sentido=CL-AR')), 'viaje de vuelta: el planificador debe enlazar Jama en sentido CL-AR');
  await p.goto(B + '/planificador/?desde=0&hasta=8');
  const ida = await p.$$eval('a[href*="sentido="]', (l) => l.map((x) => x.getAttribute('href')));
  ok(ida.some((h) => h.includes('/jama/?sentido=AR-CL')), 'viaje de ida: Jama en sentido AR-CL');
  ok(errs.length === 0, 'errores JS: ' + errs);
  fin('Ficha por sentido de cruce (HU-105)', f);
  await b.close();
})();
