// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Decisión 31 (22/11/2026): estado por lado del paso, Chile informa por aviso, horario aparte del estado.
// Y lo que sostiene el negocio: los formularios envían a su hoja y cuentan el envío sin datos personales.
// Datos de prueba: Chile informa por aviso y su canal se revisó el 12/11 (plazo de 15 días). Sico tiene parte oficial
// argentino del 15/11 y ninguno chileno; Jama tiene su estado de prensa.
const { B, captura, lanzar, fin } = require('./comun.cjs');
const f = [];
const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));

  // 1. Sico: Argentina con parte oficial y Chile «sin avisos» dentro de plazo → Abierto, diciendo cómo lo sabemos.
  await p.goto(B + '/guia/pasos/sico/');
  const lados = await p.$$eval('.lados-paso .lado', (l) => l.map((x) => ({ cls: x.className, t: x.innerText, a: x.querySelector('a')?.href || '' })));
  ok(lados.length === 2, 'Sico: una línea por lado (2): ' + lados.length);
  const ar = lados.find((x) => /Argentina/.test(x.t));
  const cl = lados.find((x) => /Chile/.test(x.t));
  ok(ar && /lado-parte/.test(ar.cls) && /Habilitado/.test(ar.t) && /parte oficial del 15 nov, 09:50/.test(ar.t), 'Sico: Argentina «Habilitado · parte oficial del 15 nov, 09:50»: ' + ar?.t);
  ok(cl && /lado-aviso/.test(cl.cls) && /Sin avisos desde el 12 nov/.test(cl.t) && /solo avisa cuando hay un problema/.test(cl.t), 'Sico: Chile «Sin avisos desde el 12 nov» con la explicación: ' + cl?.t);
  ok(cl && /x\.com\/UPFronterizos/.test(cl.a), 'Sico: el lado chileno enlaza su canal oficial');
  ok(/^Abierto/.test((await p.textContent('.respuesta-titulo')).trim()), 'Sico: la respuesta dice «Abierto»');
  const fila = await p.textContent('.tablero-fila.sel');
  ok(/Abierto/.test(fila) && /Chile: sin avisos desde el 12 nov/.test(fila) && !/Sin confirmar/.test(fila), 'Sico en el tablero: «Abierto · Chile: sin avisos desde el 12 nov»: ' + fila.replace(/\s+/g, ' '));
  ok(await p.$('.tablero-fila.sel .estado-por-aviso'), 'Sico en el tablero: marca visual de «por aviso»');
  ok(!/Cerrado ahora/.test(await p.textContent('main')), 'El horario no dice «Cerrado ahora» (eso es un estado): dice «Fuera de horario»');
  await (await p.$('.respuesta')).screenshot({ path: captura('lados-sico.png') });

  // 2. Jama: su estado viene de prensa, así que no puede salir «Abierto» aunque Chile no haya avisado de nada.
  await p.goto(B + '/guia/pasos/jama/');
  ok((await p.textContent('.tablero-fila.sel .estado')).startsWith('Sin confirmar'), 'Jama: estado de prensa → «Sin confirmar»');
  const lj = await p.$$eval('.lados-paso .lado', (l) => l.map((x) => ({ cls: x.className, t: x.innerText })));
  ok(lj.some((x) => /Chile/.test(x.t) && /lado-aviso/.test(x.cls)), 'Jama: el lado chileno dice igualmente «Sin avisos»: ' + JSON.stringify(lj));

  // 3. Horario aparte: el tablero dice si está dentro o fuera de horario, sin tocar el estado.
  const horas = await p.$$eval('.tablero-hora .hora-estado', (l) => l.map((x) => x.textContent));
  ok(horas.length >= 2 && horas.every((t) => /cierra en|Fuera de horario · abre/.test(t)), 'Tablero: estado del horario en cada paso con horario: ' + horas);

  // 4. Cotizar: el formulario envía a su hoja (formResponse) y cuenta el envío sin datos personales.
  await p.goto(B + '/cotizar/');
  const form = await p.$eval('#form-cotizar', (x) => ({ accion: x.dataset.accion || '', campos: JSON.parse(x.dataset.campos || '{}') }));
  ok(/\/formResponse$/.test(form.accion), 'Cotizar: envía al formulario de Google (formResponse): ' + form.accion);
  ok(['tipo', 'desde', 'hasta', 'carga', 'peso', 'fecha', 'empresa', 'telefono', 'email'].every((k) => /^entry\.\d+$/.test(form.campos[k] || '')), 'Cotizar: los 9 campos tienen su entry: ' + JSON.stringify(form.campos));
  let enviado = null;
  await p.route('**/formResponse', async (r) => { enviado = r.request().postData(); await r.fulfill({ status: 200, body: '' }); });
  await p.evaluate(() => { window.__gc = []; window.goatcounter = { count: (o) => window.__gc.push(o) }; });
  await p.selectOption('select[name=desde]', { index: 1 });
  await p.selectOption('select[name=hasta]', { index: 2 });
  await p.fill('input[name=empresa]', 'Empresa de prueba');
  await p.fill('input[name=telefono]', '+595 21 123 456');
  await p.click('#form-cotizar [type=submit]');
  await p.waitForSelector('#form-cotizar .form-ok:not([hidden])', { timeout: 3000 }).catch(() => {});
  ok(/Solicitud enviada/.test(await p.textContent('#form-cotizar .form-ok')), 'Cotizar: confirma «Solicitud enviada»');
  ok(enviado && /entry\.7=Empresa\+de\+prueba/.test(enviado), 'Cotizar: los datos van en el envío al formulario: ' + enviado);
  const gc = await p.evaluate(() => window.__gc);
  ok(gc.length === 1 && gc[0].event === true && /^envio-/.test(gc[0].path), 'Estadísticas: un evento de envío: ' + JSON.stringify(gc));
  ok(gc.length === 1 && !/prueba|595|@/.test(JSON.stringify(gc[0])), 'Estadísticas: el evento no lleva nada de lo escrito');

  // 5. Anunciarme: las solicitudes de empresas también van a su formulario.
  await p.goto(B + '/anunciate/');
  ok(/\/formResponse$/.test(await p.$eval('#solicitud', (x) => x.dataset.accion || '')), 'Anunciarme: la solicitud va al formulario de Google');

  // 6. Las estadísticas solo cuentan en la web publicada: en local y en las pruebas no hay script.
  ok(!(await p.$('script[data-goatcounter]')), 'Sin script de estadísticas fuera de la web publicada');

  ok(errs.length === 0, 'errores JS: ' + errs);
  fin('Estado por lado, horario y formularios (decisión 31)', f);
  await b.close();
})();
