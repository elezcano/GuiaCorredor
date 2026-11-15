// Ejecuta todas las pruebas de navegador sobre una copia de la web construida con datos fijos.
//
//  1. Copia el proyecto a una carpeta temporal y pone pruebas/datos en lugar de data/
//     (así, editar datos reales no rompe las pruebas: aquí se prueba el código, no los datos;
//     los datos reales los revisa npm run check).
//  2. Construye la web con FECHA_HOY=2026-11-15, el mismo día del reloj fijo de las pruebas.
//  3. La sirve en un puerto local y ejecuta cada pruebas/*.cjs (salvo comun.cjs).
//  4. Sale con código 1 si alguna prueba falla: en GitHub, eso impide publicar.
//
// Uso: npm run pruebas   (necesita Playwright: npm i --no-save playwright && npx playwright install chromium)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FECHA_HOY = process.env.FECHA_HOY || '2026-11-15';
const PUERTO = Number(process.env.PUERTO_PRUEBAS || 4399);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guia-pruebas-'));

for (const d of ['scripts', 'src', 'content', 'package.json']) {
  if (fs.existsSync(path.join(RAIZ, d))) fs.cpSync(path.join(RAIZ, d), path.join(tmp, d), { recursive: true });
}
fs.cpSync(path.join(RAIZ, 'pruebas', 'datos'), path.join(tmp, 'data'), { recursive: true });
if (fs.existsSync(path.join(RAIZ, 'node_modules'))) fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(tmp, 'node_modules'), 'dir');

const env = { ...process.env, FECHA_HOY, BASE_PATH: '/', PORT: String(PUERTO), PUBLICAR_CRUCES: 'false' };
const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: tmp, env, encoding: 'utf8' });
if (build.status !== 0) {
  console.error(build.stdout, build.stderr);
  console.error('✗ No se pudo construir la web de pruebas.');
  process.exit(1);
}
console.log(`Web de pruebas construida con datos fijos (${FECHA_HOY}).`);

const servidor = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: tmp, env, stdio: 'ignore' });
const BASE_URL = `http://localhost:${PUERTO}`;
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(BASE_URL + '/')).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const pruebas = fs.readdirSync(path.join(RAIZ, 'pruebas')).filter((f) => f.endsWith('.cjs') && f !== 'comun.cjs').sort();
let fallidas = 0;
for (const f of pruebas) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'pruebas', f)], { env: { ...process.env, BASE_URL }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  process.stdout.write(r.stdout);
  if (r.status !== 0) {
    fallidas++;
    if (r.stderr) process.stdout.write(r.stderr);
    if (!/✗/.test(r.stdout)) console.log(`✗ ${f}: terminó con error (código ${r.status}).`);
  }
}
servidor.kill();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fallidas ? `\n${fallidas} de ${pruebas.length} pruebas con fallos.` : `\nLas ${pruebas.length} pruebas pasan.`);
process.exit(fallidas ? 1 : 0);
