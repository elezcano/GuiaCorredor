// Prueba de navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// HU-131: tres estados para los tramos de carretera (Sin incidencias, Vigilancia sin actualizar, Sin vigilancia).
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
  ok(t('calama-antofagasta').vista.etiqueta === 'Vigilancia sin actualizar' && !t('calama-antofagasta').vista.confirmado, `Calama → Antofagasta (Chile con 3 fallos): «Vigilancia sin actualizar» (${t('calama-antofagasta').vista.etiqueta}).`);
  // En la guía, el tramo vigilado dice quién lo vigila y enlaza a «Fuentes».
  await p.goto(B + '/guia/tramos/py15-chaco/');
  const est = await p.textContent('.ficha-operativa');
  ok(/Sin incidencias/.test(est) && /MOPC · vigilado cada hora/.test(est) && !/Sin confirmar/.test(est), 'guía de la PY15: «Sin incidencias · MOPC · vigilado cada hora».');
  ok(await p.$('.ficha-operativa a[href$="/fuentes/"]'), 'guía de la PY15: «vigilado cada hora» enlaza a la página de fuentes.');
  await b.close();
  fin('Tres estados de vigilancia (HU-131)', f);
})();
