// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-80: informe de viaje resumido en una página.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
const paginasPDF = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
(async () => {
  const b = await lanzar();
  const errs = [];
  // Informe completo: botones del resumen
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/informe/?desde=0&hasta=8&carga=granel&fecha=2026-12-08');
  ok(await p.$('#inf-resumen-pdf'), 'C1 falta el botón «Resumen en 1 página»');
  ok(!(await p.isVisible('.informe-resumen')), 'el resumen no debe verse en el informe completo');
  const ver = await p.getAttribute('#inf-ver', 'href');
  ok(ver && ver.includes('formato=resumen'), 'C4 el enlace «Ver resumen» no lleva formato=resumen');

  for (const [nombre, q] of [['principal (Jama)', ''], ['alternativa (Sico)', '&op=alternativa']]) {
    await p.goto(`${B}/informe/?desde=0&hasta=8&carga=granel&fecha=2026-12-08${q}&formato=resumen`);
    ok(await p.isVisible('.informe-resumen'), `${nombre}: el resumen no se ve`);
    ok(!(await p.isVisible('#inf-horarios')), `${nombre}: las secciones completas deberían ocultarse`);
    const t = await p.textContent('.informe-resumen');
    ok((await p.$$('.tabla-resumen tbody tr')).length >= 3, `${nombre}: faltan pasos en el resumen`);
    ok(/Lo importante/.test(t) && /Avisos activos/.test(t) && /Distancia/.test(t) && /Papeles/.test(t), `${nombre}: faltan bloques (C2)`);
    ok(/Informe completo/.test(t) && !/formato=resumen/.test(await p.getAttribute('.resumen-enlace a', 'href')), `${nombre}: falta el enlace al informe completo`);
    ok(/sin verificar|verif\./.test(t), `${nombre}: no distingue verificado / sin verificar (C3)`);
    ok(/Confirma antes de salir/.test(await p.textContent('.informe-pie')), `${nombre}: falta «Confirma antes de salir»`);
    if (q) ok(/Gendarmería, 15 nov 2026 09:50 h/.test(t), `${nombre}: falta el último parte de Sico: ${t.slice(0, 300)}`);
    const pdf = await p.pdf({ format: 'A4', printBackground: false });
    const n = paginasPDF(pdf);
    ok(n === 1, `${nombre}: el PDF del resumen ocupa ${n} páginas (C1)`);
    require('fs').writeFileSync(captura(`resumen-${q ? 'sico' : 'jama'}.pdf`), pdf);
  }
  // Móvil, claro y oscuro: legible y sin desborde
  for (const sch of ['light', 'dark']) {
    const m = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: sch });
    m.on('pageerror', (e) => errs.push(e.message));
    await m.goto(B + '/informe/?desde=0&hasta=8&carga=granel&fecha=2026-12-08&op=alternativa&formato=resumen');
    ok(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'desborde en móvil ' + sch);
    await m.screenshot({ path: captura(`resumen-movil-${sch}.png`), fullPage: true });
    await m.close();
  }
  ok(errs.length === 0, 'errores JS: ' + errs);
  fin('Informe resumido en una página (HU-80)', f);
  await b.close();
})();
