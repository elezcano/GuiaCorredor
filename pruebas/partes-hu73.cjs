// Pruebas HU-73: partes por organismo con hora y aviso de antigüedad. Reloj fijo: 15/11/2026 20:30 (Madrid).
const { chromium } = require('playwright');
const B = 'http://localhost:4321'; const f = []; const ok = (c, m) => c || f.push(m);
const AHORA = new Date('2026-11-15T20:30:00+01:00');
(async () => {
  const b = await chromium.launch();
  for (const [tema, sch] of [['claro', 'light'], ['oscuro', 'dark']]) {
    const p = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: sch });
    await p.clock.setFixedTime(AHORA);
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript((t) => { try { localStorage.setItem('tema', t); } catch {} }, tema);
    await p.goto(B + '/guia/pasos/sico/');
    const partes = await p.$$eval('.partes .parte', (l) => l.map((x) => x.innerText));
    ok(partes.length === 3, 'C1/C2 Sico: 2 partes de AR + 1 vacío de CL: ' + partes.length);
    ok(partes.some((t) => /Gendarmería Nacional/.test(t) && /15 de noviembre de 2026, 09:50 h/.test(t) && /hace \d+ h/.test(t)), 'C1 parte de Gendarmería con fecha, hora y edad');
    ok(partes.some((t) => /Sin parte cargado de Chile/.test(t)), 'C2 lado de Chile sin parte');
    const viejos = await p.$$eval('.parte.parte-vieja', (l) => l.map((x) => x.innerText));
    ok(viejos.length === 1 && /Vialidad/.test(viejos[0]) && /Este parte tiene 3 días: confírmalo antes de salir/.test(viejos[0]), 'C3 aviso solo en el parte de Vialidad: ' + viejos);
    ok((await p.textContent('.senal-pie .estado')).startsWith('Abierto'), 'C3 el semáforo no cambia');
    ok(await p.$$eval('.partes a[href]', (l) => l.length >= 2), 'C1 enlaces a la fuente');
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'C5 desborde ' + tema);
    const box = await p.$('.partes'); await box.screenshot({ path: `/tmp/shots/partes-sico-${tema}.png` });
    await p.goto(B + '/guia/pasos/jama/');
    ok(/sin hora publicada/.test(await p.textContent('.partes')), 'Jama: parte sin hora');
    await p.goto(B + '/guia/pasos/carmelo-peralta-porto-murtinho/');
    ok(!(await p.$('.partes')), 'Puente no habilitado: sin bloque de partes');
    await p.goto(B + '/guia/pasos/pozo-hondo/');
    ok((await p.$$('.partes .parte-vacio')).length === 2, 'Pozo Hondo: dos lados sin parte');
    await p.goto(B + '/informe/?desde=0&hasta=7&carga=granel&fecha=2026-12-08&op=alternativa');
    const inf = await p.textContent('.informe');
    ok(/Qué informa cada país/.test(inf) && /Gendarmería Nacional/.test(inf) && /Chile: sin parte cargado/.test(inf), 'C4 informe con partes');
    ok(/Este parte tiene 3 días/.test(inf), 'C4 informe con aviso de antigüedad');
    ok(errs.length === 0, 'errores JS ' + errs);
    await p.close();
  }
  console.log(f.length ? 'FALLOS:\n' + f.join('\n') : 'HU-73: sin fallos');
  await b.close();
})();
