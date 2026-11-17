// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-115: mapa interactivo (MapLibre + OpenFreeMap) con el esquema SVG como respaldo.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  for (const [tema, sch] of [['claro', 'light'], ['oscuro', 'dark']]) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: sch });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript((t) => { try { localStorage.setItem('tema', t); } catch {} }, tema);
    await p.goto(B + '/mapa/');
    const datos = JSON.parse(await p.textContent('#datos-mapa'));
    ok(datos.puntos.some((x) => x.tipo === 'paso' && x.id === 'jama') && datos.lineas.length >= 8, 'datos del mapa incompletos');
    ok((await p.$$('.tabla-tramos tbody tr')).length === datos.lineas.length, 'la tabla de tramos no cuadra con el mapa');
    const conMapLibre = await p.evaluate(() => !!window.maplibregl);
    if (conMapLibre) {
      // Con MapLibre: o carga el mapa (hay red) o, pasado el plazo, se queda el esquema. Nunca los dos ni ninguno.
      await p.waitForFunction(() => document.querySelector('#mapa-vivo')?.dataset.listo === 'true' || document.querySelector('#mapa-vivo')?.hidden, null, { timeout: 20000 }).catch(() => {});
      const vivo = await p.isVisible('#mapa-vivo');
      const resp = await p.isVisible('.mapa-respaldo');
      ok(vivo !== resp, `mapa y esquema a la vez o ninguno (vivo ${vivo}, esquema ${resp})`);
      console.log(`  mapa ${tema}: ${vivo ? 'MapLibre con teselas' : 'esquema SVG (sin teselas)'}`);
      if (vivo) await p.waitForTimeout(2500);
    } else {
      ok(await p.isVisible('.mapa-respaldo svg'), 'sin MapLibre debe verse el esquema');
    }
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'desborde ' + tema);
    await p.screenshot({ path: captura(`mapa-${tema}.png`) });
    ok(errs.length === 0, 'errores JS ' + errs);
    await p.close();
  }
  fin('Mapa interactivo (HU-115)', f);
  await b.close();
})();
