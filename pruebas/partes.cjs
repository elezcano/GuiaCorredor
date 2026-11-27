// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Pruebas HU-73: partes por organismo con hora y aviso de antigüedad. Reloj fijo: 15/11/2026 20:30 (Madrid).
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  for (const [tema, sch] of [['claro', 'light'], ['oscuro', 'dark']]) {
    const p = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: sch });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript((t) => { try { localStorage.setItem('tema', t); } catch {} }, tema);
    await p.goto(B + '/guia/pasos/sico/');
    await p.evaluate(() => document.querySelectorAll('#historial-fuentes').forEach((d) => (d.open = true)));
    const partes = await p.$$eval('.partes .parte', (l) => l.map((x) => x.innerText));
    ok(partes.length === 3, 'C1/C2 Sico: 2 partes de AR + 1 vacío de CL: ' + partes.length);
    ok(partes.some((t) => /Gendarmería Nacional/.test(t) && /15 de noviembre de 2026, 09:50 h/.test(t) && /hace \d+ h/.test(t)), 'C1 parte de Gendarmería con fecha, hora y edad');
    ok(partes.some((t) => /Sin parte cargado de Chile/.test(t)), 'C2 lado de Chile sin parte');
    const viejos = await p.$$eval('.parte.parte-vieja', (l) => l.map((x) => x.innerText));
    ok(viejos.length === 1 && /Vialidad/.test(viejos[0]) && /Tiene 3 días: confírmalo antes de salir/.test(viejos[0]), 'C3 aviso solo en el parte de Vialidad: ' + viejos);
    // 20/11/2026: un lado sin parte en 48 h → el paso sale «Sin confirmar» y dice dónde está abierto.
    ok((await p.textContent('.tablero-fila.sel .estado')).startsWith('Abierto') && /Chile: sin avisos desde el 12 nov/.test(await p.textContent('.tablero-fila.sel')), 'C3 Sico: Argentina con parte y Chile por aviso dentro de plazo → «Abierto · Chile: sin avisos desde el 12 nov» (decisión 31)');
    ok(await p.$$eval('.partes a[href]', (l) => l.length >= 2), 'C1 enlaces a la fuente');
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'C5 desborde ' + tema);
    const box = await p.$('.partes'); await box.screenshot({ path: captura(`partes-sico-${tema}.png`) });
    await p.goto(B + '/guia/pasos/jama/');
    await p.evaluate(() => document.querySelectorAll('#historial-fuentes').forEach((d) => (d.open = true)));
    ok(/sin hora publicada/.test(await p.textContent('.partes')), 'Jama: parte sin hora');
    await p.goto(B + '/guia/pasos/carmelo-peralta-porto-murtinho/');
    ok(!(await p.$('.partes')), 'Puente no habilitado: sin bloque de partes');
    await p.goto(B + '/guia/pasos/pozo-hondo/');
    await p.evaluate(() => document.querySelectorAll('#historial-fuentes').forEach((d) => (d.open = true)));
    ok((await p.$$('.partes .parte-vacio')).length === 1, 'Pozo Hondo: Paraguay sin parte (Argentina tiene el de Gendarmería del 12/11)');
    await p.goto(B + '/informe/?desde=0&hasta=8&carga=granel&fecha=2026-12-08&op=alternativa');
    const inf = await p.textContent('.informe');
    ok(/Qué informa cada país/.test(inf) && /Gendarmería Nacional/.test(inf) && /Chile: sin parte cargado/.test(inf), 'C4 informe con partes');
    ok(/Este parte tiene 3 días/.test(inf), 'C4 informe con aviso de antigüedad');
    ok(errs.length === 0, 'errores JS ' + errs);
    await p.close();
  }
  fin('Partes por organismo (HU-73)', f);
  await b.close();
})();
