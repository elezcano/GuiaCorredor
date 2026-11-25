// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-97: fiabilidad de cada paso (cálculo y ficha).
const path = require('path');
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  // 1. Cálculo, con un paso de ejemplo
  const { fiabilidad } = await import(path.join(__dirname, '..', 'scripts', 'fiabilidad.mjs'));
  const v = '2026-11-15';
  const paso = {
    estado: { valor: 'operativo', publicado: '2026-11-14', verificado: v },
    historial: [
      { fecha: '2026-11-01', valor: 'operativo', verificado: v },
      { fecha: '2026-11-03', valor: 'cerrado', verificado: v },
      { fecha: '2026-11-04', valor: 'operativo', verificado: v },
      { fecha: '2026-11-08', valor: 'cerrado', afecta: 'carga', hora: '18:25', verificado: v },
      { fecha: '2026-11-09', valor: 'operativo', verificado: v },
      { fecha: '2026-11-10', valor: 'cerrado', verificado: null }, // sin verificar: no cuenta
    ],
  };
  const r = fiabilidad(paso, '2026-11-15', 30, 7);
  ok(r.cerrado === 1, 'un día no habilitado (3/11): ' + r.cerrado);
  ok(r.soloCarga === 1, 'un día sin paso para carga (8/11): ' + r.soloCarga);
  ok(r.pendientesDeVerificar === 1, 'un registro pendiente de verificar: ' + r.pendientesDeVerificar);
  ok(r.porDia.find((d) => d.dia === '2026-10-31').clase === 'sin-datos', 'antes del primer registro: sin datos');
  ok(r.porDia.find((d) => d.dia === '2026-11-02').clase === 'abierto', 'el registro se arrastra al día siguiente');
  const lejos = fiabilidad({ historial: [{ fecha: '2026-10-01', valor: 'operativo', verificado: v }] }, '2026-10-20', 30, 7);
  ok(lejos.porDia.find((d) => d.dia === '2026-10-09').clase === 'sin-datos', 'más de 7 días sin parte: sin datos, nunca habilitado');
  ok(r.cerrado + r.soloCarga + r.restricciones + r.abierto + r.sinDatos === 30, 'los días suman 30');

  // 2. Ficha: bloque visible, tira de 30 días y tabla; el puente (en obras) no lo muestra
  const b = await lanzar();
  for (const sch of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: sch });
    await p.goto(B + '/guia/pasos/sico/');
    ok(await p.isVisible('.fiabilidad'), 'Sico: falta el bloque de fiabilidad');
    ok((await p.$$('.fiab-tira li')).length === 30, 'la tira no tiene 30 días');
    ok((await p.$$('.tabla-fiab tbody tr')).length === 2, 'faltan las filas de 30 y 90 días');
    ok(/sin datos/.test(await p.textContent('.fiabilidad')), 'debe decir «sin datos» donde no hay partes');
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'desborde en móvil ' + sch);
    await (await p.$('.fiabilidad')).screenshot({ path: captura(`fiabilidad-sico-${sch}.png`) });
    await p.goto(B + '/guia/pasos/carmelo-peralta-porto-murtinho/');
    ok(!(await p.$('.fiabilidad .fiab-tira')) && /se medirá desde que abra/.test(await p.textContent('.fiabilidad')), 'el puente no habilitado no muestra días: dice que se medirá desde que abra');
    await p.close();
  }
  const p = await b.newPage();
  await p.goto(B + '/informe/?desde=0&hasta=8&carga=granel&fecha=2026-12-08&op=alternativa');
  ok(/Disponibilidad del paso:.*últimos 30 días/.test(await p.textContent('.informe')), 'el informe no muestra la disponibilidad del paso');
  fin('Fiabilidad de cada paso (HU-97)', f);
  await b.close();
})();
