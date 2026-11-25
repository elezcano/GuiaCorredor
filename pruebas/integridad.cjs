// Prueba de construcción (sin navegador). Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Auditoría de integridad del 25/11/2026 y decisiones D1–D3 del fundador. Construye la web con una copia de los datos de
// prueba modificada y comprueba el HTML:
//   A3 · un aviso oficial de cierre de Chile (canal por aviso) deja el paso «Cerrado», con el aviso a la vista;
//   D1 · un aviso oficial leído automáticamente en la carretera de acceso deja el paso «Con restricciones»;
//   D3 · si la web oficial que lee el vigilante no responde, se mantiene el último estado conocido y se dice.
// Lote 2 (decisión 38): la confianza aparte del estado, una variante por caso, en la ficha, el tablero y api/v1,
//   con «consultado» y «publicado» por separado (segunda construcción con otros datos).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.resolve(__dirname, '..');
const f = [];
const ok = (c, m) => c || f.push(m);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guia-integridad-'));
if (process.env.GUARDAR) console.log('Copia: ' + tmp);
for (const d of ['scripts', 'src', 'content', 'package.json']) if (fs.existsSync(path.join(RAIZ, d))) fs.cpSync(path.join(RAIZ, d), path.join(tmp, d), { recursive: true });
fs.cpSync(path.join(RAIZ, 'pruebas', 'datos'), path.join(tmp, 'data'), { recursive: true });
if (fs.existsSync(path.join(RAIZ, 'node_modules'))) fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');

const leer = (n) => JSON.parse(fs.readFileSync(path.join(tmp, 'data', n), 'utf8'));
const escribir = (n, o) => fs.writeFileSync(path.join(tmp, 'data', n), JSON.stringify(o, null, 1));
const pasosDoc = leer('pasos.json');
const pasos = Array.isArray(pasosDoc) ? pasosDoc : pasosDoc.pasos;
const paso = (id) => pasos.find((p) => p.id === id);
const verif = (quien, alcance) => ({ verificadoPor: quien, rol: quien, fecha: '2026-11-15', alcance });

// A3: Jama, aviso de cierre de la UPF del día.
paso('jama').partes.push({
  lado: 'CL', emisor: 'Unidad de Pasos Fronterizos de Chile', valor: 'cerrado', texto: 'Cerrado por nevadas (dato de prueba).',
  fuente: 'aduana-chile-complejo-integrado-jama', publicado: '2026-11-15', hora: '10:30', actualizado: '2026-11-15',
  evidencia: 'oficial', validacion: 'verificado', verificacion: verif('responsable-editorial', 'Dato de prueba.'),
});
// D3: Pozo Hondo, cerrado por el vigilante; su web oficial no se lee desde el 14/11 (fallos seguidos).
Object.assign(paso('pozo-hondo').estado, {
  valor: 'cerrado', texto: 'Cerrado por Gendarmería (dato de prueba).', fuente: 'ar-seguridad-paso-mision-la-paz', publicado: '2026-11-15',
  actualizado: '2026-11-15', evidencia: 'oficial', validacion: 'verificado', verificacion: verif('vigilante', 'Leído automáticamente (dato de prueba).'),
});
escribir('pasos.json', pasosDoc);
const vig = leer('vigilancia-estado.json');
Object.assign(vig.fuentes['ar-seguridad-paso-mision-la-paz'], { ultimaLecturaBuena: '2026-11-14T13:00:00.000Z', fallosSeguidos: 5, ultimoError: 'HTTP 503' });
escribir('vigilancia-estado.json', vig);
// D1: Sico, aviso ámbar leído automáticamente en su carretera de acceso.
const incDoc = leer('incidencias.json');
const inc = Array.isArray(incDoc) ? incDoc : incDoc.incidencias;
inc.push({
  id: 'prueba-acceso-sico', paises: ['AR'], ubicacion: 'RN 51 (dato de prueba)', tramo: 'RN 51', tipo: 'restriccion', estado: 'activa', gravedad: 'ambar',
  descripcion: 'RN 51: circulación restringida (dato de prueba).', paso: 'sico', fuente: 'ar-seguridad-paso-sico', publicado: '2026-11-15',
  horaFuente: '2026-11-15T12:00:00.000Z', actualizado: '2026-11-15', evidencia: 'oficial', validacion: 'verificado', verificacion: verif('vigilante', 'Dato de prueba.'),
});
escribir('incidencias.json', incDoc);

const r = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: tmp, env: { ...process.env, FECHA_HOY: '2026-11-15', BASE_PATH: '/', PUBLICAR_CRUCES: 'false' }, encoding: 'utf8' });
if (r.status !== 0) {
  console.log('✗ Integridad: no se pudo construir la web con los datos modificados.\n' + r.stdout + r.stderr);
  process.exit(1);
}
const html = (ruta) => fs.readFileSync(path.join(tmp, 'dist', ruta, 'index.html'), 'utf8');
const texto = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const fila = (h, id) => texto((h.match(new RegExp(`<[^>]*class="[^"]*tablero-fila[^"]*sel[^"]*"[\\s\\S]*?</(?:a|tr|li|div)>`)) || [''])[0]);
const cab = (h) => texto((h.match(/class="respuesta-titulo"[\s\S]*?<\/(?:p|h\d|div)>/) || [''])[0]);

const jama = html('guia/pasos/jama');
ok(/No habilitado|Cerrado/.test(cab(jama)) && /Chile: aviso oficial del 15 nov, 10:30/.test(texto(jama)) && /Aviso de Chile/.test(texto(jama)), 'A3 · Jama: el aviso de cierre de Chile deja el paso cerrado, con el aviso a la vista: ' + cab(jama));

const sico = html('guia/pasos/sico');
ok(/restricciones/i.test(cab(sico)) && /aviso oficial en la carretera de acceso/.test(texto(sico)) && /Aviso en el acceso/.test(texto(sico)), 'D1 · Sico: un aviso oficial en la carretera de acceso lo deja «Con restricciones»: ' + cab(sico));

const ph = html('guia/pasos/pozo-hondo');
ok(/No habilitado|Cerrado/.test(cab(ph)) && /La web oficial no responde desde el 14 nov/.test(texto(ph)) && /último estado conocido/.test(texto(ph)) && /Fuente no responde/.test(texto(ph)), 'D3 · Pozo Hondo: con la web oficial caída se mantiene el último estado y se dice: ' + cab(ph));

// Lote 2 · confianza en la primera construcción: fuente caída (D3) y aviso de Chile cargado a mano.
const api1 = JSON.parse(fs.readFileSync(path.join(tmp, 'dist', 'api', 'v1', 'pasos.json'), 'utf8')).registros;
const conf = (api, id) => api.find((p) => p.id === id)?.estado?.mostrar?.confianza;
ok(conf(api1, 'pozo-hondo') === 'fuente-no-disponible' && /confianza-fuente-no-disponible/.test(ph) && /Fuente no disponible/.test(texto(ph)), 'Lote 2 · Pozo Hondo con la fuente caída: confianza «fuente no disponible» en la ficha y en la API: ' + conf(api1, 'pozo-hondo'));
ok(conf(api1, 'jama') === 'verificacion-manual', 'Lote 2 · Jama con el aviso de Chile cargado a mano: «verificado a mano»: ' + conf(api1, 'jama'));
ok(/estado-incierto estado-fuente-no-disponible/.test(html('')), 'Lote 2 · tablero: el paso con la fuente caída se dibuja con borde discontinuo');
ok(api1.every((p) => ['oficial-automatica', 'verificacion-manual', 'pendiente-de-verificar', 'caducada', 'fuente-no-disponible', 'contradictoria'].includes(p.estado.mostrar.confianza)), 'Lote 2 · api/v1: todos los pasos llevan confianza válida');

// Lote 2 · segunda construcción: lectura automática vigente, dato caducado y fuentes contradictorias.
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'guia-confianza-'));
if (process.env.GUARDAR) console.log('Copia 2: ' + tmp2);
for (const d of ['scripts', 'src', 'content', 'package.json']) if (fs.existsSync(path.join(RAIZ, d))) fs.cpSync(path.join(RAIZ, d), path.join(tmp2, d), { recursive: true });
fs.cpSync(path.join(RAIZ, 'pruebas', 'datos'), path.join(tmp2, 'data'), { recursive: true });
if (fs.existsSync(path.join(RAIZ, 'node_modules'))) fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(tmp2, 'node_modules'), 'dir');
const leer2 = (n) => JSON.parse(fs.readFileSync(path.join(tmp2, 'data', n), 'utf8'));
const escribir2 = (n, o) => fs.writeFileSync(path.join(tmp2, 'data', n), JSON.stringify(o, null, 1));
const doc2 = leer2('pasos.json');
const pasos2 = Array.isArray(doc2) ? doc2 : doc2.pasos;
const paso2 = (id) => pasos2.find((p) => p.id === id);
// Jama: estado leído por el vigilante a las 14:00 UTC (11:00 en Argentina), parte argentino de hoy.
Object.assign(paso2('jama').estado, { valor: 'operativo', fuente: 'ar-seguridad-paso-sico', evidencia: 'oficial', validacion: 'verificado', publicado: '2026-11-15', verificacion: verif('vigilante', 'Leído automáticamente (dato de prueba).'), consultado: '2026-11-15T14:00:00.000Z' });
// Pozo Hondo: abierto según el vigilante, pero su web no se lee desde las 05:00 UTC (sin fallos): dato caducado.
Object.assign(paso2('pozo-hondo').estado, {
  valor: 'operativo', texto: 'Abierto (dato de prueba).', fuente: 'ar-seguridad-paso-mision-la-paz', publicado: '2026-11-15', actualizado: '2026-11-15',
  evidencia: 'oficial', validacion: 'verificado', verificacion: verif('vigilante', 'Leído automáticamente (dato de prueba).'), consultado: '2026-11-15T05:00:00.000Z',
});
paso2('pozo-hondo').partes = (paso2('pozo-hondo').partes || []).filter((x) => !(x.lado === 'AR' && x.publicado === '2026-11-15'));
// Sico: dos partes oficiales argentinos de hoy que se contradicen.
const parteAR = (valor, hora, emisor) => ({ lado: 'AR', emisor, valor, texto: `${valor} (dato de prueba).`, fuente: 'ar-seguridad-paso-sico', publicado: '2026-11-15', hora, actualizado: '2026-11-15', evidencia: 'oficial', validacion: 'verificado', verificacion: verif('responsable-editorial', 'Dato de prueba.') });
paso2('sico').partes = [...(paso2('sico').partes || []), parteAR('operativo', '09:00', 'Gendarmería Nacional'), parteAR('cerrado', '09:30', 'Gendarmería Nacional (prueba)')];
paso2('jama').partes = [...(paso2('jama').partes || []).filter((x) => !(x.lado === 'CL' && x.valor !== 'operativo')), { ...parteAR('operativo', '08:00', 'Gendarmería Nacional'), fuente: 'ar-seguridad-paso-sico' }];
escribir2('pasos.json', doc2);
const vig2 = leer2('vigilancia-estado.json');
Object.assign(vig2.fuentes['ar-seguridad-paso-mision-la-paz'], { ultimaLecturaBuena: '2026-11-15T05:00:00.000Z', fallosSeguidos: 0 });
escribir2('vigilancia-estado.json', vig2);
const r2 = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: tmp2, env: { ...process.env, FECHA_HOY: '2026-11-15', BASE_PATH: '/', PUBLICAR_CRUCES: 'false' }, encoding: 'utf8' });
if (r2.status !== 0) {
  console.log('✗ Confianza: no se pudo construir la web con los datos modificados.\n' + r2.stdout + r2.stderr);
  process.exit(1);
}
const html2 = (ruta) => fs.readFileSync(path.join(tmp2, 'dist', ruta, 'index.html'), 'utf8');
const api2 = JSON.parse(fs.readFileSync(path.join(tmp2, 'dist', 'api', 'v1', 'pasos.json'), 'utf8')).registros;
const jama2 = html2('guia/pasos/jama');
ok(conf(api2, 'jama') === 'oficial-automatica' && /Oficial · lectura automática/.test(texto(jama2)), 'Lote 2 · Jama leído por el vigilante: «oficial · lectura automática»: ' + conf(api2, 'jama'));
ok(/Consultado a las 11:00 \(hora de Argentina\) · publicado el 15 nov/.test(texto(jama2)), 'Lote 2 · Jama: «consultado» y «publicado» por separado, en hora de Argentina: ' + (texto(jama2).match(/Consultado[^·]*·[^<]{0,30}/) || [''])[0]);
const mj = api2.find((p) => p.id === 'jama').estado.mostrar;
ok(mj.consultado === '2026-11-15T14:00:00.000Z' && mj.publicado === '2026-11-15', 'Lote 2 · api/v1: consultado (ISO) y publicado (fecha) en Jama: ' + JSON.stringify({ c: mj.consultado, p: mj.publicado }));
ok(conf(api2, 'pozo-hondo') === 'caducada' && /Dato caducado/.test(texto(html2('guia/pasos/pozo-hondo'))) && /Dato caducado/.test(texto(html2(''))), 'Lote 2 · Pozo Hondo con la lectura de hace 10 h: «dato caducado» en la ficha y en el tablero: ' + conf(api2, 'pozo-hondo'));
ok(conf(api2, 'sico') === 'contradictoria' && /Fuentes contradictorias/.test(texto(html2('guia/pasos/sico'))), 'Lote 2 · Sico con dos partes argentinos opuestos de hoy: «fuentes contradictorias»: ' + conf(api2, 'sico'));
ok(api2.find((p) => p.id === 'sico').estado.mostrar.valor === 'pendiente' && /Sin confirmar/.test(cab(html2('guia/pasos/sico'))), 'Lote 2 · Sico: con partes opuestos, un «Habilitado» baja a «Sin confirmar» (INV-4): ' + cab(html2('guia/pasos/sico')));

if (!process.env.GUARDAR) { fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(tmp2, { recursive: true, force: true }); }
if (f.length) {
  console.log(`✗ Integridad del dato (auditoría 25/11): ${f.length} fallo(s)`);
  f.forEach((m) => console.log('  - ' + m));
  process.exit(1);
}
console.log('✓ Integridad del dato (auditoría 25/11): cierre por aviso de Chile, aviso en el acceso, fuente caída y confianza (lote 2)');
