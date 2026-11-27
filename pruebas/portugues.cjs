// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-135: la Guía en portugués de Brasil (/pt/): interfaz traducida, textos oficiales sin tocar, horas con Campo Grande,
// hreflang y selector ES | PT que se recuerda.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
// Palabras de la interfaz en castellano que no deben quedar fuera de lo marcado con lang="es".
const ES = /\b(Hoy|Rutas|Servicios|Pedir cotización|Abierto|Cerrado|Sin confirmar|Ver todos|Tramo a tramo|Puedes ir|Lo que impide|Guardar ruta|Papeles|Calendario|Llamar|Compartir)\b|¿/;
(async () => {
  const b = await lanzar();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const visible = () => p.evaluate(() => {
    const r = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (n.parentElement.closest('[lang="es"]:not(html), script, style, svg, noscript, [hidden]')) continue;
      const v = n.textContent.replace(/\s+/g, ' ').trim();
      if (v) r.push(v);
    }
    return r;
  });

  // ES enlaza la versión PT con hreflang.
  await p.goto(B + '/');
  ok(await p.$('link[rel="alternate"][hreflang="pt-BR"]'), 'falta el hreflang pt-BR en la portada');

  // HU-136: todas las páginas tienen versión en portugués.
  for (const r of ['/pt/', '/pt/planificador/?desde=0&hasta=5', '/pt/pasos/', '/pt/directorio/', '/pt/guia/pasos/jama/', '/pt/guia/pasos/jama/#papeles', '/pt/guia/pasos/jama/#calendario', '/pt/avisos/', '/pt/calendario/', '/pt/papeles/', '/pt/mapa/', '/pt/guia/', '/pt/guia/tramos/py15-chaco/', '/pt/guia/documentos/crt-mic-dta/', '/pt/novedades/', '/pt/buscar/?q=jama', '/pt/anunciate/', '/pt/sobre/', '/pt/fuentes/', '/pt/informe/?desde=0&hasta=5']) {
    await p.goto(B + r);
    await p.waitForTimeout(200);
    ok((await p.getAttribute('html', 'lang')) === 'pt-BR', `${r}: lang debe ser pt-BR`);
    const quedan = (await visible()).filter((t) => ES.test(t));
    ok(!quedan.length, `${r}: quedan textos en castellano: ${quedan.slice(0, 5).join(' | ')}`);
  }

  // HU-136: en portugués, el pie y los menús llevan a páginas en portugués.
  await p.goto(B + '/pt/');
  const pie = await p.$$eval('footer a[href^="/"]', (l) => l.map((a) => a.getAttribute('href')));
  const fuera = pie.filter((h) => !h.startsWith('/pt/') && !h.startsWith('/api/'));
  ok(!fuera.length, 'enlaces del pie en /pt/ que van a páginas en español: ' + fuera.join(', '));
  // El texto de la guía también está traducido.
  await p.goto(B + '/pt/guia/pasos/jama/');
  ok(!(await p.$('#guia-paso')) || /Passagem de cordilheira/.test(await p.textContent('main')), 'el texto de la guía de Jama debe estar en portugués');
  ok(/Histórico e fontes/.test(await p.textContent('main')), 'los plegables nuevos de la ficha deben estar en portugués');

  // Menú, veredicto y horas.
  await p.goto(B + '/pt/');
  ok((await p.$$eval('.menu-app a:not(.menu-marca):not(.menu-extra) span', (l) => l.map((x) => x.textContent))).join(',') === 'Situação,Rotas,Fronteiras,Serviços', 'menú en portugués');
  ok(/em Campo Grande/.test(await p.textContent('.hoy-hora')), 'la hora de referencia en PT es la de Campo Grande');
  await p.goto(B + '/pt/planificador/?desde=0&hasta=5');
  ok(/^(Você pode ir hoje|Nada impede você de ir hoje|Hoje não dá para fazer a rota inteira)/.test((await p.textContent('.veredicto-titulo')).trim()), 'veredicto en portugués');
  await p.screenshot({ path: captura('pt-rotas.png') });

  // Los textos oficiales no se traducen y van marcados.
  await p.goto(B + '/pt/');
  const of = await p.$$eval('.txt-oficial', (l) => l.map((e) => e.getAttribute('lang')));
  ok(of.length && of.every((x) => x === 'es'), 'los avisos oficiales deben quedar en castellano con lang="es"');

  // Enlaces internos: a las páginas con versión PT.
  ok(await p.$eval('.menu-app a[href$="/pt/planificador/"]', () => true).catch(() => false), 'el menú debe enlazar /pt/planificador/');

  // Selector ES | PT: se recuerda.
  await p.goto(B + '/');
  await p.click('.idiomas [data-idioma="pt"]');
  await p.waitForURL(/\/pt\/$/);
  await p.goto(B + '/pasos/');
  await p.waitForURL(/\/pt\/pasos\/$/).catch(() => {});
  ok(p.url().endsWith('/pt/pasos/'), 'con PT elegido, una página española con versión PT debe abrir en PT');
  await p.click('.idiomas [data-idioma="es"]');
  await p.waitForTimeout(300);
  ok(!p.url().includes('/pt/'), 'al elegir ES se queda en español');

  ok(!errs.length, 'errores de JavaScript: ' + errs.join(' | '));
  await b.close();
  fin('Portugués (HU-135)', f);
})();
