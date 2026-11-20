// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-131 (+21/11/2026): estados de los tramos de carretera (Sin incidencias, Fuente atrasada, Fuente no disponible, Sin vigilancia).
// Datos de prueba: pruebas/datos/vigilancia-estado.json (la fuente de Chile lleva 3 lecturas fallidas).
const { B, lanzar, fin } = require('./comun.cjs');
const f = []; const ok = (c, m) => c || f.push(m);
(async () => {
  const b = await lanzar();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto(B + '/planificador/');
  const rutas = JSON.parse(await p.$eval('#datos-rutas', (s) => s.textContent));
  const t = (id) => rutas.tramos.find((x) => x.id === id);
  ok(t('cp-me').vista.etiqueta === 'Sin incidencias' && t('cp-me').vista.confirmado && t('cp-me').op === 'abierto', `Carmelo Peralta → Mariscal (MOPC vigilado): «Sin incidencias» (${t('cp-me').vista.etiqueta}).`);
  ok(t('cg-pm').vista.etiqueta === 'Sin incidencias' && /DNIT/.test(t('cg-pm').vista.vigilancia.organismos), 'Campo Grande → Porto Murtinho (DNIT vigilado): «Sin incidencias».');
  ok(t('calama-antofagasta').vista.etiqueta === 'Fuente no disponible' && !t('calama-antofagasta').vista.confirmado, `Calama → Antofagasta (Chile con 3 fallos, HTTP 503): «Fuente no disponible» (${t('calama-antofagasta').vista.etiqueta}).`);
  // En la guía, el tramo vigilado dice quién lo vigila y enlaza a «Fuentes».
  await p.goto(B + '/guia/tramos/py15-chaco/');
  const est = await p.textContent('.ficha-operativa');
  ok(/publica: /.test(est), 'guía de la PY15: dice cada cuánto publica el organismo («publica: …»), aparte de cuándo lo comprobamos.');
  ok(/Sin incidencias/.test(est) && /MOPC · comprobado cada hora/.test(est) && !/Sin confirmar/.test(est), 'guía de la PY15: «Sin incidencias · MOPC · vigilado cada hora».');
  ok(await p.$('.ficha-operativa a[href$="/fuentes/"]'), 'guía de la PY15: «comprobado cada hora» enlaza a la página de fuentes.');
  // Un tramo con avisos activos no dice «Sin incidencias».
  const conAvisos = rutas.tramos.filter((x) => !x.paso && rutas.incidencias.some((i) => !i.paso && (i.tramos || []).includes(x.id) && i.gravedad !== 'info'));
  ok(conAvisos.every((x) => ['Con incidencias', 'Cortado', 'Cortado para carga'].includes(x.vista.etiqueta)), 'un tramo con avisos activos sale «Con incidencias» o «Cortado»: ' + conAvisos.map((x) => `${x.id}=${x.vista.etiqueta}`).join(', '));
  // Ficha del paso: «Carreteras para llegar», con quién vigila cada una.
  await p.goto(B + '/guia/pasos/jama/');
  const car = await p.textContent('.carreteras-llegar');
  ok(/Carreteras para llegar/.test(car) && /RN 52/.test(car) && /CH-27/.test(car) && /comprobado cada hora/.test(car), 'ficha de Jama: «Carreteras para llegar» con la RN 52 y la CH-27 vigiladas.');
  // Portada: lo que impide o limita va antes que los pasos, y el resto del corredor en una línea.
  await p.goto(B + '/');
  const orden = await p.$$eval('.hoy-col h2', (l) => l.map((x) => x.id));
  ok(orden.indexOf('t-limita') > -1 && orden.indexOf('t-limita') < orden.indexOf('t-pasos-hoy'), 'portada: primero lo que impide o limita, después los pasos: ' + orden.join(', '));
  ok(/El resto: \d+ de \d+ tramos de carretera sin incidencias/.test(await p.textContent('.hoy-resto')), 'portada: el resto del corredor en una línea.');
  await b.close();
  fin('Tres estados de vigilancia (HU-131)', f);
})();
