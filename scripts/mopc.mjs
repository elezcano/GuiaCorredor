// HU-134: informe diario del MOPC (Paraguay), «Estado de las rutas nacionales».
//
//   Fuente: https://mopc.gov.py/servicios/estado-de-las-rutas/ incrusta una carpeta pública de Google Drive con una
//   subcarpeta por mes («NOVIEMBRE 2026»). Dentro, «ESTADOS DE LAS RUTAS NACIONALES DEL 17 DE NOVIEMBRE DEL 2026.pdf»
//   y sus «(1)», «(2)»: informes del Departamento de Radiocomunicaciones de lunes a viernes, a las 07:00 y hacia las
//   13:00. La numeración del archivo no dice el orden (el 09/11 el «(1)» y el «(2)» son los dos de las 13:00): manda la
//   hora escrita dentro del PDF y, a igual hora, el número del archivo.
//   El PDF es de texto: se lee con `pdftotext -layout` (poppler-utils).
//
//   Tres partes: 1) Puentes inhabilitados, 2) Rutas y tramos clausurados (con notas «.:» al pie), 3) lista por ruta y
//   localidad con el estado de cada una («Habilitada» / «Clausurada») y una observación («P/V/P»).
//
// Reglas (HU-134):
//   - «Clausurado/a» para vehículos pesados o «P/V/P» (Para Vehículos Pesados) → «No habilitado para carga» (rojo,
//     afecta a la carga).
//   - «Clausurado/a» sin más → corte (rojo).
//   - «Transitar/Circular con precaución» → ámbar.
//   - «Habilitada» → nada que decir. Sin mención → nada (el tramo queda «sin cierres publicados por el MOPC»).
//   - Qué cuenta para cada tramo de la Guía: las localidades del filtro de su fila en data/fuentes-vigilancia.csv.

export const FUENTE_MOPC = 'py-mopc-estado-rutas';
export const CARPETA_MOPC = '16y2lx1eoOwn532O1F0j-g0Ye7YZj0dWD';
export const PAGINA_MOPC = 'https://mopc.gov.py/servicios/estado-de-las-rutas/';
const ZONA_PY = '-03:00'; // Paraguay: UTC−3 todo el año desde 2024
export const ZONA_PY_IANA = 'America/Asuncion';
export const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const limpio = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** Para comparar: sin tildes, en minúsculas, solo letras y números. «BOQUERON- Ramales» → «boqueron ramales». */
export const norma = (s) =>
  limpio(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(?:ruta|py)\s*(?:n[°ºo.]*\s*)?(\d+)\b/g, 'py$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const slug = (s) => norma(s).replace(/ /g, '-');
const celdas = (l) => l.split(/\s{3,}/).map((x) => x.trim()).filter(Boolean);
const frase = (s) => {
  const t = limpio(s).toLowerCase().replace(/^[\s.:,-]+/, '');
  const f = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(f) ? f : `${f}.`;
};

/** «ESTADOS DE LAS RUTAS NACIONALES DEL 17 DE NOVIEMBRE DEL 2026 (2).pdf» → { dia, numero } */
export function archivoMOPC(nombre) {
  const m = norma(nombre).match(/del (\d{1,2}) de ([a-z]+) del (\d{4})(?: (\d+))?/);
  if (!m) return null;
  const mes = MESES.findIndex((x) => x.toLowerCase() === m[2]) + 1;
  if (!mes) return null;
  return { dia: `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`, numero: m[4] ? Number(m[4]) : 0 };
}

/** Texto de `pdftotext -layout` → informe. Lanza un error si el formato ha cambiado (no se publica nada). */
export function leerInformeMOPC(texto) {
  const lineas = String(texto).replace(/\f/g, '\n').split('\n');
  const f = texto.match(/FECHA:\s*(\d{1,2})\s+DE\s+([A-ZÁÉÍÓÚ]+)\s+DEL?\s+(\d{4})/i);
  const h = texto.match(/HORA\s*:[\s:]*(\d{1,2})[:.](\d{2})/i);
  const falta = [
    !f && 'la fecha',
    !h && 'la hora',
    !/PUENTES INHABILITADOS/i.test(texto) && '«Puentes inhabilitados»',
    !/RUTAS Y TRAMOS CLAUSURADOS/i.test(texto) && '«Rutas y tramos clausurados»',
    !/Estado de las/i.test(texto) && 'la lista por localidad',
  ].filter(Boolean);
  if (falta.length) throw new Error(`el informe del MOPC ha cambiado de formato: no encuentro ${falta.join(', ')}`);
  const mes = MESES.indexOf(f[2].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) + 1;
  if (!mes) throw new Error(`el informe del MOPC trae un mes que no reconozco («${f[2]}»)`);
  const dia = `${f[3]}-${String(mes).padStart(2, '0')}-${f[1].padStart(2, '0')}`;
  const hora = `${h[1].padStart(2, '0')}:${h[2]}`;

  const iPu = lineas.findIndex((l) => /PUENTES INHABILITADOS/i.test(l));
  const iRu = lineas.findIndex((l) => /RUTAS Y TRAMOS CLAUSURADOS/i.test(l));
  const iLo = lineas.findIndex((l, i) => i > iRu && /Estado de las/i.test(l));
  if (!(iPu < iRu && iRu < iLo)) throw new Error('el informe del MOPC ha cambiado de formato: las tres partes no van en el orden de siempre');

  // Partes 1 y 2: filas numeradas que siguen en las líneas de abajo hasta la siguiente fila.
  const filas = (desde, hasta) => {
    const res = [];
    for (const l of lineas.slice(desde + 1, hasta)) {
      if (/Departamento de Radiocomunicaciones|Viceministerio|FECHA:|ESTACION:|^\s*(N°|°|DPTO\.|CAIDA)\b/i.test(l) || !l.trim()) continue;
      const m = l.match(/^\s*(\d{1,3})\s{2,}(.*)$/);
      const nota = l.match(/^\s*\.:\s*(.*)$/);
      if (m) res.push({ n: Number(m[1]), partes: [celdas(m[2])] });
      else if (nota) res.push({ n: null, nota: true, partes: [[nota[1].trim()]] });
      else if (res.length) res[res.length - 1].partes.push(celdas(l));
    }
    return res.map((r) => ({ n: r.n, nota: !!r.nota, texto: limpio(r.partes.flat().join(' ')), primera: r.partes[0] }));
  };
  const puentes = filas(iPu, iRu).filter((r) => !r.nota);
  const clausurados = filas(iRu, iLo);

  // Parte 3: cabeceras de ruta («RUTA 9 TRANSCHACO – Ramales») y filas de localidad con su estado.
  const localidades = [];
  let ruta = '';
  for (const l of lineas.slice(iLo + 1)) {
    if (!l.trim() || /Departamento de Radiocomunicaciones|Viceministerio|FECHA:|ESTACION:|Observaci[oó]n|Tiempo\s+Ca[ií]das|Estado de/i.test(l)) continue;
    const c = celdas(l.replace(/^\s*RU\s{2,}/, ''));
    const k = c.findIndex((x) => /^(Habilitad[ao]|Clausurad[ao])$/i.test(x));
    if (k < 0) {
      if (c.length === 1) ruta = c[0];
      continue;
    }
    localidades.push({ ruta, localidad: c[0], estado: c[k], obs: c.slice(k + 1).join(' ') });
  }
  if (!localidades.length) throw new Error('el informe del MOPC ha cambiado de formato: la lista por localidad está vacía');
  return { dia, hora, instante: new Date(`${dia}T${hora}:00${ZONA_PY}`).toISOString(), puentes, clausurados, localidades };
}

/** Nivel según el texto del MOPC. */
export function nivelMOPC(estado, obs = '') {
  const t = norma(`${estado} ${obs}`);
  const clausura = /\bclausurad[ao]\b/.test(t);
  const pesados = /\bp v p\b|\bpvp\b|vehiculos pesados/.test(t);
  if (clausura && pesados) return { gravedad: 'rojo', carga: true };
  if (clausura) return { gravedad: 'rojo', carga: false };
  if (/precaucion/.test(t)) return { gravedad: 'ambar', carga: false };
  return null;
}

/** ¿El texto menciona alguna de las localidades del filtro? Comparación sin tildes y por palabras enteras. */
export const menciona = (texto, terminos) => {
  const t = ` ${norma(texto)} `;
  return terminos.some((x) => t.includes(` ${norma(x)} `));
};

const enGuia = (g) => (g.paso ? { paso: g.paso } : { tramos: g.tramos || [g.tramo] });

// Fase experimental (decisión del 20/11/2026): el MOPC pinta como mucho ámbar. Con lluvia y obras, la PY15 de tierra es
// casi intransitable para camiones, pero el informe habla de los «ramales» de Boquerón, no de la PY15.
// Regla guardada, sin aplicar: rojo solo cuando el informe nombre la PY15. Se activa poniendo MOPC_ROJO_SI_PY15 = true.
export const MOPC_ROJO_SI_PY15 = false;
const ajustarNivel = (nivel, texto) => (nivel.gravedad !== 'rojo' || (MOPC_ROJO_SI_PY15 && menciona(texto, ['PY15'])) ? nivel : { ...nivel, gravedad: 'ambar' });
const resumenMOPC = (lugar, nivel, textoEstado, inf) => {
  const que = /lluvia/i.test(textoEstado) ? 'cerrado por lluvia' : nivel.carga ? 'cerrado a camiones' : /clausur/i.test(textoEstado) ? 'cerrado' : 'precaución';
  return `${lugar}: ${que} · MOPC ${inf.dia.slice(8, 10)}/${inf.dia.slice(5, 7)} ${inf.hora}`;
};

/** Informe + correspondencias (filas activas del CSV: { guia, localidades }) → incidencias. */
export function incidenciasMOPC(inf, correspondencias, fuente = FUENTE_MOPC) {
  const fecha = inf.dia.split('-').reverse().join('/');
  const res = new Map();
  const add = (corr, base, nivel0, texto) => {
    const nivel = ajustarNivel(nivel0, `${texto.tramo} ${texto.estado}`);
    const id = `mopc-${base}-${(corr.guia.tramo || corr.guia.paso || '').toLowerCase()}`.slice(0, 80);
    const carga = nivel.carga;
    res.set(id, {
      id,
      paises: ['PY'],
      ubicacion: texto.ubicacion,
      tramo: texto.tramo,
      tipo: carga ? 'peso' : nivel0.gravedad === 'rojo' ? 'corte' : 'restriccion',
      estado: 'activa',
      gravedad: nivel.gravedad,
      ...(carga ? { afecta: 'carga' } : {}),
      resumen: resumenMOPC(texto.tramo, nivel, texto.estado, inf),
      descripcion: `${texto.tramo}: ${carga ? 'No habilitado para carga. ' : ''}${texto.estado} Informe del MOPC del ${fecha}, ${inf.hora} (hora de Paraguay).`,
      ...enGuia(corr.guia),
      fuente,
      publicado: inf.dia,
      horaFuente: inf.instante,
      ...(carga ? { impacto: 'No habilitado para carga: el MOPC lo cierra a vehículos pesados.' } : nivel.gravedad === 'rojo' ? { impacto: 'Clausurado: no pasa ningún vehículo.' } : {}),
    });
  };
  for (const corr of correspondencias) {
    for (const l of inf.localidades) {
      if (!menciona(l.localidad, corr.localidades)) continue;
      const nivel = nivelMOPC(l.estado, l.obs);
      if (!nivel) continue;
      const pvp = /p\s*\/\s*v\s*\/\s*p/i.test(l.obs) ? ' para vehículos pesados (P/V/P)' : l.obs ? ` (${l.obs})` : '';
      const lugar = limpio(l.localidad.replace(/\s*[-–]\s*/g, ' – '));
      add(corr, `loc-${slug(l.localidad)}`, nivel, { ubicacion: lugar, tramo: lugar, estado: `${l.estado}${pvp}.` });
    }
    for (const [parte, lista] of [['puente', inf.puentes], ['ruta', inf.clausurados]]) {
      for (const r of lista) {
        if (!menciona(r.texto, corr.localidades)) continue;
        const nivel = nivelMOPC(r.texto);
        if (!nivel) continue;
        const nombre = r.nota ? r.texto.split(/,/)[0] : r.primera.slice(0, -1).join(' · ') || r.texto;
        const estado = r.nota ? r.texto.split(/,/).slice(1).join(',') : r.primera[r.primera.length - 1] + r.texto.slice(r.texto.indexOf(r.primera[r.primera.length - 1]) + r.primera[r.primera.length - 1].length);
        add(corr, `${parte}-${slug(nombre).slice(0, 40)}`, nivel, { ubicacion: `${parte === 'puente' ? 'Puente' : 'Tramo'}: ${limpio(nombre)}`, tramo: limpio(nombre), estado: frase(estado || r.texto) });
      }
    }
  }
  return [...res.values()];
}

/**
 * Último día laborable del que ya tendría que haber informe: hoy a partir de las 10:00 de Paraguay, si no, el anterior.
 * El MOPC no publica los fines de semana ni los feriados nacionales de Paraguay (`feriados`: fechas AAAA-MM-DD, de
 * data/festivos.json, Ley 7544/2025).
 */
export function diaEsperadoMOPC(ahora = new Date(), feriados = new Set()) {
  const py = new Date(ahora.getTime() - 3 * 36e5); // reloj de Paraguay en campos UTC
  const d = new Date(Date.UTC(py.getUTCFullYear(), py.getUTCMonth(), py.getUTCDate()));
  const libre = () => [0, 6].includes(d.getUTCDay()) || feriados.has(d.toISOString().slice(0, 10));
  if (py.getUTCHours() < 10 || libre()) d.setUTCDate(d.getUTCDate() - 1);
  while (libre()) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** El último informe leído es de antes del día laborable que toca: la fuente no se ha actualizado. */
export const mopcAtrasado = (diaInforme, ahora = new Date(), feriados = new Set()) => diaInforme < diaEsperadoMOPC(ahora, feriados);
/** Feriados nacionales de Paraguay de data/festivos.json (solo «feriado»: los no laborables del MOPC no constan). */
export const feriadosPY = (festivos) => new Set((festivos?.festivos || []).filter((f) => f.pais === 'PY' && f.tipo === 'feriado' && (f.organismo || 'general') === 'general').map((f) => f.fecha));

/** Listado público de una carpeta de Drive (embeddedfolderview) → [{ tipo, id, nombre }]. */
export function listadoDrive(html) {
  const out = [];
  const re = /<a href="https:\/\/drive\.google\.com\/(drive\/folders|file\/d)\/([\w-]+)[^"]*"[^>]*>[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  for (const m of String(html).matchAll(re)) out.push({ tipo: m[1].startsWith('drive') ? 'carpeta' : 'archivo', id: m[2], nombre: m[3].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim() });
  return out;
}
/** Carpeta del mes («NOVIEMBRE 2026») para un día. */
export const carpetaDelMes = (dia) => `${MESES[Number(dia.slice(5, 7)) - 1]} ${dia.slice(0, 4)}`;
/** De los archivos de una carpeta: los del día más reciente, del más nuevo al más viejo según su número. */
export function candidatosMOPC(archivos) {
  const con = archivos.filter((a) => a.tipo === 'archivo' && /\.pdf$/i.test(a.nombre)).map((a) => ({ ...a, ...archivoMOPC(a.nombre) })).filter((a) => a.dia);
  const ultimo = con.map((a) => a.dia).sort().pop();
  return con.filter((a) => a.dia === ultimo).sort((a, b) => b.numero - a.numero);
}
/** El informe más reciente: por la hora de dentro y, a igual hora, por el número del archivo. */
export const masReciente = (informes) => [...informes].sort((a, b) => (a.instante === b.instante ? a.numero - b.numero : a.instante < b.instante ? -1 : 1)).pop();
