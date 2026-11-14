// Genera docs/informe-contenidos.md: qué está sin verificar, qué falta y de qué tipo son las fuentes.
// Uso: npm run informe
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJSON, loadGuia, PAISES } from './lib.mjs';
import { nivel, tipoEstado, NIVELES } from './validacion.mjs';

const HOY = new Date().toISOString().slice(0, 10);
const site = readJSON('data/site.json');
const rutas = readJSON('data/rutas.json');
const pasos = readJSON('data/pasos.json').pasos;
const incidencias = readJSON('data/incidencias.json').incidencias;
const novedades = readJSON('data/novedades.json');
const festivos = readJSON('data/festivos.json').festivos.filter((f) => f.fecha >= HOY);
const organismos = readJSON('data/organismos.json').organismos;
const empresas = readJSON('data/directorio.json');
const guia = loadGuia();
const nodo = Object.fromEntries(rutas.nodos.map((n) => [n.id, n.nombre]));

const recuento = {};
const contar = (grupo, n) => {
  recuento[grupo] ||= Object.fromEntries(Object.keys(NIVELES).map((k) => [k, 0]));
  recuento[grupo][n]++;
};
const fichaNivel = (p) => nivel({ validacion: p.meta.validacion, verificado: p.meta.verificado || null }, 'ficha', HOY);
guia.forEach((p) => contar('Fichas de la guía', fichaNivel(p)));
pasos.forEach((p) => {
  contar('Estados de paso', nivel(p.estado, tipoEstado(p.estado.valor), HOY));
  (p.horarios || []).forEach((h) => contar('Horarios', nivel(h, 'horario', HOY)));
  [...(p.restricciones || []), ...(p.acceso || [])].forEach((h) => contar('Restricciones y accesos', nivel(h, 'ficha', HOY)));
});
rutas.tramos.filter((t) => t.reporte).forEach((t) => contar('Estados de tramo', nivel(t.reporte, tipoEstado(t.reporte.valor), HOY)));
incidencias.forEach((i) => contar('Incidencias', nivel(i, 'incidencia', HOY)));
novedades.forEach((n) => contar('Novedades', nivel(n, 'ficha', HOY)));
festivos.forEach((f) => contar('Festivos', nivel(f, 'festivo', HOY)));
organismos.forEach((o) => contar('Enlaces de organismos', nivel(o, 'organismo', HOY)));

const L = [];
L.push(`# Informe de contenidos`, '', `Generado el ${HOY} con \`npm run informe\`. No editar a mano.`, '');
L.push('## Validación', '', `| Tipo de dato | ${Object.values(NIVELES).map((n) => n.texto).join(' | ')} |`, `|---|${Object.keys(NIVELES).map(() => '---:').join('|')}|`);
for (const [g, r] of Object.entries(recuento)) L.push(`| ${g} | ${Object.keys(NIVELES).map((k) => r[k]).join(' | ')} |`);
L.push('', 'Mientras un dato no esté «Verificado», la web lo muestra como «Por verificar» con su último valor, su fuente y su fecha.', '');

L.push('## Contenido incompleto', '');
const falta = [];
if (!site.contacto.email && !site.contacto.whatsapp) falta.push('Contacto del sitio: sin email ni WhatsApp (las empresas no pueden darse de alta).');
if (!site.planes.find((p) => p.id === 'destacada')?.enlacePago) falta.push('Plan destacado: sin enlace de PayPal.');
if (!site.cruces?.enlacePrellenado) falta.push('Tiempos de cruce: formulario sin configurar.');
if (!empresas.length) falta.push('Directorio: sin empresas verificadas.');
for (const t of rutas.tramos) {
  const n = `${nodo[t.desde]} – ${nodo[t.hasta]}`;
  if (typeof t.km !== 'number') falta.push(`Tramo ${n}: sin distancia con fuente.`);
  if (!t.paso && !t.reporte) falta.push(`Tramo ${n}: sin estado con fuente.`);
}
for (const p of pasos) {
  const vacios = ['operaciones', 'servicios', 'contactos'].filter((k) => !p[k] || (Array.isArray(p[k]) && !p[k].length));
  if (vacios.length) falta.push(`Paso ${p.nombre}: sin ${vacios.join(', ')}.`);
  const lados = Object.keys(p.lados).filter((k) => !(p.horarios || []).some((h) => (h.lado || '').includes(k)));
  if (lados.length) falta.push(`Paso ${p.nombre}: sin horario del lado ${lados.map((k) => PAISES[k]).join(' y ')}.`);
}
for (const i of incidencias.filter((x) => x.estado === 'activa')) {
  const vacios = [['inicio', 'fecha de inicio'], ['finPrevista', 'fin previsto'], ['impacto', 'impacto en transporte pesado']].filter(([k]) => !i[k]).map(([, t]) => t);
  if (vacios.length) falta.push(`Incidencia ${i.ubicacion}: sin ${vacios.join(', ')}.`);
}
for (const p of guia) for (const m of p.body.matchAll(/\*Pendiente: ([^*]+)\*/g)) falta.push(`Ficha ${p.meta.titulo}: pendiente ${m[1].trim()}`);
L.push(...falta.map((x) => `- ${x}`), '');

L.push('## Fuentes por ficha', '', 'Tipo de cada fuente citada en la sección «Fuentes» de las fichas. Una ficha solo con prensa necesita contraste oficial antes de marcarse como verificada.', '');
const tipo = (url) => (/\.gov\.|\.gob\.|gov\.br|planalto|bcn\.cl|argentina\.gob|mopc\.gov|bacn\.gov|dt\.gob/.test(url) ? 'oficial' : 'prensa u otra');
for (const p of guia) {
  const urls = [...p.body.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
  const of = urls.filter((x) => tipo(x) === 'oficial').length;
  L.push(`- **${p.meta.titulo}**: ${urls.length} fuentes, ${of} oficiales${of === 0 && urls.length ? ' ⚠ solo prensa' : ''}.`);
}
L.push('', '## Histórico', '', `Novedades de más de 90 días (se muestran como «Histórico» y no salen en la portada): ${novedades.filter((n) => (Date.parse(HOY) - Date.parse(n.publicado)) / 864e5 > 90).map((n) => `${n.titulo} (${n.publicado})`).join('; ') || 'ninguna'}.`, '');
fs.writeFileSync(path.join(ROOT, 'docs', 'informe-contenidos.md'), L.join('\n'));
console.log(`docs/informe-contenidos.md: ${falta.length} contenidos incompletos.`);
