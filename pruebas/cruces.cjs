// Prueba sin navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Tiempos de cruce: los dos países de cada paso y los filtros antes de mostrar un tiempo (decisión 41).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const f = [];
const ok = (c, m) => c || f.push(m);

(async () => {
  const C = await import(path.join(__dirname, '..', 'scripts', 'cruces.mjs'));

  // Cada paso nombra sus dos países, de oeste a este; nunca uno que no limita con él.
  const pasos = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pasos.json'), 'utf8'));
  const lista = pasos.pasos || pasos;
  const esperado = { jama: ['Chile', 'Argentina'], sico: ['Chile', 'Argentina'], 'pozo-hondo': ['Argentina', 'Paraguay'], 'puente-bioceanica': ['Paraguay', 'Brasil'] };
  for (const [id, [oeste, este]] of Object.entries(esperado)) {
    const p = lista.find((x) => x.id === id);
    const s = p && C.sentidosPaso(p.lados);
    ok(s && s.chile === `Hacia ${oeste}` && s.brasil === `Hacia ${este}`, `Sentidos de ${id}: Hacia ${oeste} / Hacia ${este}, no ${s && Object.values(s).join(' / ')}`);
  }

  // Agregación de la hoja publicada.
  const hoy = new Date('2026-11-15T12:00:00Z');
  const cab = 'Marca temporal,Paso,Sentido,Tiempo,Fecha,Dispositivo';
  const fila = (paso, sentido, tiempo, fecha, disp) => `x,${paso},${sentido},${tiempo},${fecha},${disp}`;
  const filas = [
    cab,
    fila('jama', 'chile', '1-2', '2026-11-14', 'aaaaaaaa1'),
    fila('jama', 'chile', '2-4', '2026-11-14', 'aaaaaaaa2'),
    fila('jama', 'chile', '2-4', '2026-11-15', 'aaaaaaaa3'),
    fila('jama', 'chile', '8+', '2026-11-15', 'aaaaaaaa3'), // mismo navegador, paso y día: cuenta el último
    fila('jama', 'brasil', '0-1', '2026-11-15', 'bbbbbbbb1'),
    fila('jama', 'brasil', '0-1', '2026-11-15', 'bbbbbbbb2'), // solo 2: sin tiempo
    fila('jama', 'chile', '2-4', '2026-11-01', 'cccccccc1'), // fuera de los 7 días
    fila('jama', 'norte', '2-4', '2026-11-15', 'dddddddd1'), // sentido que no existe
    fila('jama', 'chile', '3 horas', '2026-11-15', 'dddddddd2'), // tramo libre
    fila('no-existe', 'chile', '2-4', '2026-11-15', 'dddddddd3'),
    fila('jama', 'chile', '2-4', '15/11/2026', 'dddddddd4'),
    fila('jama', 'chile', '2-4', '2026-11-15', 'x'), // sin número de navegador válido
    fila('jama', 'chile', '2-4', '2026-11-30', 'dddddddd5'), // en el futuro
    '"x, con coma",sico,brasil,4-8,2026-11-15,eeeeeeee1',
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cruces-'));
  const csv = path.join(dir, 'c.csv');
  const cargar = async (texto) => {
    fs.writeFileSync(csv, texto);
    process.env.CRUCES_CSV_FILE = csv;
    return C.cargarCruces({}, new Set(['jama', 'sico', 'pozo-hondo']), hoy);
  };
  const r = await cargar(filas.join('\n'));
  const j = r.porPaso.jama || {};
  ok(j.chile?.n === 3 && j.chile.cuenta['8+'] === 1 && j.chile.cuenta['2-4'] === 1, 'Un reporte por navegador, paso y día (cuenta el último): ' + JSON.stringify(j.chile));
  ok(j.chile?.mediana === '2-4', 'Mediana de 1–2 h, 2–4 h y más de 8 h: 2–4 h');
  ok(j.brasil?.n === 2 && !j.brasil.mediana, `Con menos de ${C.MINIMO} reportes no se da tiempo`);
  ok(r.avisos.some((a) => /6 reporte\(s\) con datos no válidos/.test(a)), 'Descarta sentido, tramo, paso, fecha, navegador y futuro no válidos: ' + r.avisos.join(' | '));
  ok(r.porPaso.sico?.brasil?.n === 1, 'Lee comas entre comillas');
  ok(!JSON.stringify(r.porPaso).includes('aaaaaaaa'), 'El número de navegador no sale en los datos publicados');

  // Volumen alto: aviso para revisar la hoja.
  const muchos = [cab, ...Array.from({ length: C.VOLUMEN_ALTO + 1 }, (_, i) => fila('jama', 'chile', '8+', '2026-11-15', `zzzzzzzz${i}`))];
  const v = await cargar(muchos.join('\n'));
  ok(v.avisos.some((a) => /Revisa la hoja/.test(a)), 'Más de ' + C.VOLUMEN_ALTO + ' reportes de un paso en un día: aviso');

  // Hoja sin las columnas o ilegible: se publica sin tiempos, sin romper.
  const malo = await cargar('a,b\n1,2');
  ok(Object.keys(malo.porPaso).length === 0 && malo.avisos.some((a) => /no tiene las columnas/.test(a)), 'Hoja sin columnas: sin tiempos y con aviso');
  delete process.env.CRUCES_CSV_FILE;
  const sin = await C.cargarCruces({}, new Set(['jama']), hoy);
  ok(Object.keys(sin.porPaso).length === 0, 'Sin hoja publicada: sin tiempos');
  fs.rmSync(dir, { recursive: true, force: true });

  if (f.length) {
    console.log(`✗ Tiempos de cruce (decisión 41): ${f.length} fallo(s)`);
    f.forEach((m) => console.log('  - ' + m));
    process.exit(1);
  }
  console.log('✓ Tiempos de cruce (decisión 41): países de cada paso, filtros, mediana, mínimo y volumen alto');
})();
