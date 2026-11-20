// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Pruebas HU-65 a HU-68
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  for (const [tema, sch] of [['claro', 'light'], ['oscuro', 'dark']]) {
    const p = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: sch });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript((t) => { try { localStorage.setItem('tema', t); } catch {} }, tema);
    await p.goto(B + '/guia/pasos/jama/');
    const ahora = await p.textContent('.ahora');
    ok(/\d\d:\d\d en Argentina/.test(ahora) && /\d\d:\d\d en Chile/.test(ahora), 'HU-66 relojes: ' + ahora);
    ok(/(Abierto|Cerrado) ahora|Dentro del horario|Fuera del horario/.test(ahora), 'HU-66 abierto/cerrado ahora: ' + ahora);
    ok((await p.$$('.linea-tiempo li')).length >= 3, 'HU-65 pocas novedades');
    const lt = await p.$$eval('.linea-tiempo time', (l) => l.map((x) => x.getAttribute('datetime')));
    ok(lt.every((d, i) => i === 0 || lt[i - 1] >= d), 'HU-65 no está ordenada');
    ok((await p.$$('.controles li')).length === 6, 'HU-67 controles Jama');
    ok((await p.getAttribute('.btn-llamar', 'href')) === 'tel:+543884253630', 'HU-68 tel Jama');
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'desborde ' + tema);
    await p.screenshot({ path: captura(`jama-plus-${tema}.png`), fullPage: true });
    await p.goto(B + '/guia/pasos/carmelo-peralta-porto-murtinho/');
    ok((await p.textContent('.ahora-estado')).includes('No habilitado'), 'HU-66 puente no habilitado');
    ok((await p.textContent('.ficha-operativa')).includes('Sin teléfono con fuente'), 'HU-68 sin teléfono puente');
    await p.goto(B + '/guia/pasos/sico/');
    ok((await p.textContent('.ahora-estado')).includes('Sin horario con hora de apertura y cierre'), 'HU-66 Sico sin hora de cierre no debe calcular abierto/cerrado');
    ok(errs.length === 0, 'errores JS ' + errs);
    await p.close();
  }
  fin('Fichas de paso (HU-65 a HU-68)', f);
  await b.close();
})();
