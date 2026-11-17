// Tareas del día para el responsable editorial (HU-99).
//
// Cada día genera una lista corta de lo que conviene revisar, de lo más urgente a lo menos:
//   1. Avisos abiertos del vigilante (partes nuevos de las webs oficiales).
//   2. Partes caducados (más de partes.umbralHoras) y pasos sin parte del lado chileno.
//   3. Datos operativos pendientes de verificar (pasos, incidencias, tramos), numerados para
//      poder responder «confirmo 3 y 5».
//   4. El resto pendiente (festivos, organismos, novedades), solo con el recuento.
//   Y arriba, el estado de la vigilancia (HU-129): última pasada y fuentes que no se pueden leer.
// Con --github abre la incidencia «Tareas del día · AAAA-MM-DD» asignada al responsable (le llega
// por correo) y cierra la del día anterior.
//
// Uso: node scripts/tareas.mjs            muestra la lista
//      node scripts/tareas.mjs --github   además abre la incidencia (necesita GITHUB_TOKEN)
import fs from 'node:fs';

const args = new Set(process.argv.slice(2));
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const site = json('data/site.json');
const fuentesArr = json('data/fuentes.json');
const FUENTES = Object.fromEntries((fuentesArr.fuentes || fuentesArr).map((f) => [f.id, f]));
const pasosJ = json('data/pasos.json');
const PASOS = pasosJ.pasos || pasosJ;
const UMBRAL_H = site.partes?.umbralHoras ?? 48;
const ZONA_AR = 'America/Argentina/Salta';
const hoyAR = new Date().toLocaleDateString('sv-SE', { timeZone: ZONA_AR });
const MAX_OPERATIVOS = 12;

const fmtFecha = (iso) => (iso ? iso.split('-').reverse().join('/') : 's/f');
const enlace = (id) => {
  const f = FUENTES[id];
  return f ? `[${f.nombre.split(':')[0]}](${f.url})` : 'sin fuente';
};
const horas = (dia, hora) => (Date.now() - new Date(`${dia}T${hora || '12:00'}:00-03:00`).getTime()) / 36e5;

// ---------- 2. Partes caducados y lado chileno sin parte ----------
function partes() {
  const lineas = [];
  for (const p of PASOS) {
    if (p.estado?.valor === 'en-obras') continue;
    for (const x of p.partes || []) {
      const h = horas(x.publicado, x.hora);
      if (h >= UMBRAL_H) lineas.push(`**${p.nombre}** · ${x.emisor}: el último parte es del ${fmtFecha(x.publicado)}${x.hora ? ` ${x.hora} h` : ''} (hace ${Math.floor(h / 24)} días). ${enlace(x.fuente)}`);
    }
    if (p.lados?.CL) {
      const cl = (p.partes || []).filter((x) => x.lado === 'CL').sort((a, b) => (a.publicado < b.publicado ? 1 : -1))[0];
      if (!cl || horas(cl.publicado, cl.hora) >= 24)
        lineas.push(`**${p.nombre}** · Chile: ${cl ? `último parte del ${fmtFecha(cl.publicado)}` : 'sin parte cargado'}. Reenvía el reporte de hoy de la UPF (canal de WhatsApp, Provincia El Loa).`);
    }
  }
  return lineas;
}

// ---------- 3 y 4. Pendientes de verificar ----------
const OPERATIVOS = {
  'pasos.estado': 'Estado',
  'pasos.horarios': 'Horario',
  'pasos.controles': 'Control para carga',
  'pasos.restricciones': 'Restricción',
  'pasos.acceso': 'Acceso',
  'pasos.historial': 'Novedad del paso',
  'pasos.partes': 'Parte',
  'pasos.contactos': 'Contacto',
  incidencias: 'Aviso',
  'tramos.reporte': 'Estado de tramo',
};
function pendientes() {
  const operativos = [];
  const resto = {};
  for (const p of PASOS) {
    for (const [campo, lista] of Object.entries(p)) {
      const items = Array.isArray(lista) ? lista : lista && typeof lista === 'object' ? [lista] : [];
      for (const r of items) {
        if (r?.validacion !== 'por-verificar') continue;
        const tipo = OPERATIVOS[`pasos.${campo}`];
        if (!tipo) continue;
        operativos.push({ fecha: r.fecha || r.publicado, texto: `**${p.nombre}** · ${tipo}${r.fecha ? ` del ${fmtFecha(r.fecha)}` : ''}: ${(r.texto || r.nombre || '').slice(0, 140)}`, fuente: r.fuente });
      }
    }
  }
  const inc = json('data/incidencias.json');
  for (const i of inc.incidencias || inc)
    if (i.validacion === 'por-verificar') operativos.push({ fecha: i.publicado, texto: `**Aviso** · ${i.ubicacion}: ${(i.descripcion || '').slice(0, 140)}`, fuente: i.fuente });
  const rutas = json('data/rutas.json');
  for (const t of rutas.tramos || [])
    if (t.reporte?.validacion === 'por-verificar') operativos.push({ fecha: t.reporte.publicado, texto: `**Tramo ${t.id}** · ${(t.reporte.texto || '').slice(0, 140)}`, fuente: t.reporte.fuente });
  for (const [archivo, clave, nombre] of [
    ['festivos.json', 'festivos', 'festivos'],
    ['organismos.json', 'organismos', 'organismos'],
    ['novedades.json', 'novedades', 'novedades'],
  ]) {
    const d = json(`data/${archivo}`);
    const n = (d[clave] || d).filter((x) => x.validacion === 'por-verificar').length;
    if (n) resto[nombre] = n;
  }
  // Lo más reciente primero: es lo que más afecta a quien va a cruzar.
  operativos.sort((a, b) => ((b.fecha || '') > (a.fecha || '') ? 1 : -1));
  return { operativos, resto };
}

// ---------- GitHub ----------
const REPO = process.env.GITHUB_REPOSITORY || 'elezcano/GuiaCorredor';
const AVISAR_A = process.env.AVISAR_A || REPO.split('/')[0];
async function gh(ruta, opciones = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error(`GitHub ${opciones.method || 'GET'} ${ruta}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

/** HU-129: estado de la vigilancia guardado por el vigilante en la rama datos-vigilancia. */
async function estadoVigilancia() {
  try {
    const f = await gh('/contents/vigilancia.json?ref=datos-vigilancia');
    return JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}
const horaAR = (iso) => new Date(iso).toLocaleString('es-ES', { timeZone: ZONA_AR, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function bloqueVigilancia(e) {
  if (!e?.ultimaPasada) return '## Vigilancia\n- ⚠ Sin estado guardado todavía: el vigilante no ha registrado ninguna pasada.';
  const h = (Date.now() - new Date(e.ultimaPasada).getTime()) / 36e5;
  const lineas = [`- ${h > 3 ? '⚠ ' : ''}Última pasada: ${horaAR(e.ultimaPasada)} (hora AR), hace ${h < 1 ? 'menos de 1 h' : `${Math.floor(h)} h`}.`];
  for (const f of Object.values(e.fuentes || {}))
    if (f.fallosSeguidos) lineas.push(`- ⚠ ${f.nombre}: ${f.fallosSeguidos} lecturas fallidas seguidas (última buena: ${f.ultimaLecturaBuena ? horaAR(f.ultimaLecturaBuena) : 'nunca'}).`);
  if (lineas.length === 1) lineas.push(`- Las ${Object.keys(e.fuentes || {}).length} fuentes se leen bien.`);
  return `## Vigilancia\n${lineas.join('\n')}`;
}

async function principal() {
  const vigilante = args.has('--github') ? await gh('/issues?state=open&labels=vigilante&per_page=50') : [];
  const vigilancia = args.has('--github') ? await estadoVigilancia() : null;
  const caducados = partes();
  const { operativos, resto } = pendientes();
  const ahoraAR = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_AR }).format(new Date());

  const bloques = [`Hora en Argentina: **${ahoraAR}**. Respóndele a Claude en el chat, por ejemplo «confirmo 1, 3 y 5» o «revisa los avisos del vigilante».`];
  if (args.has('--github')) bloques.push(bloqueVigilancia(vigilancia));
  bloques.push(
    `## 1. Avisos del vigilante\n${vigilante.length ? vigilante.map((i) => `- [ ] #${i.number} ${i.title}`).join('\n') : '- Ninguno abierto.'}`
  );
  bloques.push(`## 2. Partes que hay que renovar\n${caducados.length ? caducados.map((l) => `- [ ] ${l}`).join('\n') : '- Todos al día.'}`);
  const lista = operativos.slice(0, MAX_OPERATIVOS);
  bloques.push(
    `## 3. Datos operativos por verificar (${operativos.length})\n${
      lista.length ? lista.map((o, i) => `${i + 1}. [ ] ${o.texto} — ${enlace(o.fuente)}`).join('\n') : 'Nada pendiente.'
    }${operativos.length > MAX_OPERATIVOS ? `\n\nY ${operativos.length - MAX_OPERATIVOS} más: saldrán en los próximos días.` : ''}`
  );
  const r = Object.entries(resto);
  bloques.push(`## 4. Resto pendiente (sin prisa)\n${r.length ? r.map(([k, n]) => `- ${n} ${k}`).join('\n') : '- Nada.'}`);
  const cuerpo = `${bloques.join('\n\n')}\n\n---\nLista automática (\`scripts/tareas.mjs\`). Se cierra sola al día siguiente.`;
  console.log(cuerpo);

  if (!args.has('--github')) return;
  const titulo = `Tareas del día · ${hoyAR}`;
  const abiertas = await gh('/issues?state=open&labels=tareas&per_page=50');
  if (abiertas.some((i) => i.title === titulo)) return console.log('La lista de hoy ya existe.');
  for (const i of abiertas) await gh(`/issues/${i.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
  const i = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: titulo, body: cuerpo, labels: ['tareas'], assignees: [AVISAR_A] }) });
  console.log(`Incidencia abierta: #${i.number}`);
}

await principal();
