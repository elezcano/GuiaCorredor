// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-115: puertos de Chile separados y ramales desde Calama (Mejillones, Iquique).
const { B, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(B + '/planificador/');
  const nodos = await p.$$eval('#origen option', (l) => l.map((o) => o.textContent.trim()));
  for (const n of ['San Pedro de Atacama', 'Calama', 'Antofagasta', 'Mejillones', 'Iquique']) ok(nodos.includes(n), `falta ${n} en el planificador`);
  ok(!nodos.some((n) => n.includes('Calama /') || n.includes('Mejillones /')), 'quedan puntos de Chile agrupados');
  // Camino por el ramal: Campo Grande → Iquique pasa por Calama y no por Antofagasta.
  const camino = await p.evaluate(() => {
    const d = JSON.parse(document.getElementById('datos-rutas').textContent);
    const i = (id) => d.nodos.findIndex((n) => n.id === id);
    const ops = GC.opciones(d, i('campo-grande'), i('iquique'));
    const vuelta = GC.opciones(d, i('iquique'), i('mejillones'));
    return { ida: ops[0].tramos.map((t) => `${t.de}>${t.a}`), n: ops.length, vuelta: vuelta[0].tramos.map((t) => `${t.de}>${t.a}`), rango: ops[0].rango };
  });
  ok(camino.ida[camino.ida.length - 1] === 'calama>iquique' && !camino.ida.some((x) => x.includes('antofagasta')), 'Campo Grande → Iquique: ' + camino.ida);
  ok(camino.n === 2, 'Campo Grande → Iquique: debe ofrecer Jama y Sico');
  ok(camino.vuelta.join(' ') === 'iquique>calama calama>mejillones', 'Iquique → Mejillones: ' + camino.vuelta);
  await p.goto(B + '/planificador/?desde=0&hasta=10');
  ok(/Iquique/.test(await p.textContent('main')), 'el planificador no muestra la ruta a Iquique');
  ok(errs.length === 0, 'errores JS ' + errs);
  fin('Puertos de Chile y ramales (HU-115)', f);
  await b.close();
})();
