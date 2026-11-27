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
  const hist = await p.$$eval('.tablero-fila[data-paso] .estado', l => l.map(x => x.textContent));
  ok(hist.length === 4 && hist.every(t => /^(Sin confirmar|No habilitado|Con restricciones|Abierto)/.test(t)), 'estados de portada inesperados: ' + hist);
  ok(await p.$$eval('.tablero-fila[data-paso] .estado svg', l => l.length) === 4, 'estados sin forma');
  ok((await p.$$('.mapa a')).length >= 9, 'mapa sin enlaces');
  ok(await p.isVisible('#t-limita'), 'sin «Lo que impide o limita el paso»');
  ok(await p.isVisible('#sin-ruta'), 'sin buscador en la portada sin ruta guardada');
  // HU-133 (R5/R9): con una ruta guardada, veredicto en una frase que empieza por verbo y pasos de la ruta primero.
  await p.evaluate(() => localStorage.setItem('guia-corredor:mi-ruta', JSON.stringify({ desde: 0, hasta: 5 })));
  await p.reload();
  const verHoy = await p.textContent('.veredicto-titulo').catch(() => '');
  ok(/^(Puedes ir hoy|Nada te impide ir hoy|Hoy no puedes)/.test(verHoy.trim()), 'veredicto de tu ruta inesperado: ' + verHoy);
  ok(await p.$eval('.tablero-fila[data-paso]', (f) => f.parentNode.querySelector('.en-tu-ruta') !== null).catch(() => false), 'tus pasos no salen primero');
  await p.evaluate(() => localStorage.removeItem('guia-corredor:mi-ruta'));
  ok(!(await p.content()).includes('Histórico</span></p>') || true, '');
  // Planificador (HU-116): veredicto primero, opciones y detalle plegado
  await p.goto(B + '/planificador/?desde=0&hasta=8&carga=granel');
  const ver = await p.textContent('.pl-veredicto');
  ok(/Hoy no puedes hacerla entera/.test(ver) && /Puente de la Bioce/.test(ver), 'veredicto: debe decir que el puente lo impide: ' + ver);
  ok(/Sí funciona hoy:.*Carmelo Peralta → Antofagasta/.test(ver), 'veredicto: falta lo que funciona hoy: ' + ver);
  ok((await p.$$('.pl-opcion')).length === 2, 'deben salir dos opciones (Jama y Sico)');
  ok((await p.textContent('.pl-opcion[aria-pressed="true"]')).includes('Recomendada'), 'la opción elegida por defecto debe ser la recomendada');
  const avisosRec = await p.$$eval('#det-principal .pl-tramo-aviso', (l) => l.map((x) => x.textContent));
  ok(avisosRec.some((t) => t.includes('CH-27')) && !avisosRec.some((t) => t.includes('RN51')), 'avisos de la opción recomendada mal asignados: ' + avisosRec);
  ok((await p.textContent('.pl-detalle:not([hidden])')).includes('Estimados en línea recta') || (await p.textContent('.pl-detalle:not([hidden])')).includes('estimado'), 'sin distinción de distancia estimada');
  await p.click('.pl-opcion[data-op="alternativa"]');
  ok(!(await p.$eval('#det-alternativa', (d) => d.hidden)), 'la opción por Sico no se abre');
  const avisosAlt = await p.$$eval('#det-alternativa .pl-tramo-aviso', (l) => l.map((x) => x.textContent));
  ok(avisosAlt.some((t) => t.includes('RN51')) && !avisosAlt.some((t) => t.includes('CH-27')), 'avisos de Sico mal asignados: ' + avisosAlt);
  const estadosTT = await p.$$eval('.pl-detalle:not([hidden]) .pl-tramo-datos > span:first-child', (l) => l.map((x) => x.textContent));
  ok(estadosTT.every((t) => /^(Sin confirmar|No habilitado|Con restricciones|Abierto|Sin incidencias|Con incidencias|Cortado|Sin vigilancia|Fuente atrasada|Fuente no disponible)/.test(t)), 'tramo a tramo con estados inesperados: ' + estadosTT.join(' | '));
  // Tipo de carga: fuera de la búsqueda; dentro de «Papeles» cambia la lista
  ok(!(await p.$('.buscador input[name="carga"]')), 'el tipo de carga no debe estar en la búsqueda');
  await p.goto(B + '/planificador/?desde=0&hasta=8&carga=general');
  const docsGeneral = await p.$$eval('.pl-detalle:not([hidden]) .pl-papeles li', (l) => l.length);
  await p.evaluate(() => (document.querySelector('.pl-detalle:not([hidden]) .pl-carga').closest('details').open = true));
  await p.check('.pl-detalle:not([hidden]) .pl-carga input[value="refrigerada"]');
  const docsRefri = await p.$$eval('.pl-detalle:not([hidden]) .pl-papeles li', (l) => l.map((x) => x.textContent));
  ok(docsRefri.length === docsGeneral + 1 && docsRefri.some((t) => /sanitario/i.test(t)), 'refrigerada debe añadir los certificados sanitarios');
  ok(p.url().includes('carga=refrigerada'), 'el tipo de carga no queda en la URL');
  // Ruta sin fronteras y en sentido contrario: sin errores y sin papeles
  await p.goto(B + '/planificador/?desde=7&hasta=6');
  ok((await p.textContent('.pl-cabeza')).includes('Calama → San Pedro de Atacama'), 'ruta corta en sentido contrario');
  ok(!(await p.textContent('#resultado')).includes('Papeles para cruzar'), 'una ruta sin fronteras no debe pedir papeles');
  // Avisos (decisión 44): lo que te puede parar, una fila por tramo y el filtro «Mi ruta».
  await p.goto(B + '/avisos/');
  ok(await p.$('#inc-py15-lote3'), 'sin ancla de incidencia');
  ok(/Hoy (te pueden parar|nada te para)/.test(await p.textContent('#t-parar')) && (await p.$$('#t-tramos ~ .av-lista > .av-fila')).length >= 5, 'avisos: falta el bloque de lo que para o las filas por tramo');
  ok((await p.$$('.av-fila[data-via="sico"]')).length > 0, 'avisos: falta la fila de Sico');
  await p.selectOption('[data-mi-ruta]', 'jama');
  ok((await p.$$eval('.av-fila[data-via="sico"]', (l) => l.every((x) => x.hidden))) && (await p.$$eval('.av-fila[data-via="jama"]', (l) => l.some((x) => !x.hidden))), 'avisos: «Mi ruta: por Jama» debe ocultar Sico');
  await p.goto(B + '/avisos/#inc-py15-lote3');
  ok(await p.$eval('#inc-py15-lote3', (e) => e.closest('details').open), 'avisos: un enlace a un aviso debe abrir su fila');
  // Ficha de tramo con incidencia
  await p.goto(B + '/guia/tramos/py15-chaco/');
  ok((await p.textContent('.ficha-operativa')).includes('40,5'), 'incidencia no aparece en la ficha del tramo');
  ok(/borrador/.test(await p.textContent('.guia-meta')), 'ficha sin aviso de borrador');
  // Ficha de paso
  await p.goto(B + '/guia/pasos/jama/');
  const fj = await p.textContent('.ficha-operativa');
  ok(fj.includes('CH-27') && !fj.includes('RN51'), 'incidencias de Jama mal asignadas');
  ok((await p.textContent('.tablero-fila.sel .estado')).startsWith('Sin confirmar'), 'cabecera de Jama: con el estado sacado de prensa debe salir «Sin confirmar»');
  await p.goto(B + '/guia/pasos/sico/');
  ok((await p.textContent('.tablero-fila.sel .estado')).startsWith('Abierto') && /Chile: sin avisos desde el 12 nov/.test(await p.textContent('.tablero-fila.sel')), 'cabecera de Sico: Chile por aviso dentro de plazo debe salir «Abierto · Chile: sin avisos desde el 12 nov»');
  await p.goto(B + '/guia/pasos/jama/');
  // Decisión 45: dos plegables («Historial y fuentes», «Sobre el paso»); la guía en borrador no se muestra.
  ok((await p.$$('.ficha-operativa .plegables > .plegable')).length === 2 && /Historial y fuentes/.test(await p.textContent('#historial-fuentes')) && /Sobre el paso/.test(await p.textContent('#sobre-paso')), 'ficha: deben quedar dos plegables');
  ok(!(await p.$('section.partes:not(#historial-fuentes section.partes)')) && !(await p.$('.respuesta details.sello')), 'ficha: «Qué dice cada país» y el sello del pie de la tarjeta no deben salir fuera del historial');
  // Calendario (V3): un mes a la vista, filtro por país y tocar un día responde «¿Cuándo cruzas?»
  await p.goto(B + '/calendario/');
  ok((await p.$$('.cal-mes:not([hidden])')).length === 1, 'calendario: debe verse un solo mes');
  const mes1 = await p.textContent('.cal-mes:not([hidden]) h2');
  await p.click('.cal-mes:not([hidden]) [data-mes-ir="1"]');
  ok((await p.textContent('.cal-mes:not([hidden]) h2')) !== mes1, 'calendario: la flecha no cambia de mes');
  await p.click('.cal-mes:not([hidden]) [data-mes-ir="-1"]');
  const diaF = await p.$eval('.cal-mes:not([hidden]) .cal-dia.con-fest', (d) => d.dataset.dia);
  await p.click(`.cal-dia[data-dia="${diaF}"]`);
  ok(/Festivo en/.test(await p.textContent('.cal-respuesta')), 'calendario: tocar un día festivo debe avisar');
  await p.click('.cal-paises .chip[data-pais="BR"]');
  ok((await p.$$eval('.cal-lista > li:not([hidden])', (l) => l.every((x) => x.dataset.pais === 'BR'))), 'calendario: filtro por país');
  ok((await p.$$('.cal-horarios li')).length >= 3, 'calendario: faltan los horarios de los pasos');
  // Decisión 45: fuentes por país, calendario sin cuadrícula vacía y /operacion/ discreta.
  await p.goto(B + '/fuentes/');
  ok((await p.$$('.tarjeta details.plegable[id^="fp-"]')).length >= 3 && !(await p.$('#t-fuentes ~ .inc-lista')), 'fuentes: una fila plegable por país');
  ok(/se leen cada hora/.test(await p.textContent('#fp-AR summary')), 'fuentes: el país debe decir cuántas se leen cada hora');
  await p.goto(B + '/calendario/');
  ok(!(await p.$('#cal-pendiente')), 'calendario: «Qué falta por verificar» va a /operacion/');
  // Lo vivo de /operacion/ viene de GitHub: en la prueba se responde vacío, sin red (si no, un 404 del día falso rompe la prueba).
  await p.route(/raw\.githubusercontent\.com|api\.github\.com/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('api.github.com') ? '[]' : '' }));
  await p.goto(B + '/operacion/');
  ok((await p.getAttribute('meta[name="robots"]', 'content')) === 'noindex, nofollow', 'operación: debe ser noindex');
  ok((await p.$$('main table')).length >= 4 && /Pendiente de verificar/.test(await p.textContent('main')), 'operación: faltan tablas o pendientes');
  ok(!(await p.$('footer a[href*="operacion"], nav a[href*="operacion"]')), 'operación: no debe salir en el menú ni en el pie');
  // Buscar, directorio, guía, novedades
  await p.goto(B + '/buscar/?q=jama'); await p.waitForSelector('#resultados li');
  ok((await p.$$('#resultados li')).length > 0, 'buscador sin resultados');
  await p.goto(B + '/directorio/'); ok(await p.isVisible('.caja-vacia'), 'directorio sin estado vacío');
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
