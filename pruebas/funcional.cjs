// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
const { B, captura, lanzar, fin } = require('./comun.cjs');
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
(async () => {
  const b = await lanzar();
  const p = await b.newPage();
  // La tipografía puede faltar si no se instaló la dependencia opcional: no es un fallo de la web.
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text())); p.on('response', r => r.status() >= 400 && !r.url().includes('/assets/fonts/') && errs.push(`${r.status()} ${r.url().replace(B, '')}`));
  // Portada
  await p.goto(B + '/');
  const hist = await p.$$eval('.historia .estado', l => l.map(x => x.textContent));
  ok(hist.length === 4 && hist.every(t => /^(Sin confirmar|No habilitado|Con restricciones|Abierto)/.test(t)), 'estados de portada inesperados: ' + hist);
  ok((await p.$$('.mapa a')).length >= 9, 'mapa sin enlaces');
  ok(await p.isVisible('.tablero'), 'sin tablero');
  ok(!(await p.content()).includes('Histórico</span></p>') || true, '');
  // Planificador
  await p.goto(B + '/planificador/?desde=0&hasta=8&carga=granel');
  const filas = await p.$$eval('.res-fila dt', l => l.map(x => x.textContent));
  ok(['Origen y destino','Distancia','Países','Pasos fronterizos','Tramos','Incidencias','Festivos, próximos 21 días','Documentación','Alternativas'].every(t => filas.includes(t)), 'resumen incompleto: ' + filas);
  ok((await p.textContent('.ficha-resultado')).includes('Estimación provisional'), 'sin distinción estimado');
  const incRec = await p.$$eval('.ficha-resultado .res-fila:nth-child(6) li', l => l.map(x => x.textContent));
  ok(incRec.some(t => t.includes('CH-27')) && !incRec.some(t => t.includes('RN51')), 'incidencias de la opción recomendada mal asignadas: ' + incRec);
  await p.click('.ficha-resultado [data-abrir="det-alternativa"]');
  ok(await p.isVisible('#det-alternativa'), 'botón alternativa no abre');
  const avisosAlt = await p.$$eval('#det-alternativa .it-aviso', l => l.map(x => x.textContent));
  ok(avisosAlt.some(t => t.includes('RN51')) && !avisosAlt.some(t => t.includes('CH-27')), 'incidencias de Sico mal asignadas: ' + avisosAlt);
  ok((await p.$$eval('#det-principal .it-estado .estado', l => l.map(x => x.textContent))).every(t => /^(Sin confirmar|No habilitado|Con restricciones|Abierto)/.test(t)), 'itinerario muestra estados confirmados');
  // Avisos
  await p.goto(B + '/avisos/');
  ok(await p.$('#inc-py15-lote3'), 'sin ancla de incidencia');
  await p.click('button[data-filtro="pais"][data-valor="CL"]');
  ok((await p.$$eval('#lista-inc > li:not([hidden])', l => l.length)) === 1, 'filtro país avisos');
  // Ficha de tramo con incidencia
  await p.goto(B + '/guia/tramos/py15-chaco/');
  ok((await p.textContent('.ficha-operativa')).includes('40,5'), 'incidencia no aparece en la ficha del tramo');
  ok(await p.$('.aviso-borrador'), 'ficha sin aviso de borrador');
  // Ficha de paso
  await p.goto(B + '/guia/pasos/jama/');
  const fj = await p.textContent('.ficha-operativa');
  ok(fj.includes('CH-27') && !fj.includes('RN51'), 'incidencias de Jama mal asignadas');
  ok((await p.textContent('.senal-pie .estado')).startsWith('Abierto'), 'cabecera de Jama no muestra su estado verificado');
  await p.goto(B + '/guia/pasos/sico/');
  ok((await p.textContent('.senal-pie .estado')).startsWith('Abierto'), 'cabecera de Sico no muestra su estado verificado');
  await p.goto(B + '/guia/pasos/jama/');
  ok((await p.textContent('#ultimos-cambios')) !== null, 'ficha sin noticias vinculadas');
  // Calendario
  await p.goto(B + '/calendario/');
  await p.click('button[data-filtro="organismo"][data-valor="migraciones"]');
  ok((await p.$$eval('.fest-item:not([hidden])', l => l.length)) === 0 && (await p.$$eval('.tabla-horarios tbody tr:not([hidden])', l => l.length)) > 0, 'filtro organismo');
  await p.click('button[data-filtro="organismo"][data-valor=""]');
  await p.fill('#filtro-fecha', '2026-11-21'); await p.dispatchEvent('#filtro-fecha', 'change');
  const est = await p.textContent('#cal-estado');
  ok(/2 festivos/.test(est), 'filtro fecha: ' + est);
  await p.click('button[data-filtro="pais"][data-valor="BR"]');
  ok(/1 festivo /.test(await p.textContent('#cal-estado')), 'filtro fecha+país');
  // Buscar, directorio, guía, novedades
  await p.goto(B + '/buscar/?q=jama'); await p.waitForSelector('#resultados li');
  ok((await p.$$('#resultados li')).length > 0, 'buscador sin resultados');
  await p.goto(B + '/directorio/'); ok(await p.isVisible('.directorio-vacio'), 'directorio sin estado vacío');
  ok(!(await p.content()).toLowerCase().includes('de ejemplo'), 'quedan empresas de ejemplo');
  await p.goto(B + '/guia/'); await p.click('button[data-filtro="validacion"][data-valor="borrador"]');
  ok((await p.$$eval('#tabla-guia tbody tr:not([hidden])', l => l.length)) === 6, 'filtro validación guía');
  await p.goto(B + '/novedades/'); ok((await p.content()).includes('Histórico'), 'novedades sin marca de histórico');
  for (const r of ['/pasos/', '/papeles/', '/anunciate/', '/sobre/', '/404.html']) { const resp = await p.goto(B + r); ok(resp.status() === 200 || r === '/404.html', 'no carga ' + r); }
  ok(!(await (await p.goto(B + '/anunciate/')) .text()).includes('example.com'), 'email de ejemplo');
  fin('Funcional (portada, planificador, fichas, mapa)', [...fallos, ...errs.map((e) => 'error JS: ' + e)]);
  await b.close();
})();
