// Prueba sin navegador. Se ejecuta con: npm run pruebas (ver pruebas/LEEME.md).
// Decisión 42: el Vigía separa «nuestra web o nuestro sistema fallan» (rojo) de «un organismo no publica» (aviso).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { B } = require('./comun.cjs');
const f = [];
const ok = (c, m) => c || f.push(m);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vigia-'));
const haceH = (h) => new Date(Date.now() - h * 36e5).toISOString();
const estado = {
  ultimaPasada: haceH(0.5),
  fuentes: {
    'cl-vialidad-siemop': { nombre: 'Carreteras de Chile (Vialidad, MOP)', url: 'https://ejemplo.cl', ultimaLecturaBuena: haceH(30), atrasada: true, ultimaPublicacion: '2026-11-17T21:30:25.000Z', ultimoError: 'la fuente no se actualiza desde hace 8 días' },
    'ar-vialidad-estado-rutas': { nombre: 'Carreteras de Argentina', ultimaLecturaBuena: haceH(9), ultimoError: 'HTTP 503' },
    'ar-seguridad-paso-jama': { nombre: 'Jama', ultimaLecturaBuena: haceH(0.5) },
  },
};
const correr = (h) => {
  const archivo = path.join(dir, `v${h}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ ...estado, fuentes: { ...estado.fuentes, 'ar-vialidad-estado-rutas': { ...estado.fuentes['ar-vialidad-estado-rutas'], ultimaLecturaBuena: haceH(h) } } }));
  try {
    execFileSync('node', [path.join(__dirname, '..', 'scripts', 'humo.mjs'), '--sin-externos'], { cwd: dir, env: { ...process.env, HUMO_URL: B, HUMO_VIGILANCIA: archivo }, stdio: 'pipe' });
  } catch {}
  return { informe: fs.readFileSync(path.join(dir, 'vigia.md'), 'utf8'), firma: fs.readFileSync(path.join(dir, 'vigia-firma.txt'), 'utf8'), atrasadas: JSON.parse(fs.readFileSync(path.join(dir, 'vigia-atrasadas.json'), 'utf8')) };
};

const a = correr(9);
const fallosTxt = (a.informe.split('### Fuentes oficiales atrasadas')[0].split('## ✗')[1] || '');
ok(!/siemop|Chile/.test(fallosTxt), 'Una fuente atrasada (el organismo no publica) no es un fallo: ' + fallosTxt.trim());
ok(/ar-vialidad-estado-rutas \(última buena hace 9\.0 h: HTTP 503\)/.test(fallosTxt), 'Una fuente que no responde sí es un fallo, con su causa');
ok(a.atrasadas.length === 1 && a.atrasadas[0].id === 'cl-vialidad-siemop' && a.atrasadas[0].desde === '17/11/2026', 'La atrasada va a su aviso, con la fecha de su última publicación: ' + JSON.stringify(a.atrasadas));
ok(/Fuentes oficiales atrasadas[\s\S]*sin publicar nada nuevo desde el 17\/11\/2026/.test(a.informe), 'El informe la menciona aparte');
const b = correr(10);
ok(a.firma && a.firma === b.firma, 'La firma de los fallos no cambia solo porque pasen las horas (sin correos repetidos)');
fs.rmSync(dir, { recursive: true, force: true });

if (f.length) {
  console.log(`✗ Vigía (decisión 42): ${f.length} fallo(s)`);
  f.forEach((m) => console.log('  - ' + m));
  process.exit(1);
}
console.log('✓ Vigía (decisión 42): fuente atrasada como aviso, fuente caída como fallo, sin avisos repetidos');
