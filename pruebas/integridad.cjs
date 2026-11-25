// Prueba de construcción (sin navegador). Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Auditoría de integridad del 25/11/2026 y decisiones D1–D3 del fundador. Construye la web con una copia de los datos de
// prueba modificada y comprueba el HTML:
//   A3 · un aviso oficial de cierre de Chile (canal por aviso) deja el paso «Cerrado», con el aviso a la vista;
//   D1 · un aviso oficial leído automáticamente en la carretera de acceso deja el paso «Con restricciones»;
//   D3 · si la web oficial que lee el vigilante no responde, se mantiene el último estado leído y se dice.
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
ok(/No habilitado|Cerrado/.test(cab(ph)) && /La web oficial no responde desde el 14 nov/.test(texto(ph)) && /último estado leído/.test(texto(ph)) && /Fuente no responde/.test(texto(ph)), 'D3 · Pozo Hondo: con la web oficial caída se mantiene el último estado y se dice: ' + cab(ph));

if (!process.env.GUARDAR) fs.rmSync(tmp, { recursive: true, force: true });
if (f.length) {
  console.log(`✗ Integridad del dato (auditoría 25/11): ${f.length} fallo(s)`);
  f.forEach((m) => console.log('  - ' + m));
  process.exit(1);
}
console.log('✓ Integridad del dato (auditoría 25/11): cierre por aviso de Chile, aviso en el acceso y fuente caída');
