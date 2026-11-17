// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-115: mapa interactivo (MapLibre + OpenFreeMap) con el esquema SVG como respaldo.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
// Estado final del marco del mapa: «mapa» o «esquema». Las teselas vienen de un servidor externo:
// si siguen cargando a los 40 s, solo se exige que el esquema tape el hueco.
async function comprobarMapa(p, ok, donde) {
  const est = await p
    .waitForFunction(() => ['mapa', 'esquema'].includes(document.querySelector('.mapa-vivo-marco')?.dataset.estado) && document.querySelector('.mapa-vivo-marco').dataset.estado, null, { timeout: 40000 })
    .then((h) => h.jsonValue(), () => 'cargando');
  const vivo = await p.isVisible('#mapa-vivo');
  const resp = await p.isVisible('.mapa-respaldo');
  if (est === 'mapa') ok(vivo && !resp, `${donde}: con el mapa cargado no debe verse el esquema`);
  else ok(resp, `${donde}: debe verse el esquema (${est})`);
  if (est === 'esquema') ok(!vivo, `${donde}: sin mapa, el hueco del mapa no debe verse`);
  return est;
}

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
      const est = await comprobarMapa(p, ok, 'mapa');
      console.log(`  mapa ${tema}: ${est}`);
      if (est === 'mapa') await p.waitForTimeout(2500);
    } else {
      ok(await p.isVisible('.mapa-respaldo svg'), 'sin MapLibre debe verse el esquema');
    }
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'desborde ' + tema);
    await p.screenshot({ path: captura(`mapa-${tema}.png`) });
    // Portada: el mapa se carga al llegar a su sección (si MapLibre está instalado).
    await p.goto(B + '/');
    if (await p.$('.mapa-vivo-marco')) {
      ok((await p.getAttribute('.mapa-vivo-marco', 'data-estado')) === 'esquema', 'portada: el mapa no debe cargarse antes de llegar a él');
      await p.locator('.mapa-vivo-marco').scrollIntoViewIfNeeded();
      const est = await comprobarMapa(p, ok, 'portada');
      console.log(`  portada ${tema}: ${est}`);
      if (est === 'mapa') await p.waitForTimeout(2500);
      await p.locator('.mapa-vivo-marco').screenshot({ path: captura(`portada-mapa-${tema}.png`) });
    }
    ok(errs.length === 0, 'errores JS ' + errs);
    await p.close();
  }
  fin('Mapa interactivo (HU-115)', f);
  await b.close();
})();
