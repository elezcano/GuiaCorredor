// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-133 (Versión 2): pestañas de la ficha, papeles guardados, calendario, dos horas, formas de estado y sin conexión.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));

  // Menú de 4 secciones en la barra inferior, y las páginas que salen del menú siguen respondiendo.
  await p.goto(B + '/');
  ok((await p.$$('.barra-inferior a')).length === 4, 'la barra inferior debe tener 4 secciones');
  for (const r of ['/avisos/', '/calendario/', '/papeles/']) ok((await p.goto(B + r)).status() === 200, `${r} debe seguir respondiendo`);

  // Ficha del paso: pestañas Hoy · Papeles · Calendario.
  await p.goto(B + '/guia/pasos/jama/');
  ok((await p.$$('.pestanas [role="tab"]')).length === 3, 'la ficha debe tener 3 pestañas');
  ok(!(await p.isVisible('#papeles')), 'Papeles empieza oculto');
  // Horario con la hora de España.
  ok(/en España/.test(await p.textContent('#hoy')), 'la ficha debe dar la hora de España');
  await p.click('#tab-papeles');
  ok(await p.isVisible('#papeles') && !(await p.isVisible('#hoy')), 'la pestaña Papeles no se abre');
  const nGeneral = await p.$$eval('.papeles-lista li:not([hidden])', (l) => l.length);
  await p.click('input[name="carga-paso"][value="refrigerada"] >> xpath=..');
  const nRefri = await p.$$eval('.papeles-lista li:not([hidden])', (l) => l.length);
  ok(nRefri >= nGeneral, 'la lista de papeles debe cambiar con la carga');
  await p.click('.papeles-lista li:not([hidden]) .papel');
  await p.reload();
  await p.click('#tab-papeles');
  ok(await p.$eval('.papeles-lista li:not([hidden]) input', (i) => i.checked), 'lo marcado en Papeles debe conservarse al volver');
  ok(/1 listo/.test(await p.textContent('.papeles-cuenta')), 'la cuenta de papeles listos no cuadra');
  await p.screenshot({ path: captura('v2-ficha-papeles.png') });

  // Calendario: el 20/11 es festivo en Brasil (no en Argentina ni Chile); se dice tal cual.
  await p.goto(B + '/guia/pasos/jama/#calendario');
  ok(await p.isVisible('#calendario'), '#calendario debe abrir su pestaña');
  ok(/no es festivo en Argentina ni en Chile/.test(await p.textContent('.cal-respuesta')), 'calendario: hoy no es festivo en Jama: ' + (await p.textContent('.cal-respuesta')));
  const fest = await p.$eval('.calendario-paso', (c) => JSON.parse(c.dataset.calPaso).festivos[0]);
  if (fest) {
    await p.$eval('#calendario input[name="fecha"]', (i, v) => { i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); }, fest.fecha);
    const t = await p.textContent('.cal-respuesta');
    ok(/Festivo en/.test(t) && t.includes(fest.nombre), 'calendario: un festivo debe avisar con su nombre: ' + t);
    ok(/Nadie ha publicado horario especial|Horario especial publicado/.test(t), 'calendario: debe decir si hay horario especial');
  }

  // Formas de estado: ningún estado solo con color.
  await p.goto(B + '/pasos/');
  ok(await p.$$eval('.paso-tarjeta .estado', (l) => l.every((e) => e.querySelector('svg') && e.textContent.trim())), 'estados sin forma o sin palabra');

  // Sin conexión: tras una visita, la web abre lo guardado con la banda y la hora de los datos.
  await p.goto(B + '/');
  await p.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
  await p.waitForTimeout(800);
  // Criterio 11: tras una visita previa a cada página.
  for (const r of ['/', '/planificador/', '/guia/pasos/jama/']) await p.goto(B + r);
  await ctx.setOffline(true);
  let ultima = p;
  for (const r of ['/', '/planificador/', '/guia/pasos/jama/']) {
    const q = await ctx.newPage();
    const res = await q.goto(B + r).catch(() => null);
    const banda = res && (await q.waitForSelector('#banda-sin-red', { timeout: 4000 }).then(() => true, () => false));
    ok(banda && (await q.title()) !== '', `sin conexión: ${r} debe abrir con la banda «Sin conexión»`);
    ultima = q;
  }
  ok(/Ves los datos guardados del .* en España/.test(await ultima.textContent('#banda-sin-red').catch(() => '')), 'la banda sin conexión debe dar la hora de los datos');
  await ultima.screenshot({ path: captura('v2-sin-conexion.png') });
  await ctx.setOffline(false);

  ok(!errs.length, 'errores de JavaScript: ' + errs.join(' | '));
  await b.close();
  fin('Versión 2 (HU-133)', f);
})();
