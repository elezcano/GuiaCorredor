// Uso: node scripts/serve.mjs (tras el build con BASE_PATH=/) y, con Playwright instalado, node pruebas/informe-hu45.cjs. Pasa a CI en P1.12 (#50).
// Pruebas de aceptación HU-45 (7 escenarios)
const { chromium } = require('playwright');
const B = 'http://localhost:4321';
const fallos = []; const ok = (c, m) => { if (!c) fallos.push(m); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  // E1: generar desde el planificador
  await p.goto(B + '/planificador/?desde=0&hasta=7&carga=granel');
  await p.fill('#lanzar-informe input[name=fecha]', '2026-12-08');
  await Promise.all([p.waitForNavigation(), p.click('#lanzar-informe button[type=submit]')]);
  ok(p.url().includes('/informe/') && p.url().includes('fecha=2026-12-08'), 'E1 no navega al informe');
  for (const id of ['inf-alertas', 'inf-estado', 'inf-horarios', 'inf-avisos', 'inf-km', 'inf-papeles', 'inf-fuentes']) ok(await p.$('#' + id), 'E1 falta sección ' + id);
  ok((await p.$$('.tabla-informe tbody tr')).length === 7, 'E1 no salen los 7 tramos');
  const txt = await p.textContent('.informe');
  // E2: festivo
  ok(/8 dic 2026: .*Paraguay/.test(txt), 'E2 no avisa del festivo de Paraguay');
  ok(txt.includes('Un festivo no implica que la aduana cierre'), 'E2 no aclara festivo ≠ cierre');
  // E3: paso no habilitado y sin confirmar
  ok(/Puente de la Bioce[aá]nica.*no habilitado/i.test(txt), 'E3 no destaca el puente no habilitado');
  ok(txt.includes('No hay alternativa registrada'), 'E3 no dice que no hay alternativa');
  ok(/sin confirmar\..*(hace|Último dato)/i.test(txt), 'E3 no muestra antigüedad del paso sin confirmar');
  // Regla 3: distancias no sumadas como oficiales
  ok(txt.includes('No se suman como distancia oficial') && txt.includes('Estimación provisional'), 'Regla 3 distancias');
  // E4: enlace
  await p.click('#inf-copiar');
  const enlace = await p.evaluate(() => navigator.clipboard.readText());
  ok(/gen=.*&h=|h=.*gen=/.test(enlace) || (enlace.includes('gen=') && enlace.includes('h=')), 'E4 enlace sin gen/h');
  const p2 = await ctx.newPage(); await p2.goto(enlace);
  ok(!(await p2.$('.aviso-cambio')), 'E4 avisa de cambio sin haberlo');
  await p2.goto(enlace.replace(/h=[^&]+/, 'h=zzz'));
  ok(await p2.$('.aviso-cambio'), 'E4 no avisa cuando la situación cambió');
  // E5: WhatsApp
  const wa = decodeURIComponent((await p.getAttribute('.informe-acciones .btn-wa', 'href')).split('text=')[1]);
  ok(wa.length <= 600, 'E5 resumen WhatsApp > 600: ' + wa.length);
  ok(wa.includes('Puente') && wa.includes('Confirmar antes de salir'), 'E5 resumen incompleto');
  // E6: PDF
  await p.emulateMedia({ media: 'print' });
  ok(!(await p.isVisible('.informe-acciones')) && !(await p.isVisible('.cabecera')), 'E6 menús visibles al imprimir');
  await p.pdf({ path: '/tmp/shots/informe.pdf', format: 'A4' });
  await p.emulateMedia({ media: 'screen' });
  // E7: móvil 360, claro y oscuro, sin desbordes; teclado
  for (const tema of ['claro', 'oscuro']) {
    const m = await b.newPage({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, colorScheme: tema === 'oscuro' ? 'dark' : 'light' });
    await m.addInitScript((t) => { try { localStorage.setItem('tema', t); } catch {} }, tema);
    await m.goto(enlace);
    ok(!(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'E7 desborde en móvil ' + tema);
    await m.screenshot({ path: `/tmp/shots/inf-movil-${tema}.png`, fullPage: true });
    await m.close();
  }
  await p.keyboard.press('Tab');
  ok(await p.evaluate(() => !!document.activeElement && document.activeElement !== document.body), 'E7 sin foco por teclado');
  ok(errs.length === 0, 'errores JS: ' + errs.join(' | '));
  await p.screenshot({ path: '/tmp/shots/inf-escritorio.png', fullPage: true });
  console.log(fallos.length ? 'FALLOS:\n' + fallos.join('\n') : 'HU-45: 7 escenarios sin fallos');
  await b.close();
})();
