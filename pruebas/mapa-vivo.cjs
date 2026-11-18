// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-136: el mapa interactivo (MapLibre) carga en /mapa/, en la portada y en sus versiones en portugués.
// Si MapLibre no está instalado (entorno local sin dependencias), la prueba lo dice y no falla.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const log = [];
  p.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && log.push(`${m.type()}: ${m.text()}`));
  p.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  const res = await p.goto(B + '/assets/vendor/maplibre-gl.js');
  if (!res || res.status() !== 200) {
    console.log('  (MapLibre no instalado: se omite la prueba del mapa interactivo)');
    await b.close();
    return fin('Mapa interactivo (HU-136)', f);
  }
  for (const r of ['/mapa/', '/', '/pt/mapa/', '/pt/']) {
    log.length = 0;
    const r2 = await p.goto(B + r);
    if (!r2 || r2.status() !== 200) { ok(false, `${r}: no responde`); continue; }
    await p.$eval('.mapa-vivo-marco', (e) => e.scrollIntoView()).catch(() => {});
    const estado = await p.waitForFunction(() => document.querySelector('.mapa-vivo-marco')?.dataset.estado === 'mapa', null, { timeout: 20000 }).then(() => 'mapa', async () => p.$eval('.mapa-vivo-marco', (e) => e.dataset.estado).catch(() => 'sin marco'));
    const alto = await p.$eval('#mapa-vivo', (e) => e.getBoundingClientRect().height).catch(() => 0);
    console.log(`  ${r}: estado=${estado} alto=${Math.round(alto)} ${log.join(' | ')}`);
    ok(estado === 'mapa', `${r}: el mapa interactivo no carga (estado ${estado}; ${log.join(' | ')})`);
    ok(alto >= 300, `${r}: el mapa tiene ${Math.round(alto)} px de alto`);
    await p.screenshot({ path: captura(`mapa-${r.replace(/\W+/g, '-')}.png`) });
  }
  await b.close();
  fin('Mapa interactivo (HU-136)', f);
})();
