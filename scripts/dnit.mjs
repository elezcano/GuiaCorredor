// HU-138: «Alertas DNIT» (Brasil). Avisos de interdicción del Departamento Nacional de Infraestrutura de Transportes.
//
//   Fuente: https://www.gov.br/dnit/pt-br/central-de-conteudos/noticias-alerta-de-servicos. Lista de noticias de todo
//   Brasil, de la más nueva a la más vieja, 30 por página (?b_start:int=30, 60…). Cada una: título con la carretera y el
//   estado («… na BR-471/RS …»), etiqueta del estado y «publicado DD/MM/AAAA HHhMM». El texto de cada alerta dice qué,
//   dónde (km) y cuándo; casi siempre anuncia algo programado (un bloqueo una madrugada, «pare e siga» el lunes).
//
// Reglas (HU-138). Se lee el título y el texto de la alerta:
//   - «liberação» (se reabre) → no es un aviso; cierra lo anterior de esa carretera.
//   - «interdição total», «bloqueio total», «totalmente bloqueado/interditado» → rojo (corte).
//   - Restricción por peso o a camiones («acima de 36 toneladas», «veículos pesados/de carga») → no habilitado para carga.
//   - «parcial», «pare e siga», «meia pista», «desvio», «bloqueio», «interdição», «restrição», «alterações no trânsito»
//     → ámbar.
//   - Sin ninguna de esas palabras → no se publica: queda para revisar a mano (semiautomático).
//   - Vigencia: la alerta cuenta 3 días desde su publicación; si dice «a partir de», «por tempo indeterminado», «até
//     nova ordem» o «sem previsão», hasta 30 días o hasta una «liberação» posterior de la misma carretera.
//   - Qué cuenta para cada tramo de la Guía: la rodovía y el estado del filtro de su fila del CSV (rodovias=BR-267;uf=MS).

export const FUENTE_DNIT = 'br-dnit-alertas';
export const PAGINA_DNIT = 'https://www.gov.br/dnit/pt-br/central-de-conteudos/noticias-alerta-de-servicos';
const ZONA_BR = '-03:00'; // hora de Brasília
export const DIAS_ALERTA = 3;
export const DIAS_ALERTA_ABIERTA = 30;

const des = (s) =>
  String(s ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const limpio = (s) => des(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const norma = (s) => limpio(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slugUrl = (u) => String(u).split('?')[0].replace(/\/+$/, '').split('/').pop();

/** «18/11/2026 18h18» → { dia, hora, instante } */
export function fechaDNIT(s) {
  const m = limpio(s).match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2})h(\d{2})/);
  if (!m) return null;
  const dia = `${m[3]}-${m[2]}-${m[1]}`;
  const hora = `${m[4].padStart(2, '0')}:${m[5]}`;
  return { dia, hora, instante: new Date(`${dia}T${hora}:00${ZONA_BR}`).toISOString() };
}

/** Carreteras federales nombradas: «BR-280/SC», «BR-60/MS», «BR-267 (MS)» → [{ br: 'BR-280', uf: 'SC' }] */
export function rodoviasDe(texto) {
  const res = [];
  for (const m of limpio(texto).matchAll(/\bBR[\s-]?(\d{2,3})\s*(?:\/|\(|-|\s+no\s+|\s+em\s+)?\s*([A-Z]{2})?\b/g)) {
    const br = `BR-${m[1].padStart(3, '0')}`;
    if (!res.some((r) => r.br === br && r.uf === (m[2] || null))) res.push({ br, uf: m[2] || null });
  }
  return res;
}

/** Página de la lista → alertas [{ titulo, url, dia, hora, instante, estados }]. Error si no hay ninguna. */
export function listaDNIT(html) {
  const res = [];
  for (const a of String(html).split('<article').slice(1)) {
    const t = a.match(/<h2 class="tileHeadline">\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!t) continue;
    const icono = (k) => a.match(new RegExp(`icon-${k}"></i>\\s*([^<]+)<`))?.[1]?.trim() || '';
    const f = fechaDNIT(`${icono('day')} ${icono('hour')}`);
    const estados = [...a.matchAll(/class="link-category"[^>]*>([^<]+)</g)].map((m) => limpio(m[1]));
    res.push({ titulo: limpio(t[2]), url: t[1], ...(f || { dia: null, hora: null, instante: null }), estados });
  }
  if (!res.length) throw new Error('la página de Alertas DNIT ha cambiado: no encuentro ninguna alerta en la lista');
  return res;
}

/** Página de una alerta → { titulo, texto, dia, hora, instante } */
export function alertaDNIT(html) {
  const titulo = limpio(String(html).match(/<h1[^>]*class="documentFirstHeading"[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
  const f = fechaDNIT(String(html).match(/class="documentPublished">[\s\S]*?class="value">([^<]+)</)?.[1] || '');
  const cuerpo = String(html).match(/property="rnews:articleBody">([\s\S]*?)<\/div>/)?.[1];
  if (!titulo || !f || !cuerpo) throw new Error('la página de la alerta del DNIT ha cambiado de formato (falta el título, la fecha o el texto)');
  const parrafos = [...cuerpo.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => limpio(m[1])).filter(Boolean);
  return { titulo, texto: parrafos.join('\n'), ...f };
}

/** Nivel de una alerta por su título y su texto. null → no se sabe clasificar (revisar a mano). */
export function clasificarDNIT(titulo, texto = '') {
  const t = norma(`${titulo}\n${texto}`);
  const tt = norma(titulo);
  if (/\blibera(cao|do|da)\b/.test(tt)) return { liberacao: true };
  if (/acima de \d+ ?(t|ton|toneladas)\b|veiculos? (pesados|de carga)|caminho(es|nhoes)/.test(t) && /restri|proib|impedid|bloque|interdi/.test(t)) return { gravedad: 'rojo', carga: true, etiqueta: 'No habilitado para carga' };
  if (/(interdicao|bloqueio) total|totalmente (bloquead|interditad|fechad)|interditada totalmente/.test(t)) return { gravedad: 'rojo', carga: false, etiqueta: 'Interdicción total' };
  if (/parcial|pare e siga|meia pista|desvio|bloqueio|interdi|restri|alterac(ao|oes) no (transito|trafego)|faixa/.test(t)) return { gravedad: 'ambar', carga: false, etiqueta: /pare e siga/.test(t) ? 'Pare y siga (paso alterno)' : /desvio/.test(t) ? 'Desvío' : /parcial|meia pista|faixa/.test(t) ? 'Interdicción parcial' : 'Tráfico alterado' };
  return null;
}
const ABIERTA = /a partir d[aeo]|por tempo indeterminado|ate (nova|segunda) ordem|sem previsao|ate a conclusao/;

/** ¿La alerta cuenta todavía? */
export function vigente(alerta, ahora = new Date()) {
  const dias = (ahora - new Date(alerta.instante)) / 864e5;
  return dias <= (ABIERTA.test(norma(alerta.texto)) ? DIAS_ALERTA_ABIERTA : DIAS_ALERTA);
}

/** Primera frase del texto oficial (dice qué, dónde y cuándo). */
const primeraFrase = (texto) => {
  const p = texto.split('\n')[0] || '';
  const f = p.match(/^.{20,400}?[.!?](?=\s|$)/)?.[0] || p.slice(0, 400);
  return f.replace(/^O Departamento Nacional de Infraestrutura de Transportes \(DNIT\)/, 'O DNIT');
};

const enGuia = (g) => (g.paso ? { paso: g.paso } : { tramos: g.tramos || [g.tramo] });

/**
 * alertas: [{ titulo, url, texto, dia, hora, instante }] (con texto, ya leídas). correspondencias: filas activas del CSV
 * ({ guia, rodovias: ['BR-267'], uf: 'MS' }). Devuelve { inc, revisar }: incidencias, y alertas de nuestras carreteras
 * que no se saben clasificar.
 */
export function incidenciasDNIT(alertas, correspondencias, ahora = new Date(), fuente = FUENTE_DNIT) {
  const inc = [];
  const revisar = [];
  const nuestras = (a, c) => rodoviasDe(`${a.titulo} ${a.texto || ''}`).some((r) => c.rodovias.includes(r.br) && (r.uf ? r.uf === c.uf : (a.estados || []).some((e) => norma(e) === norma(ESTADOS[c.uf] || ''))));
  for (const c of correspondencias) {
    const suyas = alertas.filter((a) => nuestras(a, c)).sort((a, b) => (a.instante < b.instante ? 1 : -1));
    // Una «liberação» cierra lo anterior de esa carretera.
    const lib = suyas.find((a) => clasificarDNIT(a.titulo)?.liberacao)?.instante || '';
    for (const a of suyas) {
      if (a.instante <= lib || !vigente(a, ahora)) continue;
      const n = clasificarDNIT(a.titulo, a.texto);
      if (n?.liberacao) continue;
      if (!n) {
        revisar.push(`Alerta del DNIT sin clasificar en ${c.rodovias.join(' / ')}/${c.uf}: «${a.titulo}» (${a.url}).`);
        continue;
      }
      const br = rodoviasDe(a.titulo).find((r) => c.rodovias.includes(r.br))?.br || c.rodovias[0];
      const fecha = `${a.dia.split('-').reverse().join('/')}, ${a.hora}`;
      inc.push({
        id: `dnit-${slugUrl(a.url)}`.slice(0, 80),
        paises: ['BR'],
        ubicacion: `${br}/${c.uf}`,
        tramo: `${br}/${c.uf}`,
        // Casi todo lo del DNIT son obras programadas: «Obra» (o «Desvío»); el color lo da la gravedad.
        tipo: n.carga ? 'peso' : n.etiqueta === 'Desvío' ? 'desvio' : 'obra',
        estado: 'activa',
        gravedad: n.gravedad,
        ...(n.carga ? { afecta: 'carga' } : {}),
        resumen: `${br}/${c.uf}: ${n.etiqueta.toLowerCase()} · DNIT ${a.dia.slice(8, 10)}/${a.dia.slice(5, 7)}`,
        descripcion: `${br}/${c.uf}: ${n.etiqueta}, según el DNIT (alerta del ${fecha}, hora de Brasília). Texto oficial: «${primeraFrase(a.texto)}»`,
        ...enGuia(c.guia),
        fuente,
        enlace: a.url,
        publicado: a.dia,
        horaFuente: a.instante,
        ...(n.carga ? { impacto: 'No habilitado para carga según el DNIT.' } : n.gravedad === 'rojo' ? { impacto: 'Interdicción total anunciada por el DNIT: mira en el texto oficial el día y la hora.' } : {}),
      });
    }
  }
  return { inc, revisar };
}
const ESTADOS = { MS: 'Mato Grosso do Sul' };
