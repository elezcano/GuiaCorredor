// Utilidades comunes de las pruebas de navegador.
// - BASE_URL: dirección de la web servida (por defecto http://localhost:4321).
// - SALIDA: carpeta de capturas (por defecto, la temporal del sistema).
// - Reloj fijo: todas las páginas ven el 15/11/2026 a las 20:30 (Madrid), el mismo día con el que se
//   construye la web de pruebas (FECHA_HOY), para que los resultados no cambien con el paso de los días.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const B = process.env.BASE_URL || 'http://localhost:4321';
const RELOJ = new Date(process.env.RELOJ || '2026-11-15T20:30:00+01:00');
const SALIDA = process.env.SALIDA || path.join(os.tmpdir(), 'capturas-guia');
fs.mkdirSync(SALIDA, { recursive: true });
const captura = (nombre) => path.join(SALIDA, nombre);

async function conReloj(ctx) {
  await ctx.clock.setFixedTime(RELOJ);
  return ctx;
}
/** Navegador cuyas páginas y contextos usan siempre el reloj fijo. */
async function lanzar() {
  const b = await chromium.launch();
  return {
    newPage: async (o) => {
      const p = await b.newPage(o);
      await conReloj(p.context());
      return p;
    },
    newContext: async (o) => conReloj(await b.newContext(o)),
    close: () => b.close(),
  };
}
/** Imprime el resultado y deja el código de salida en 1 si hubo fallos. */
function fin(nombre, fallos) {
  if (fallos.length) {
    console.log(`✗ ${nombre}: ${fallos.length} fallo(s)\n  - ${fallos.join('\n  - ')}`);
    process.exitCode = 1;
  } else console.log(`✓ ${nombre}: sin fallos`);
}
module.exports = { B, RELOJ, captura, lanzar, fin };
