// Valida cada archivo de data/ contra su esquema JSON (Draft 2020-12) con ajv.
// Uso: node scripts/esquemas.mjs   (también lo ejecuta npm run check)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib.mjs';
import { ARCHIVOS } from './datos.mjs';

export function validarEsquemas() {
  let Ajv2020;
  try {
    Ajv2020 = createRequire(import.meta.url)('ajv/dist/2020');
  } catch {
    return { errores: ['Falta la dependencia "ajv". Ejecuta: npm install'], archivos: 0 };
  }
  const ajv = new (Ajv2020.default || Ajv2020)({ allErrors: true, strict: true, strictTypes: false, strictRequired: false, allowUnionTypes: true });
  ajv.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const dir = path.join(ROOT, 'data/esquemas');
  for (const f of fs.readdirSync(dir)) ajv.addSchema(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f);
  const errores = [];
  for (const [f] of Object.values(ARCHIVOS)) {
    const datos = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    const esquema = path.basename(datos.$schema || '');
    const validar = ajv.getSchema(esquema);
    if (!validar) {
      errores.push(`data/${f}: "$schema" no apunta a un esquema de data/esquemas/.`);
      continue;
    }
    if (!validar(datos)) for (const e of validar.errors) errores.push(`data/${f}${e.instancePath}: ${e.message}${e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : ''}${e.params?.additionalProperty ? ` ("${e.params.additionalProperty}")` : ''}`);
  }
  return { errores, archivos: Object.keys(ARCHIVOS).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errores, archivos } = validarEsquemas();
  for (const e of errores) console.log(`ERROR  ${e}`);
  console.log(`${archivos} archivos, ${errores.length} errores de esquema.`);
  process.exit(errores.length ? 1 : 0);
}
