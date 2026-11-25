// Prueba de extremo a extremo del formulario de cotización: envía a Google Forms una solicitud de PRUEBA con los
// mismas claves que manda /cotizar/ (src/assets/cotizar.js, decisión 37) y comprueba que Google la registra.
// La fila llega a la hoja privada de respuestas con «PRUEBA AUTOMÁTICA» en Empresa; el cuadro de mando no la cuenta
// como cotización real porque no tiene «Respondida el».
// Uso: node scripts/prueba-cotizacion.mjs  (sale con código 1 si Google no acepta la respuesta).
import { readFile } from 'node:fs/promises';
import { configEnvio, CAMPOS_COTIZACION } from './cruces.mjs';

const site = JSON.parse(await readFile(new URL('../data/site.json', import.meta.url), 'utf8'));
const rutas = JSON.parse(await readFile(new URL('../data/rutas.json', import.meta.url), 'utf8'));

const enlace = site.cotizaciones?.enlacePrellenado;
if (!enlace) {
  console.log('Sin enlace prellenado de cotizaciones: la web envía por correo y no hay nada que probar.');
  process.exit(0);
}
const envio = configEnvio(enlace, CAMPOS_COTIZACION);
if (envio.error) {
  console.error(`✗ Enlace de cotizaciones: ${envio.error}`);
  process.exit(1);
}

const hoy = new Date().toISOString().slice(0, 10);
const valores = {
  tipo: 'Pido cotización',
  desde: rutas.nodos[0].nombre,
  hasta: rutas.nodos[rutas.nodos.length - 1].nombre,
  carga: rutas.tiposCarga[0].nombre,
  peso: '1 t',
  fecha: hoy,
  empresa: `PRUEBA AUTOMÁTICA RadarCorredor ${hoy}`,
  telefono: '+34 000 000 000',
  email: '',
  id: `RC-PRUEBA-${hoy}`,
  servicio: 'Transporte de carga',
  origen_pais: 'Brasil',
  destino_pais: 'Chile',
  paso: 'No lo sé',
  cuando: 'Fecha concreta',
  mercancia: 'Prueba automática',
  viajes: 'Un viaje',
  nombre: 'Prueba automática',
  compartir: 'No',
};
const cuerpo = new URLSearchParams();
for (const [clave, entry] of Object.entries(envio.campos)) cuerpo.append(entry, valores[clave] || '');

const r = await fetch(envio.accion, {
  method: 'POST',
  body: cuerpo,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  signal: AbortSignal.timeout(30000),
});
const texto = await r.text();
// Si Google rechaza algún campo, devuelve el formulario otra vez (con sus preguntas «entry.…»); si lo acepta, la página
// de confirmación ya no las lleva. El texto de la confirmación cambia con el idioma, por eso no se busca.
const registrada = r.ok && !/name="entry\.\d+"/.test(texto);
console.log(`POST ${envio.accion} → HTTP ${r.status}`);
console.log(`Valores enviados: ${JSON.stringify(valores)}`);
if (!registrada) {
  const pista = texto.match(/<title>([^<]*)<\/title>/)?.[1] || texto.slice(0, 200);
  console.error(`✗ Google no confirmó la respuesta (${pista}). Revisa que los campos del formulario coinciden con la web.`);
  process.exit(1);
}
console.log('✓ Google registró la cotización de prueba. Debe aparecer en «RadarCorredor · Cotizaciones (respuestas)».');
