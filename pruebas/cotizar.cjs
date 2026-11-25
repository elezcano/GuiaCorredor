// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Decisión 37 (25/11/2026): «Pedir cotización» en 3 pasos (bocetos 2.1–4.1 del lienzo, versión 6).
// Casos del encargo: transporte completo, aduana, almacén, paso de frontera y peso desconocidos, datos de contacto
// incompletos, error de envío sin perder lo escrito, doble envío, camión vacío, prellenado desde el planificador,
// teclado y estadísticas sin datos personales.
const { B, lanzar, fin } = require('./comun.cjs');
const f = [];
const ok = (c, m) => c || f.push(m);

(async () => {
  const b = await lanzar();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  let envios = [];
  let fallar = false;
  let espera = 0;
  await p.route('**/formResponse', async (r) => {
    envios.push(new URLSearchParams(r.request().postData() || ''));
    if (espera) await new Promise((res) => setTimeout(res, espera));
    if (fallar) return r.abort();
    await r.fulfill({ status: 200, body: '' });
  });
  const campo = (params, k) => params.get(`entry.${['tipo', 'desde', 'hasta', 'carga', 'peso', 'fecha', 'empresa', 'telefono', 'email', 'id', 'servicio', 'origen_pais', 'destino_pais', 'paso', 'cuando', 'mercancia', 'viajes', 'equipo', 'especial', 'nombre', 'perfil', 'compartir'].indexOf(k) + 1}`);
  const abrir = async (ruta = '/cotizar/') => {
    envios = [];
    await p.goto(B + ruta);
    await p.evaluate(() => { window.__gc = []; window.goatcounter = { count: (o) => window.__gc.push(o) }; });
  };
  const chip = (name, valor) => p.click(`label:has(> input[name="${name}"][value="${valor}"]:not([disabled]))`);
  const seguir = () => p.click('#cot-seguir');
  const paso1 = async (servicio = 'Transporte de carga') => {
    await chip('servicio', servicio);
    await chip('origen_pais', 'Paraguay');
    await p.fill('#cot-origen', 'Asunción');
    await chip('destino_pais', 'Chile');
    await p.fill('#cot-destino', 'Iquique');
    await chip('cuando', 'Este mes');
    await seguir();
  };
  const paso3 = async () => {
    await p.fill('#cot-nombre', 'Ana Prueba');
    await p.fill('#cot-empresa', 'Empresa de prueba');
    await p.fill('#cot-tel', '981 123 456');
  };
  const enviar = async () => {
    await p.click('#cot-enviar');
    await p.waitForSelector('#cot-ok:not([hidden])', { timeout: 3000 }).catch(() => {});
  };
  const visible = (s) => p.$eval(s, (el) => !el.closest('[hidden]')).catch(() => false);

  // Nada premarcado salvo «No lo sé» en el paso de frontera.
  await abrir();
  const marcados = await p.$$eval('#form-cotizar input:checked', (xs) => xs.map((x) => `${x.name}=${x.value}`));
  ok(marcados.length === 1 && marcados[0] === 'paso=No lo sé', 'Cotizar: solo «No lo sé» viene marcado: ' + marcados.join(', '));

  // 1. Transporte completo, sin saber el paso de frontera ni el peso.
  await seguir();
  ok(/Falta/.test(await p.textContent('#cot-error')), 'Cotizar: «Seguir» sin datos avisa de lo que falta');
  ok(await visible('.cot-paso[data-paso="1"]'), 'Cotizar: con datos que faltan no se pasa de paso');
  await paso1();
  ok(await visible('[data-variante="carga"]'), 'Cotizar: transporte muestra el paso 2 de carga');
  await p.fill('#cot-merc', 'Soja en bolsas');
  await chip('carga', 'Carga general');
  await p.check('input[name="peso_nose"]:not([disabled])');
  await chip('viajes', 'Un viaje');
  await seguir();
  ok(/Asunción \(PY\) → Iquique \(CL\)/.test(await p.textContent('#cot-resumen')), 'Cotizar: el resumen muestra la ruta');
  // Contacto incompleto: no envía y dice qué falta.
  await p.fill('#cot-nombre', 'Ana Prueba');
  await p.click('#cot-enviar');
  ok(envios.length === 0 && /Empresa/.test(await p.textContent('#cot-error')), 'Cotizar: sin empresa ni teléfono no envía y lo dice');
  await paso3();
  await enviar();
  ok(envios.length === 1, 'Cotizar: un solo envío');
  const e1 = envios[0];
  ok(e1 && campo(e1, 'servicio') === 'Transporte de carga' && campo(e1, 'desde') === 'Asunción' && campo(e1, 'origen_pais') === 'Paraguay', 'Cotizar: servicio y ruta en el envío');
  ok(e1 && campo(e1, 'paso') === 'No lo sé' && /confirmar/.test(campo(e1, 'peso')), 'Cotizar: paso y peso desconocidos se envían como tales: ' + (e1 && campo(e1, 'peso')));
  ok(e1 && campo(e1, 'telefono') === '+595 981 123 456' && campo(e1, 'compartir') === 'No', 'Cotizar: prefijo del país de origen y compartir en «No» por defecto');
  ok(e1 && /^RC-\d{6}-[A-Z0-9]{3}$/.test(campo(e1, 'id')) && (await p.textContent('#cot-id')) === campo(e1, 'id'), 'Cotizar: el número de solicitud se envía y se muestra');
  ok(!/se ha enviado a empresas|recibirás una cotización/i.test(await p.textContent('#cot-ok')), 'Cotizar: la confirmación no promete lo que no hay');
  const gc = await p.evaluate(() => window.__gc);
  ok(gc.some((x) => x.path === 'envio-cotizacion') && gc.some((x) => x.path === 'cotizar-paso-3'), 'Estadísticas: inicio, pasos y envío: ' + JSON.stringify(gc.map((x) => x.path)));
  ok(!/Ana|prueba|981|Asunción|Soja/i.test(JSON.stringify(gc)), 'Estadísticas: los eventos no llevan nada de lo escrito');

  // 2. Despacho de aduana: su propio paso 2; el detalle va en «Algo especial».
  await abrir();
  await paso1('Despacho de aduana');
  ok(await visible('[data-variante="aduana"]') && !(await visible('[data-variante="carga"]')), 'Cotizar: aduana muestra su paso 2');
  await chip('operacion', 'Exportación');
  await p.fill('#cot-merc-a', 'Carne congelada');
  await chip('documentos', 'Factura comercial');
  await chip('con_transporte', 'Sí');
  await seguir();
  await paso3();
  await enviar();
  ok(envios[0] && /Operación: Exportación · Documentos: Factura comercial · Transporte: Sí/.test(campo(envios[0], 'especial')), 'Cotizar: aduana envía su detalle: ' + (envios[0] && campo(envios[0], 'especial')));

  // 3. Almacenamiento: cantidad con unidad y tiempo.
  await abrir();
  await paso1('Almacenamiento');
  await p.fill('#cot-merc-b', 'Maquinaria');
  await p.fill('#cot-cant', '24');
  await chip('tiempo', 'Semanas');
  await seguir();
  await paso3();
  await enviar();
  ok(envios[0] && campo(envios[0], 'peso') === '24 pallets' && /Tiempo: Semanas/.test(campo(envios[0], 'especial')), 'Cotizar: almacén envía cantidad y tiempo');

  // 4. Error de envío: no se pierde nada y se ofrece el email; doble clic: un solo envío.
  await abrir();
  await paso1();
  await p.fill('#cot-merc', 'Soja');
  await chip('carga', 'Granel');
  await p.fill('#cot-peso', '28 t');
  await chip('viajes', 'Varios');
  await seguir();
  await paso3();
  fallar = true;
  await p.click('#cot-enviar');
  await p.waitForSelector('#cot-fallo:not([hidden])', { timeout: 3000 }).catch(() => {});
  ok(await visible('#cot-fallo'), 'Cotizar: si falla el envío, lo dice');
  ok((await p.inputValue('#cot-nombre')) === 'Ana Prueba' && (await p.inputValue('#cot-tel')) === '981 123 456', 'Cotizar: tras el error los datos siguen escritos');
  ok(/^mailto:.*RC-/.test(await p.getAttribute('#cot-por-email', 'href')), 'Cotizar: ofrece enviarla por email con su número');
  fallar = false;
  espera = 400;
  envios = [];
  await p.dblclick('#cot-enviar');
  await p.waitForSelector('#cot-ok:not([hidden])', { timeout: 3000 }).catch(() => {});
  espera = 0;
  ok(envios.length === 1, 'Cotizar: el doble clic envía una sola vez: ' + envios.length);

  // 5. Camión vacío (?tipo=retorno): mismo formulario, sin elegir servicio.
  await abrir('/cotizar/?tipo=retorno');
  ok(await visible('#t-cotizar [data-modo="retorno"]') && !(await visible('[data-clave="servicio"]')), 'Cotizar: modo vuelta sin servicio');
  await chip('origen_pais', 'Chile');
  await p.fill('#cot-origen', 'Antofagasta');
  await chip('destino_pais', 'Paraguay');
  await p.fill('#cot-destino', 'Asunción');
  await chip('cuando', 'Esta semana');
  await seguir();
  await chip('equipo', 'Semirremolque');
  await seguir();
  await paso3();
  await enviar();
  ok(envios[0] && campo(envios[0], 'tipo') === 'Tengo el camión vacío' && campo(envios[0], 'equipo') === 'Semirremolque' && campo(envios[0], 'telefono').startsWith('+56'), 'Cotizar: la vuelta se envía como camión vacío');

  // 6. Desde el planificador: ?desde=0&hasta=… (índices) llega con ciudad, país y transporte elegidos.
  await abrir('/cotizar/?desde=0&hasta=2&carga=Granel');
  ok((await p.inputValue('#cot-origen')).length > 0 && (await p.$('input[name="origen_pais"]:checked')) && (await p.$('input[name="servicio"][value="Transporte de carga"]:checked')), 'Cotizar: el enlace del planificador rellena origen y servicio');

  // 7. Teclado: se puede elegir y avanzar sin ratón.
  await abrir();
  await p.focus('input[name="servicio"][value="Transporte de carga"]');
  await p.keyboard.press('Space');
  ok(await p.$('input[name="servicio"][value="Transporte de carga"]:checked'), 'Cotizar: el servicio se elige con el teclado');

  // 8. Privacidad: el aviso dice para qué y a quién escribir.
  ok(/solo para ayudarte a encontrar cotización/.test(await p.textContent('.cot-priv')), 'Cotizar: aviso de para qué se usan los datos');

  ok(!errs.length, 'Errores de JavaScript: ' + errs.join(' | '));
  await b.close();
  fin('Cotizar en 3 pasos (decisión 37)', f);
})();
