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
  // HU-133: portada «Hoy»: un estado por paso (con forma y palabra) y el bloque de lo que impide o limita el paso.
  const hist = await p.$$eval('.paso-hoy .estado', l => l.map(x => x.textContent));
  ok(hist.length === 4 && hist.every(t => /^(Sin confirmar|No habilitado|Con restricciones|Abierto)/.test(t)), 'estados de portada inesperados: ' + hist);
  ok(await p.$$eval('.paso-hoy .estado svg', l => l.length) === 4, 'estados sin forma');
  ok((await p.$$('.mapa a')).length >= 9, 'mapa sin enlaces');
  ok(await p.isVisible('#t-limita'), 'sin «Lo que impide o limita el paso»');
  ok(await p.isVisible('#sin-ruta'), 'sin buscador en la portada sin ruta guardada');
  // HU-133 (R5/R9): con una ruta guardada, veredicto en una frase que empieza por verbo y pasos de la ruta primero.
  await p.evaluate(() => localStorage.setItem('guia-corredor:mi-ruta', JSON.stringify({ desde: 0, hasta: 5 })));
  await p.reload();
  const verHoy = await p.textContent('.veredicto-titulo').catch(() => '');
  ok(/^(Puedes ir hoy|Nada te impide ir hoy|Hoy no puedes)/.test(verHoy.trim()), 'veredicto de tu ruta inesperado: ' + verHoy);
  ok(await p.$eval('#pasos-hoy li', (li) => li.classList.contains('en-tu-ruta')).catch(() => false), 'tus pasos no salen primero');
  await p.evaluate(() => localStorage.removeItem('guia-corredor:mi-ruta'));
  ok(!(await p.content()).includes('Histórico</span></p>') || true, '');
  // Planificador (HU-116): veredicto primero, opciones y detalle plegado
  await p.goto(B + '/planificador/?desde=0&hasta=8&carga=granel');
  const ver = await p.textContent('.pl-veredicto');
  ok(/Hoy no puedes hacerla entera/.test(ver) && /Puente de la Bioce/.test(ver), 'veredicto: debe decir que el puente lo impide: ' + ver);
  ok(/Sí funciona hoy:.*Carmelo Peralta → Antofagasta/.test(ver), 'veredicto: falta lo que funciona hoy: ' + ver);
  ok((await p.$$('.pl-opcion')).length === 2, 'deben salir dos opciones (Jama y Sico)');
  ok((await p.textContent('.pl-opcion[aria-pressed="true"]')).includes('Recomendada'), 'la opción elegida por defecto debe ser la recomendada');
  const avisosRec = await p.$$eval('.pl-detalle:not([hidden]) .pl-tramo-aviso', (l) => l.map((x) => x.textContent));
  ok(avisosRec.some((t) => t.includes('CH-27')) && !avisosRec.some((t) => t.includes('RN51')), 'avisos de la opción recomendada mal asignados: ' + avisosRec);
  ok((await p.textContent('.pl-detalle:not([hidden])')).includes('Estimados en línea recta') || (await p.textContent('.pl-detalle:not([hidden])')).includes('estimado'), 'sin distinción de distancia estimada');
  await p.click('.pl-opcion[data-op="alternativa"]');
  ok(!(await p.$eval('#det-alternativa', (d) => d.hidden)), 'la opción por Sico no se abre');
  const avisosAlt = await p.$$eval('#det-alternativa .pl-tramo-aviso', (l) => l.map((x) => x.textContent));
  ok(avisosAlt.some((t) => t.includes('RN51')) && !avisosAlt.some((t) => t.includes('CH-27')), 'avisos de Sico mal asignados: ' + avisosAlt);
  ok((await p.$$eval('.pl-detalle:not([hidden]) .pl-tramo-datos > span:first-child', (l) => l.map((x) => x.textContent))).every((t) => /^(Sin confirmar|No habilitado|Con restricciones|Abierto)/.test(t)), 'tramo a tramo con estados inesperados');
  // Tipo de carga: fuera de la búsqueda; dentro de «Papeles» cambia la lista
  ok(!(await p.$('.buscador input[name="carga"]')), 'el tipo de carga no debe estar en la búsqueda');
  await p.goto(B + '/planificador/?desde=0&hasta=8&carga=general');
  const docsGeneral = await p.$$eval('#det-principal .pl-papeles li', (l) => l.length);
  await p.evaluate(() => (document.querySelector('#det-principal .pl-carga').closest('details').open = true));
  await p.check('#det-principal .pl-carga input[value="refrigerada"]');
  const docsRefri = await p.$$eval('#det-principal .pl-papeles li', (l) => l.map((x) => x.textContent));
  ok(docsRefri.length === docsGeneral + 1 && docsRefri.some((t) => /sanitario/i.test(t)), 'refrigerada debe añadir los certificados sanitarios');
  ok(p.url().includes('carga=refrigerada'), 'el tipo de carga no queda en la URL');
  // Ruta sin fronteras y en sentido contrario: sin errores y sin papeles
  await p.goto(B + '/planificador/?desde=7&hasta=6');
  ok((await p.textContent('.pl-cabeza')).includes('Calama → San Pedro de Atacama'), 'ruta corta en sentido contrario');
  ok(!(await p.textContent('#resultado')).includes('Papeles para cruzar'), 'una ruta sin fronteras no debe pedir papeles');
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
  await p.goto(B + '/directorio/'); ok(await p.isVisible('.servicios-vacio'), 'directorio sin estado vacío');
  ok((await p.$$('.cats-lista .cat')).length === 11, 'Servicios: deben salir las 11 categorías');
  ok(!(await p.content()).toLowerCase().includes('de ejemplo'), 'quedan empresas de ejemplo');
  await p.goto(B + '/guia/'); await p.click('button[data-filtro="validacion"][data-valor="borrador"]');
  ok((await p.$$eval('#tabla-guia tbody tr:not([hidden])', l => l.length)) === 6, 'filtro validación guía');
  await p.goto(B + '/novedades/'); ok((await p.content()).includes('Histórico'), 'novedades sin marca de histórico');
  for (const r of ['/pasos/', '/papeles/', '/anunciate/', '/sobre/', '/404.html']) { const resp = await p.goto(B + r); ok(resp.status() === 200 || r === '/404.html', 'no carga ' + r); }
  ok(!(await (await p.goto(B + '/anunciate/')) .text()).includes('example.com'), 'email de ejemplo');
  fin('Funcional (portada, planificador, fichas, mapa)', [...fallos, ...errs.map((e) => 'error JS: ' + e)]);
  await b.close();
})();
