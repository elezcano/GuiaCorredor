// Prueba sin navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Decisión 39: «Cómo de fiables somos». Cobertura (registro diario), retraso (registro por ejecución, lote 3) y
// bitácora; y que la página exista, enlazada desde el pie y desde la línea de confianza de cada ficha.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { B } = require('./comun.cjs');
const f = [];
const ok = (c, m) => c || f.push(m);

(async () => {
  const S = await import(path.join(__dirname, '..', 'scripts', 'servicio.mjs'));

  // Cobertura: el primer día empezó a medias y no cuenta; un día sin entrada es «sin parte oficial».
  const h = { apertura: '09:00', cierre: '19:00' };
  ok(S.horasEsperadas(h) === 11 && S.horasEsperadas({ apertura: '08:30', cierre: '20:00' }) === 12, 'Cobertura: horas en punto dentro del horario');
  const diario = { '2026-11-10': { lecturas: 3 }, '2026-11-11': { lecturas: 11 }, '2026-11-12': { lecturas: 13 }, '2026-11-14': { lecturas: 5 } };
  const c = S.cobertura(diario, h, '2026-11-15');
  ok(c.desde === '2026-11-11' && c.hasta === '2026-11-14' && c.dias === 4 && c.conParte === 3 && c.sinParte === 1, 'Cobertura: ventana de días completos y días sin parte: ' + JSON.stringify(c));
  ok(c.horas === 33 && c.cubiertas === 27 && Math.abs(c.pct - 27 / 33) < 1e-9, 'Cobertura: más lecturas que horas no suman de más (13 → 11): ' + c.cubiertas + '/' + c.horas);
  ok(S.cobertura({}, h, '2026-11-15') === null, 'Cobertura: sin registro no hay cifra');

  // Retraso: el parte que ya estaba en la primera lectura no cuenta; los nuevos, desde su hora (UTC−3).
  const L = (consultado, parte, paso = 'jama') => ({ paso, http: 'ok', consultado, lectura: { parte } });
  const lineas = [
    L('2026-11-14T12:00:00Z', '2026-11-14 08:00'),
    L('2026-11-14T13:00:00Z', '2026-11-14 08:00'),
    ...[15, 16, 17, 18].map((d) => L(`2026-11-${d}T12:20:00Z`, `2026-11-${d} 09:00`)),
  ];
  const r = S.retrasos(lineas, '2026-11-20');
  ok(r.jama && r.jama.muestras === 4, 'Retraso: el parte de la primera lectura no cuenta: ' + JSON.stringify(r));
  ok(r.jama.mediana === null, `Retraso: con menos de ${S.MUESTRAS_MINIMAS} partes no se da cifra`);
  const muchas = [L('2026-11-01T12:00:00Z', '2026-11-01 08:00'), ...[2, 3, 4, 5, 6, 7].map((d) => L(`2026-11-0${d}T12:30:00Z`, `2026-11-0${d} 09:00`))];
  ok(S.retrasos(muchas, '2026-11-20').jama.mediana === 30, 'Retraso: mediana en minutos desde la hora del parte (Argentina): ' + JSON.stringify(S.retrasos(muchas, '2026-11-20')));

  // Registro: ficheros JSONL de la carpeta, líneas malas fuera.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  fs.writeFileSync(path.join(dir, '2026-11-14.jsonl'), JSON.stringify(L('2026-11-14T12:00:00Z', 'x')) + '\nno es json\n');
  fs.writeFileSync(path.join(dir, 'otro.txt'), 'nada');
  ok(S.leerRegistro(dir).length === 1 && S.leerRegistro(path.join(dir, 'no-existe')).length === 0, 'Registro: lee los JSONL e ignora líneas malas y otros ficheros');
  fs.rmSync(dir, { recursive: true, force: true });

  // Bitácora: de la regla, de la más reciente a la más antigua.
  const b = S.leerBitacora(path.join(__dirname, '..', 'docs', 'regla-estado-pasos.md'));
  ok(b.length >= 5 && b.every((x) => x.fecha && x.paso && x.decision), 'Bitácora: filas leídas de la regla: ' + b.length);

  // La página, publicada y enlazada.
  const html = await (await fetch(B + '/fiabilidad/')).text();
  ok(/<h1>Cómo de fiables somos<\/h1>/.test(html) && /Nuestro objetivo/.test(html) && /Lo que hemos corregido/.test(html) && /Lo que aún no medimos/.test(html), 'Página «Cómo de fiables somos» con objetivo, correcciones y lo que aún no medimos');
  ok(!/fundador|Ernesto/i.test(html), 'Página: no habla de personas');
  const portada = await (await fetch(B + '/')).text();
  ok(/href="[^"]*\/fiabilidad\/"/.test(portada), 'Pie: enlace a «Cómo de fiables somos»');
  const ficha = await (await fetch(B + '/guia/pasos/jama/')).text();
  ok(/Disponibilidad del paso/.test(ficha) && /class="consulta" href="[^"]*\/fiabilidad\/"/.test(ficha), 'Ficha: «Disponibilidad del paso» y enlace desde la confianza');

  if (f.length) {
    console.log(`✗ Cómo de fiables somos (decisión 39): ${f.length} fallo(s)`);
    f.forEach((m) => console.log('  - ' + m));
    process.exit(1);
  }
  console.log('✓ Cómo de fiables somos (decisión 39): cobertura, retraso, registro, bitácora y página');
})();
