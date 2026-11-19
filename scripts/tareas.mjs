// Tareas del día para el responsable editorial (HU-99). Desde el 19/11/2026 solo lo que de verdad necesita una persona
// (las fuentes oficiales ya se publican solas y los datos de prensa quedan como contexto, sin pedir verificación):
//   1. Partes de Chile por WhatsApp: pasos sin parte del lado chileno o con el parte caducado (más de partes.umbralHoras).
//   2. Alertas que el vigilante no ha sabido clasificar (líneas «Revisa:» de los avisos del vigilante de hoy).
//   Y arriba, el estado de la vigilancia (HU-129): última pasada y fuentes que no se pueden leer.
// Con --github: cierra los avisos del vigilante de días anteriores (solo informan: lo leído ya está publicado) y la
// lista del día anterior, y abre «Tareas del día · AAAA-MM-DD» asignada al responsable (le llega por correo) solo si
// hay algo que hacer.
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
  // Avisos del vigilante: los de días anteriores se cierran solos; de los de hoy, solo cuentan las líneas «Revisa:».
  const deHoy = vigilante.filter((i) => i.title.includes(`(${hoyAR})`));
  const revisar = [];
  for (const i of deHoy) {
    const textos = [i.body || '', ...(i.comments ? (await gh(`/issues/${i.number}/comments`)).map((c) => c.body) : [])];
    for (const l of textos.join('\n').split('\n')) if (/Revisa:/.test(l)) revisar.push(`${l.replace(/^[-\s]*(Nuevo:\s*)?Revisa:\s*/, '')} (#${i.number})`);
  }
  const ahoraAR = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONA_AR }).format(new Date());
  const bloques = [`Hora en Argentina: **${ahoraAR}**. Respóndele a Claude en el chat (por ejemplo, reenvíale la captura del parte de Chile).`];
  if (args.has('--github')) bloques.push(bloqueVigilancia(vigilancia));
  bloques.push(`## 1. Partes de Chile por WhatsApp\n${caducados.length ? caducados.map((l) => `- [ ] ${l}`).join('\n') : '- Todos al día.'}`);
  bloques.push(`## 2. Alertas para mirar a mano\n${revisar.length ? revisar.map((l) => `- [ ] ${l}`).join('\n') : '- Ninguna.'}`);
  const cuerpo = `${bloques.join('\n\n')}\n\n---\nLista automática (\`scripts/tareas.mjs\`). Solo sale cuando hay algo que hacer y se cierra sola al día siguiente. Lo que el vigilante lee en las webs oficiales ya está publicado: no hace falta revisarlo.`;
  console.log(cuerpo);

  if (!args.has('--github')) return;
  for (const i of vigilante.filter((x) => !deHoy.includes(x))) await gh(`/issues/${i.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
  const titulo = `Tareas del día · ${hoyAR}`;
  const abiertas = await gh('/issues?state=open&labels=tareas&per_page=50');
  if (abiertas.some((i) => i.title === titulo)) return console.log('La lista de hoy ya existe.');
  for (const i of abiertas) await gh(`/issues/${i.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
  const ciega = vigilancia && Object.values(vigilancia.fuentes || {}).some((f) => (f.fallosSeguidos || 0) >= 3);
  if (!caducados.length && !revisar.length && !ciega) return console.log('Nada que hacer hoy: no se abre la lista.');
  const i = await gh('/issues', { method: 'POST', body: JSON.stringify({ title: titulo, body: cuerpo, labels: ['tareas'], assignees: [AVISAR_A] }) });
  console.log(`Incidencia abierta: #${i.number}`);
}

await principal();
