// Genera la web estática en dist/ a partir de data/ y content/.
// Uso: npm run build   (variables opcionales: SITE_URL, BASE_PATH)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
// HU-135: textos de datos y de fuentes oficiales: se marcan en castellano (lang="es") y no se traducen.
import { tienePT, cargarDiccionario, compilar, traducirHTML } from './i18n.mjs';
import { cargar as cargarFuentesVigilancia } from './fuentes-vigilancia.mjs';
import { icono as ico, iconoMenu, iconosCliente } from './iconos.mjs';
import { ROOT, readJSON, loadGuia, parseFrontMatter, esc, ESTADOS, SECCIONES, PAISES, OPERATIVA, operativaDe } from './lib.mjs';
const txtEs = (t) => `<span lang="es" class="txt-es">${esc(t)}</span>`;
const txtOf = (t) => `<span lang="es" class="txt-es txt-oficial">${esc(t)}</span>`;
// HU-138: los avisos del DNIT llevan una cita del texto oficial en portugués («Texto oficial: «…»»): esa parte va
// marcada como portugués, para que no se traduzca ni se rotule como «texto oficial em espanhol».
// 20/11/2026: avisos cortos. Se ve una línea (el «resumen» del aviso o su primera frase) y el resto, en «Más información».
const ABREV = /(?:^|[\s(])(?:Acc|Lte|Emp|Gral|Pte|Cnel|Mcal|Av|Avda|km|Km|Dto|Prov|Dr|Sr|Sra|Nro|N°|Cdad|Sto|Sta|Ing|Int|Div|Pje|RN|RP)$/i;
/** Primera frase útil: sin el «Lugar:» del principio (la tarjeta ya lo dice) y sin cortar en «Acc.» o «km.». */
const primeraFrase = (t) => {
  let s = String(t).trim();
  const pre = s.match(/^[^:]{3,90}\):\s+|^[A-ZÁÉÍÓÚÑ][^:.]{2,60}:\s+/);
  if (pre && s.length - pre[0].length > 15) s = s.slice(pre[0].length);
  for (const m of s.matchAll(/\.(?=\s+[A-ZÁÉÍÓÚÑ¿«(]|\s*$)/g)) {
    if (ABREV.test(s.slice(0, m.index))) continue;
    s = s.slice(0, m.index);
    break;
  }
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length <= 120 ? s : `${s.slice(0, 110).replace(/\s+\S*$/, '')}…`;
};
const descInc = (t, resumen = null) => {
  const corto = resumen || primeraFrase(t);
  if (corto.replace(/[.\s]+$/, '') === String(t).replace(/[.\s]+$/, '')) return descLarga(t);
  return `${txtOf(corto)} <details class="mas-info"><summary>Más información</summary>${descLarga(t)}</details>`;
};
const descLarga = (t) => {
  const k = String(t).indexOf('Texto oficial: «');
  return k < 0 ? txtOf(t) : `${txtEs(String(t).slice(0, k + 'Texto oficial:'.length))} <span lang="pt-BR" class="txt-pt">${esc(String(t).slice(k + 'Texto oficial: '.length))}</span>`;
};
import { nivel, peor, estadoMostrable, NIVELES, diasEntre, registroGuia, EVIDENCIAS } from './validacion.mjs';
import { cargar } from './datos.mjs';
import { generarApi } from './api.mjs';
import { aplicarEstimaciones } from './estimaciones.mjs';
import { fiabilidad, ETIQUETAS_DIA } from './fiabilidad.mjs';
import { cargarCruces, configEnvio, TRAMOS_TIEMPO, SENTIDOS, DIAS, MINIMO, CAMPOS_SOLICITUD, CAMPOS_COTIZACION } from './cruces.mjs';

const require = createRequire(import.meta.url);
let marked;
try {
  ({ marked } = require('marked'));
} catch {
  console.error('Falta la dependencia "marked". Ejecuta: npm install');
  process.exit(1);
}

const DIST = path.join(ROOT, 'dist');
const site = readJSON('data/site.json');
if (process.env.SITE_URL) site.url = process.env.SITE_URL;
if (process.env.BASE_PATH) site.basePath = process.env.BASE_PATH === '/' ? '' : process.env.BASE_PATH;
const B = (site.basePath || '').replace(/\/$/, '');
const GENERADO_ISO = new Date().toISOString();
const u = (p) => `${B}${p}`;
const hayMapLibre = (() => {
  try {
    createRequire(import.meta.url).resolve('maplibre-gl/package.json');
    return true;
  } catch {
    return false;
  }
})();
// HU-115: trazados y km calculados con OpenStreetMap (data/trazados.json), si existen.
const TRAZADOS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'trazados.json'), 'utf8'));
  } catch {
    return null;
  }
})();
const kmCalc = (t, via) => TRAZADOS?.tramos?.[`${t.id}${via ? `@${via.id}` : ''}`]?.km ?? null;
const hayFuente = (() => {
  try {
    createRequire(import.meta.url).resolve('@fontsource-variable/dm-sans/package.json');
    return true;
  } catch {
    return false;
  }
})();
// Marca madre (Vialta): un solo interruptor en data/site.json (marcaMadre.mostrar).
const madre = site.marcaMadre?.mostrar ? site.marcaMadre.nombre : '';
// Sin símbolo por debajo de 24 px: a ese tamaño la «V» de Vialta se confunde con el ✓ de «verificado».
const firmaMadre = (clase = 'firma-madre') => (madre ? `<p class="${clase}">${esc(site.nombre)} es un producto de <strong class="madre">${esc(madre)}</strong></p>` : '');

const D = cargar();
const categorias = D.categorias;
const catNombre = Object.fromEntries(categorias.map((c) => [c.id, c.nombre]));
const rutas = D.rutas;
const nodoNombre = Object.fromEntries(rutas.nodos.map((n) => [n.id, n.nombre]));
const empresas = D.empresas;
empresas.sort((a, b) => Number(b.destacada) - Number(a.destacada) || a.nombre.localeCompare(b.nombre, 'es'));
const empresasEn = (ids = []) => empresas.filter((e) => (e.puntos || []).some((p) => ids.includes(p)));
const novedades = D.novedades.sort((a, b) => b.publicado.localeCompare(a.publicado));

// ---------- datos operativos ----------
const HOY = process.env.FECHA_HOY || new Date().toISOString().slice(0, 10);
const diasDesde = (iso) => (iso ? Math.floor((Date.parse(HOY) - Date.parse(iso)) / 864e5) : Infinity);
const fichaPasos = D.pasos;
const fichaPaso = Object.fromEntries(fichaPasos.map((p) => [p.id, p]));
// Validación: una sola regla para todo el portal (scripts/validacion.mjs).
const metaGuia = Object.fromEntries(loadGuia().map((p) => [`${p.seccion}/${p.slug}`, p.meta]));
const registroFicha = registroGuia;
const nivelFicha = (ruta) => (metaGuia[ruta] ? nivel(registroFicha(metaGuia[ruta]), 'ficha', HOY) : null);
const guiaDePaso = Object.fromEntries(rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).filter(Boolean).map((q) => [q.id, q.guia]));
/** Estado mostrable de un paso: combina la validación del dato y la de su ficha. */
// Decisión del 15/11/2026: lo que importa es la operatividad. El estado de un paso o tramo se confirma
// por su propia verificación; que el texto de la ficha de la guía esté en revisión no lo oculta.
// Decisión del 20/11/2026, simplificada el 24/11/2026 (decisión 33): un paso solo sale «Habilitado» si TODOS sus lados
// lo confirman según cómo informa su país (ver ladosSinParte); si a uno le falta, «Sin confirmar».
// Una fuente que no es oficial (prensa) tampoco puede dejar un paso como abierto.
const ahoraLados = process.env.FECHA_HOY ? Date.parse(`${HOY}T15:00:00Z`) : Date.now();
// 22/11/2026: un lado que el vigilante lee él solo en la web oficial (Gendarmería) está confirmado mientras esas lecturas
// sean recientes, aunque el organismo no haya fechado un parte nuevo: si el estado cambiara, el vigilante lo habría
// publicado. El parte fechado sigue a la vista («último parte de Gendarmería: 17 nov»).
const LECTURA_LADO_H = 6;
const vigilanciaDeLado = (() => {
  let estado = null;
  try {
    estado = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vigilancia-estado.json'), 'utf8'));
  } catch {}
  const porPaso = {};
  for (const f of cargarFuentesVigilancia().filas.filter((x) => x.estado === 'activa' && x.lector === 'gendarmeria-paso' && x.destino.startsWith('paso:')))
    (porPaso[f.destino.slice(5)] ||= {})[f.pais] = { fuente: f.fuente_id, organismo: f.organismo.replace(/\s*\(.*\)$/, '') };
  return (pasoId, lado) => {
    const m = porPaso[pasoId]?.[lado];
    return m ? { ...m, f: estado?.fuentes?.[m.fuente] || null } : null;
  };
})();
const lecturaAutoDeLado = (pasoId, lado) => {
  const v = vigilanciaDeLado(pasoId, lado);
  const f = v?.f;
  if (!f?.ultimaLecturaBuena || (f.fallosSeguidos || 0) >= 3) return null;
  const horas = (ahoraLados - Date.parse(f.ultimaLecturaBuena)) / 36e5;
  return horas <= LECTURA_LADO_H ? { lado, comprobado: f.ultimaLecturaBuena, organismo: v.organismo } : null;
};
// 24/11/2026 (decisión 33, regla por país): cada lado lo decide su país según cómo informa.
// · «diario» (Argentina: Gendarmería publica cada mañana que abre): el lado vale si el vigilante leyó su web oficial
//   hace menos de LECTURA_LADO_H o si hay un parte oficial de ese lado fechado hoy; lo que dice (abierto, cierre, sin
//   confirmar) ya está en el estado del paso.
// · «por-aviso» (Chile, Paraguay: solo publican cuando cierran): su silencio vale como habilitado mientras el canal se
//   haya revisado en plazo (ladoPorAviso). Pasado el plazo, es fallo nuestro: «Sin confirmar».
// · «sin-canal» (Paraguay, 25/11/2026: no hay fuente oficial del estado de sus pasos): ese lado no puede confirmar ni
//   negar nada, así que no cuenta; lo decide el otro lado y la ficha lo dice.
// Desaparecen el umbral de 48 h por parte y el «Abierto solo en…».
const modoLado = (lado) => site.canalesParte?.[lado]?.modo || 'diario';
const parteDeHoy = (p, lado) => (p.partes || []).filter((x) => x.lado === lado && x.publicado === HOY).sort((a, b) => (b.hora || '').localeCompare(a.hora || ''))[0] || null;
const ladoDiarioOk = (p, lado) => !!(lecturaAutoDeLado(p.id, lado) || parteDeHoy(p, lado));
const ladosSinParte = (p) =>
  Object.keys(p?.lados || {}).filter((lado) => modoLado(lado) !== 'sin-canal' && (modoLado(lado) === 'por-aviso' ? !ladoPorAviso(p, lado) : !ladoDiarioOk(p, lado)));
// 21/11/2026: Chile publica el parte diario de sus pasos solo por WhatsApp y X (Unidad de Pasos Fronterizos), sin web
// que el vigilante pueda leer. Cuando falta ese lado, se enlaza el canal oficial para que el transportista lo compruebe.
const canalParte = (lados) =>
  lados
    .map((k) => site.canalesParte?.[k])
    .filter(Boolean)
    .map((c) => ` <a href="${esc(c.url)}" rel="noopener">Compruébalo en la ${esc(c.canal)} de la ${esc(c.organismo.split(' (')[0])}</a>.`)
    .join('');
// 22/11/2026: cada país informa a su manera. Argentina confirma a diario (parte positivo); Chile (UPF) solo avisa cuando
// hay un problema. Para un lado «por-aviso» (site.canalesParte.<país>.modo), su silencio cuenta como «sin avisos» desde
// la última revisión del canal o su último parte, durante plazoDias. Si su último aviso fue un problema, no hay silencio
// que valga; pasado el plazo, el lado vuelve a «sin dato».
const ladoPorAviso = (p, lado) => {
  const c = site.canalesParte?.[lado];
  if (c?.modo !== 'por-aviso') return null;
  const ult = (p.partes || []).filter((x) => x.lado === lado).sort((a, b) => `${b.publicado}${b.hora || ''}`.localeCompare(`${a.publicado}${a.hora || ''}`))[0];
  if (ult?.valor && ult.valor !== 'operativo') return null;
  const desde = [c.revisado, ult?.publicado].filter(Boolean).sort().pop();
  if (!desde) return null;
  const dias = (ahoraLados - Date.parse(`${desde}T12:00:00-03:00`)) / 864e5;
  return dias <= (c.plazoDias ?? 15) ? { lado, desde, explicacion: c.explicacion || '' } : null;
};
// 25/11/2026 (auditoría A3): un aviso oficial de cierre o restricción de un país que informa por aviso (Chile) decide el
// cruce mientras esté dentro del plazo de su canal; antes salía «Sin confirmar».
const ultimoParteLado = (p, lado) => (p?.partes || []).filter((x) => x.lado === lado).sort((a, b) => `${b.publicado}${b.hora || ''}`.localeCompare(`${a.publicado}${a.hora || ''}`))[0] || null;
const avisoDeLado = (p) =>
  Object.keys(p?.lados || {})
    .filter((l) => modoLado(l) === 'por-aviso')
    .map((l) => ({ lado: l, parte: ultimoParteLado(p, l) }))
    .find((x) => x.parte && ['cerrado', 'restricciones'].includes(x.parte.valor) && diasDesde(x.parte.publicado) <= (site.canalesParte[x.lado].plazoDias ?? 15)) || null;
// 25/11/2026 (decisión D1 del fundador): el temporal o la carretera de cualquier lado afectan al cruce. Un aviso oficial
// leído automáticamente (Vialidad Nacional, Vialidad de Chile…) en el acceso del paso, ámbar o rojo, lo deja «Con
// restricciones» (también el corte total: decisión D2). Los avisos cargados a mano son de contexto y no cuentan aquí.
const accesoConAvisos = (id) => D.incidencias.filter((i) => i.estado === 'activa' && i.paso === id && i.horaFuente && ['ambar', 'rojo'].includes(i.gravedad || 'ambar'));
// 25/11/2026 (decisión D3 del fundador): si la web oficial que lee el vigilante no responde, se mantiene el último estado
// que leyó, avisando de que la fuente no responde.
const fuenteCaidaDe = (p) => {
  if (p?.estado?.verificacion?.verificadoPor !== 'vigilante') return null;
  const lado = Object.keys(p.lados || {}).find((l) => vigilanciaDeLado(p.id, l)?.f);
  const f = lado && vigilanciaDeLado(p.id, lado).f;
  if (!f) return null;
  const horas = f.ultimaLecturaBuena ? (ahoraLados - Date.parse(f.ultimaLecturaBuena)) / 36e5 : Infinity;
  return (f.fallosSeguidos || 0) >= 3 || horas > LECTURA_LADO_H ? { desde: f.ultimaLecturaBuena || null } : null;
};
/** 25/11/2026: por qué el cruce no muestra el estado cargado del paso (aviso de un lado, carretera de acceso, fuente caída). */
const notaIntegridad = (e) =>
  e.avisoLado
    ? `${PAISES[e.avisoLado.lado]}: ${e.avisoLado.afecta === 'carga' ? 'sin paso para camiones con carga · ' : ''}aviso oficial del ${fechaCorta(e.avisoLado.publicado)}${e.avisoLado.hora ? `, ${e.avisoLado.hora}` : ''}${e.avisoLado.emisor ? ` (${e.avisoLado.emisor.replace(/\s*\(.*\)$/, '')})` : ''}.`
    : e.accesoAvisos
    ? `${e.accesoAvisos === 1 ? 'Hay un aviso oficial' : `Hay ${e.accesoAvisos} avisos oficiales`} en la carretera de acceso. Revísalo antes de salir.`
    : e.fuenteCaida
    ? `La web oficial no responde${e.fuenteCaida.desde ? ` desde el ${fechaCorta(e.fuenteCaida.desde.slice(0, 10))}, ${new Date(e.fuenteCaida.desde).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Salta' })} (hora de Argentina)` : ''}: es el último estado leído.`
    : '';
const estadoPaso = (id) => {
  const p = fichaPaso[id];
  const base = estadoMostrable(p?.estado, HOY);
  const caida = base.valor !== 'operativo' && base.confirmado ? fuenteCaidaDe(p) : null;
  const e = caida ? { ...base, fuenteCaida: caida } : base;
  const av = e.valor !== 'cerrado' && e.valor !== 'en-obras' ? avisoDeLado(p) : null;
  if (av) return { ...e, valor: av.parte.valor, confirmado: true, nivel: 'verificado', avisoLado: { lado: av.lado, publicado: av.parte.publicado, hora: av.parte.hora || null, emisor: av.parte.emisor || '', afecta: av.parte.afecta || null } };
  if (!e.confirmado || e.valor !== 'operativo') return e;
  if (e.evidencia && e.evidencia !== 'oficial') return { ...e, valor: 'pendiente', confirmado: false, nivel: 'por-verificar' };
  const porAviso = Object.keys(p?.lados || {}).map((l) => ladoPorAviso(p, l)).filter(Boolean);
  const sin = ladosSinParte(p);
  // El cruce es el peor de sus lados: si a uno le falta confirmación, el paso queda «Sin confirmar».
  if (sin.length) return { ...e, valor: 'pendiente', confirmado: false, nivel: 'por-verificar', sinLados: sin, porAviso };
  const acceso = accesoConAvisos(id);
  if (acceso.length) return { ...e, valor: 'restricciones', accesoAvisos: acceso.length, porAviso: porAviso.length ? porAviso : undefined };
  return porAviso.length ? { ...e, porAviso } : e;
};
/** 22/11/2026: una línea por lado del paso. Cómo informa ese país y qué sabemos hoy, en palabras llanas. */
const etiquetaLado = (v) => (!v || v === 'operativo' ? 'Habilitado' : v === 'pendiente' ? 'Sin confirmar' : ESTADOS[v] || v);
const ladosHTML = (p, e) => {
  const lados = Object.keys(p?.lados || {});
  if (lados.length < 2) return '';
  const fila = (lado) => {
    const delLado = (p.partes || []).filter((x) => x.lado === lado).sort((a, b) => `${b.publicado}${b.hora || ''}`.localeCompare(`${a.publicado}${a.hora || ''}`));
    // El parte que decide el lado es el del organismo del paso (Gendarmería), no el de la ruta (Vialidad).
    const ult = delLado.find((x) => !/^Vialidad/.test(x.emisor || '')) || delLado[0];
    const quien = ult?.emisor ? txtEs(ult.emisor.replace(/\s*\(.*\)$/, '')) : '';
    let cls, txt;
    if (modoLado(lado) === 'sin-canal') {
      cls = 'sin-canal';
      txt = `<strong>Sin canal oficial</strong> · ${esc(site.canalesParte[lado].explicacion || 'no publica el estado del paso')}`;
    } else if (modoLado(lado) === 'por-aviso') {
      const av = ladoPorAviso(p, lado);
      if (av) {
        cls = 'aviso';
        txt = `<strong>Sin avisos</strong> desde el ${fechaCorta(av.desde)}${av.explicacion ? ` · ${esc(av.explicacion)}` : ''}`;
      } else if (ult?.valor && ult.valor !== 'operativo') {
        cls = 'parte';
        txt = `<strong>${esc(etiquetaLado(ult.valor))}</strong> · aviso oficial del ${fechaCorta(ult.publicado)}${ult.hora ? `, ${esc(ult.hora)}` : ''}${quien ? ` (${quien})` : ''}`;
      } else {
        cls = 'sin-dato';
        txt = `<strong>Sin confirmar</strong> · su canal oficial no se ha revisado en los últimos ${site.canalesParte?.[lado]?.plazoDias ?? 15} días`;
      }
    } else {
      const auto = lecturaAutoDeLado(p.id, lado);
      if (auto) {
        cls = 'parte';
        const hora = new Date(auto.comprobado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Salta' });
        txt = `<strong>${esc(etiquetaLado(e.ultimo || e.valor))}</strong> · comprobado en la web oficial el ${fechaCorta(auto.comprobado.slice(0, 10))}, ${hora} (hora de Argentina)${ult ? ` · último parte de ${quien || esc(auto.organismo)}: ${fechaCorta(ult.publicado)}` : ''}`;
      } else if (parteDeHoy(p, lado)) {
        const h = parteDeHoy(p, lado);
        cls = 'parte';
        txt = `<strong>${esc(etiquetaLado(h.valor))}</strong> · parte oficial del ${fechaCorta(h.publicado)}${h.hora ? `, ${esc(h.hora)}` : ''}${h.emisor ? ` (${txtEs(h.emisor.replace(/\s*\(.*\)$/, ''))})` : ''}`;
      } else {
        cls = 'sin-dato';
        txt = `<strong>Sin confirmar</strong> · sin parte de hoy ni lectura de su web oficial en las últimas ${LECTURA_LADO_H} h`;
      }
    }
    return `<li class="lado lado-${cls}">${bandera(lado)}<span class="lado-pais">${esc(PAISES[lado])}</span><span class="lado-texto">${txt}${cls !== 'parte' && cls !== 'sin-canal' ? canalParte([lado]).replace(/\.$/, '') : ''}</span></li>`;
  };
  return `<ul class="lados-paso">${lados.map(fila).join('')}</ul>`;
};
/** «Chile: sin avisos desde el 22 nov». */
const textoPorAviso = (xs) => xs.map((a) => `${PAISES[a.lado]}: sin avisos desde el ${fechaCorta(a.desde)}`).join(' · ');
const estadoTramo = (t) => (t.paso?.id ? estadoPaso(t.paso.id) : estadoMostrable(t.reporte, HOY));
// Estimaciones provisionales de distancia (solo tramos sin km con fuente).
aplicarEstimaciones(rutas, fichaPasos, site.estimaciones?.provisionales !== false);
rutas.tramos.forEach((t) => {
  t.vista = estadoTramo(t);
  t.estado = t.vista.valor;
  t.op = t.vista.op = operativaDe(t.estado, t.paso ? 'paso' : 'tramo');
  if (t.alternativa?.id) {
    t.alternativa.vista = estadoPaso(t.alternativa.id);
    t.alternativa.estado = t.alternativa.vista.valor;
    t.alternativa.op = t.alternativa.vista.op = operativaDe(t.alternativa.estado, 'paso');
  }
});
const tramoPorId = Object.fromEntries(rutas.tramos.map((t) => [t.id, t]));
const nombreTramo = (t) => `${nodoNombre[t.desde]} – ${nodoNombre[t.hasta]}`;
const festivosDoc = D.festivos;
const festivos = festivosDoc.festivos.filter((f) => f.fecha >= HOY);
// Solo las fuentes oficiales deciden el estado (19/11/2026). Un aviso de prensa sin verificar queda como contexto: se
// ve en gris, con el nombre del medio, y no cambia el estado de un tramo ni el veredicto.
const incidencias = D.incidencias.map((i) => {
  const f = typeof i.fuente === 'string' ? D.fuentes.get(i.fuente) : i.fuente;
  return f?.tipo !== 'oficial' && i.validacion !== 'verificado' && (i.gravedad || 'ambar') !== 'info' ? { ...i, gravedad: 'info', contexto: true, gravedadPrensa: i.gravedad || 'ambar' } : i;
});
const activas = incidencias.filter((i) => i.estado === 'activa');
// HU-131: tres estados para los tramos de carretera, en lugar de «Sin confirmar».
//   - Sin incidencias: el vigilante lee cada hora su fuente oficial (fila «activa» del CSV de fuentes) y no hay ningún
//     aviso suyo activo. Los avisos (incidencias) siguen saliendo aparte y deciden el veredicto.
//   - Vigilancia sin actualizar: su fuente falla 3 lecturas seguidas o lleva más de 12 h sin una lectura buena (el
//     vigilante no pasa de noche). Se sabe por el estado de la vigilancia (rama datos-vigilancia), que «Publicar web»
//     deja en data/vigilancia-estado.json antes de construir; sin ese archivo no se puede decir y no se marca.
//   - Sin vigilancia: ninguna fuente oficial lo lee cada hora.
// Un parte confirmado (cargado a mano, verificado y vigente) manda sobre todo esto.
const HORAS_SIN_ACTUALIZAR = 12;
// Estado de la vigilancia en vivo (lo escribe el vigilante cada hora en la rama datos-vigilancia del repositorio público):
// la página lo consulta al abrirse para decir «leído hace N min» o «Vigilancia sin actualizar» sin esperar a publicar.
const VIGILANCIA_URL = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY || 'elezcano/GuiaCorredor'}/datos-vigilancia/vigilancia.json`;
const estadoVigilancia = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vigilancia-estado.json'), 'utf8'));
  } catch {
    return null;
  }
})();
// Cada cuánto publica el organismo, en corto (de la columna «frecuencia» del CSV de fuentes).
const frecuenciaCorta = (txt = '') => (/irregular/i.test(txt) ? 'cuando hay alerta' : txt.split(/[,(;]/)[0].trim().replace(/^./, (c) => c.toLowerCase()));
const vigilanciaDeTramo = (() => {
  const m = {};
  for (const f of cargarFuentesVigilancia().filas.filter((x) => x.estado === 'activa' && x.destino.startsWith('tramo:'))) {
    const id = f.destino.slice(6);
    (m[id] ||= { fuentes: [], organismos: [], frecuencias: [] }).fuentes.includes(f.fuente_id) || m[id].fuentes.push(f.fuente_id);
    const fr = frecuenciaCorta(f.frecuencia);
    if (fr && !m[id].frecuencias.includes(fr)) m[id].frecuencias.push(fr);
    const org = f.organismo.split(',')[0].trim(); // «MOPC, Departamento de Radiocomunicaciones» → «MOPC»
    if (!m[id].organismos.includes(org)) m[id].organismos.push(org);
  }
  return m;
})();
const ahoraBuild = process.env.FECHA_HOY ? new Date(`${HOY}T15:00:00Z`) : new Date();
function fuenteParada(id) {
  const f = estadoVigilancia?.fuentes?.[id];
  if (!f) return false;
  const horas = f.ultimaLecturaBuena ? (ahoraBuild - new Date(f.ultimaLecturaBuena)) / 36e5 : Infinity;
  return (f.fallosSeguidos || 0) >= 3 || horas > HORAS_SIN_ACTUALIZAR;
}
// 21/11/2026: dos causas distintas. «Fuente atrasada»: la web del organismo responde pero no publica desde hace más de lo
// habitual. «Fuente no disponible»: no se puede leer (error, o sin lectura buena en 12 h).
const fuenteAtrasada = (id) => {
  const f = estadoVigilancia?.fuentes?.[id];
  return !!(f && (f.atrasada || /no se actualiza|último informe/.test(f.ultimoError || '')));
};
rutas.tramos.forEach((t) => {
  if (t.paso || t.vista.confirmado) return;
  const vig = vigilanciaDeTramo[t.id];
  const organismos = vig?.organismos.join(' · ');
  const base = { ...t.vista, vigilancia: vig ? { fuentes: vig.fuentes, organismos, frecuencia: vig.frecuencias.join(' / ') } : null };
  // Avisos activos del tramo (de cualquier fuente; los informativos no cuentan): «Cortado» o «Con incidencias».
  const avisos = activas.filter((i) => (i.tramos || []).includes(t.id) && !i.paso && (i.gravedad || 'ambar') !== 'info');
  const rojo = avisos.find((i) => i.gravedad === 'rojo');
  if (avisos.length) {
    t.vista = { ...base, confirmado: true, valor: rojo ? 'cerrado' : 'restricciones', etiqueta: rojo ? (rojo.afecta === 'carga' ? 'Cortado para carga' : 'Cortado') : 'Con incidencias', fuente: vig ? { nombre: organismos, tipo: 'oficial', leidoAuto: true } : base.fuente, vigilado: !!vig, conAvisos: avisos.length };
    t.estado = t.vista.valor;
    t.op = t.vista.op = rojo ? 'cerrado' : 'restricciones';
    return;
  }
  if (!vig) t.vista = { ...base, etiqueta: 'Sin vigilancia' };
  else if (vig.fuentes.some(fuenteParada)) t.vista = { ...base, etiqueta: vig.fuentes.some(fuenteAtrasada) ? 'Fuente atrasada' : 'Fuente no disponible' };
  else t.vista = { ...base, confirmado: true, valor: 'sin-incidencias', etiqueta: 'Sin incidencias', fuente: { nombre: organismos, tipo: 'oficial', leidoAuto: true }, vigilado: true };
  t.estado = t.vista.valor;
  t.op = t.vista.op = t.vista.valor === 'sin-incidencias' ? 'abierto' : 'sin-confirmar';
});
const avisosMeteo = D.avisos.filter((a) => !a.vigenteHasta || a.vigenteHasta >= HOY);
const organismos = D.organismos;
const organismoPorId = Object.fromEntries(organismos.map((o) => [o.id, o]));
const TIPOS_INCIDENCIA = {
  obra: ['Obra', 'obra'],
  restriccion: ['Restricción', 'restriccion'],
  corte: ['Cortes por clima', 'clima'],
  pendiente: ['Sin habilitar', 'pendiente'],
  peso: ['Límite de peso', 'restriccion'],
  desvio: ['Desvío', 'restriccion'],
  otro: ['Aviso', 'restriccion'], // HU-130: observaciones de Vialidad sobre una ruta habilitada
};
const TIPOS_FESTIVO = { feriado: 'Feriado', 'no-laborable': 'No laborable', facultativo: 'Punto facultativo' };

// Tiempos de cruce
const pasos = rutas.tramos.flatMap((t) => [t.paso, t.alternativa].filter(Boolean));
const pasoPorGuia = Object.fromEntries(pasos.filter((p) => p.guia).map((p) => [p.guia, p]));
let envioCruce = configEnvio(site.cruces?.enlacePrellenado);
if (envioCruce?.error) {
  console.warn(`Aviso: tiempos de cruce sin formulario: ${envioCruce.error}.`);
  envioCruce = null;
}
const cruces = await cargarCruces(site.cruces, new Set(pasos.map((p) => p.id)));
cruces.avisos.forEach((a) => console.warn(`Aviso: ${a}`));
const nombreTiempo = Object.fromEntries(TRAMOS_TIEMPO.map((t) => [t.id, t]));

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const renderGuia = (body, indice = []) =>
  marked
    .parse(body)
    .replace(/href="\/(?!\/)/g, `href="${B}/`)
    .replace(/<h2>(.*?)<\/h2>/g, (_, t) => {
      const id = slugify(t);
      indice.push({ id, t: t.replace(/<[^>]+>/g, '') });
      return `<h2 id="${id}">${t}</h2>`;
    })
    .replace(/<table>/g, '<div class="tabla-marco"><table>')
    .replace(/<\/table>/g, '</table></div>');
const guia = loadGuia().map((p) => {
  const indice = [];
  const html = renderGuia(p.body, indice);
  return { ...p, html, indice };
});
// HU-136: texto de la guía en portugués (content/pt/guia/<seccion>/<slug>.md), si existe.
const guiaPT = Object.fromEntries(
  guia
    .map((p) => {
      const f = path.join(ROOT, 'content', 'pt', 'guia', p.seccion, `${p.slug}.md`);
      if (!fs.existsSync(f)) return null;
      const { meta, body } = parseFrontMatter(fs.readFileSync(f, 'utf8'));
      return [p.ruta, { titulo: meta.titulo, resumen: meta.resumen, html: renderGuia(body) }];
    })
    .filter(Boolean)
);
const guiaPorRuta = Object.fromEntries(guia.map((p) => [`${p.seccion}/${p.slug}`, p]));
// Estado de una ficha: los pasos lo toman de data/pasos.json (función declarada más abajo).
const vistaGuia = (p) => {
  const ruta = `${p.seccion}/${p.slug}`;
  const id = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.guia === ruta)?.id;
  if (id) return estadoPaso(id);
  const ts = rutas.tramos.filter((t) => t.guia === ruta && !t.paso);
  if (!ts.length) return null; // documentos: sin estado operativo
  // El tramo con el dato más relevante: obras antes que operativo.
  return ts.map((t) => t.vista).sort((a, b) => Number(b.ultimo === 'en-obras') - Number(a.ultimo === 'en-obras'))[0];
};
const estadoGuia = (p) => vistaGuia(p)?.valor || 'sin-estado';
const nivelGuia = (p) => nivelFicha(`${p.seccion}/${p.slug}`);

// ---------- iconos (trazo, 24×24) ----------

const icono = (n, clase = 'icono') => ico(n, { clase });

// ---------- piezas comunes ----------
/** Chip del semáforo operativo: icono + texto (+ detalle del estado si aporta). */
const estado = (e, tipo = 'paso', texto = null) => {
  const op = e === 'sin-incidencias' ? 'abierto' : operativaDe(e, tipo);
  const det = !texto && ESTADOS[e] && !['pendiente', 'operativo', 'restricciones'].includes(e) && ESTADOS[e] !== OPERATIVA[op].texto ? `<span class="estado-detalle">· ${esc(ESTADOS[e])}</span>` : '';
  return `<span class="estado estado-${esc(e)} op-${op}">${OPERATIVA[op].icono}<span class="estado-texto">${esc(texto || OPERATIVA[op].texto)}</span>${det}</span>`;
};
/** HU-131: texto del estado de un tramo o paso («Sin incidencias», «Sin vigilancia»…, o el del semáforo). */
const textoVista = (v, op) => v?.etiqueta || OPERATIVA[op].texto;
/** «hace 8 días», «hace 5 meses». */
const haceTiempo = (iso) => {
  const d = diasDesde(iso);
  if (!Number.isFinite(d)) return '';
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 31) return `hace ${d} días`;
  const m = Math.round(d / 30.4);
  return m < 12 ? `hace ${m === 1 ? 'un mes' : `${m} meses`}` : `hace ${Math.round(d / 365) === 1 ? 'un año' : `${Math.round(d / 365)} años`}`;
};
// Banderas en SVG (los emojis de bandera no se ven en Windows: salen como «PY»). Accesibles con aria-label.
const BANDERAS = {
  AR: '<rect width="30" height="20" fill="#74ACDF"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="2.2" fill="#F6B40E"/>',
  BR: '<rect width="30" height="20" fill="#009C3B"/><path d="M15 2.5 27 10 15 17.5 3 10z" fill="#FFDF00"/><circle cx="15" cy="10" r="4" fill="#002776"/>',
  CL: '<rect width="30" height="20" fill="#fff"/><rect y="10" width="30" height="10" fill="#D52B1E"/><rect width="10" height="10" fill="#0039A6"/><path d="m5 2.4 1.1 3.3h3.4l-2.8 2 1.1 3.3L5 9l-2.8 2 1.1-3.3-2.8-2h3.4z" fill="#fff" transform="translate(0 -.4) scale(1) "/>',
  PY: '<rect width="30" height="20" fill="#fff"/><rect width="30" height="6.67" fill="#D52B1E"/><rect y="13.33" width="30" height="6.67" fill="#0038A8"/><circle cx="15" cy="10" r="2.3" fill="none" stroke="#1d6b2f" stroke-width=".9"/>',
};
const bandera = (p) =>
  BANDERAS[p]
    ? `<span class="pais pais-bandera" role="img" aria-label="${esc(PAISES[p] || p)}" title="${esc(PAISES[p] || p)}"><svg viewBox="0 0 30 20" width="21" height="14" aria-hidden="true" focusable="false">${BANDERAS[p]}</svg></span>`
    : `<abbr class="pais" title="${esc(PAISES[p] || p)}">${esc(p)}</abbr>`;
/** Sustituye los códigos de país de un texto (AR, BR, CL, PY) por su bandera accesible. */
const conBanderas = (txt = '') => esc(txt).replace(/\b(AR|BR|CL|PY)\b/g, (c) => bandera(c));
const paises = (ps = []) => `<span class="paises">${ps.map((p) => bandera(p)).join('')}</span>`;
const fecha = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
};
const tiempo = (iso) => `<time class="rel" datetime="${esc(iso)}">${fecha(iso)}</time>`;
const fechaCorta = (iso) => {
  const d = new Date(iso + 'T12:00:00Z');
  // Con año si no es el año en curso, para que un dato viejo no parezca de este año.
  const conAnio = iso.slice(0, 4) !== HOY.slice(0, 4);
  return isNaN(d) ? esc(iso) : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace('.', '');
};
const diaSemana = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
const otras = (r) => (r?.otrasFuentes?.length ? ` · También: ${r.otrasFuentes.map((f) => fuenteEnlace(f)).join(', ')}` : '');
const fuenteEnlace = (f) => (f?.url ? `<a href="${esc(f.url)}" rel="noopener">${txtEs(f.nombre)}</a>` : f?.nombre ? txtEs(f.nombre) : '');
const TIPO_SELLO = { oficial: 'Fuente oficial', prensa: 'Prensa', referencia: 'Referencia', empresa: 'Declaración de la empresa', otra: 'Otra fuente' };
const TIPO_FUENTE = { oficial: 'fuente oficial', prensa: 'prensa', referencia: 'obra de referencia', empresa: 'declaración de la empresa', otra: 'otra fuente' };
/** Insignia de validación (texto + icono, no solo color). */
/** HU-107: la insignia dice dónde se comprobó el dato, nunca quién. */
const verificadoEn = (fuente) => (fuente?.leidoAuto ? 'Leído de la web oficial' : fuente?.tipo === 'oficial' ? 'Verificado en fuente oficial' : 'Verificado en la fuente');
/** HU-133 (R3): texto del sello único. «Gendarmería · 18 nov · ✓ Web oficial» / «… · Verificado» / «… · Sin verificar». */
function selloCorto(n, verificado, fuente, publicado) {
  const quien = fuente?.nombre ? txtEs(fuente.nombre) : 'Sin fuente';
  const cuando = n === 'verificado' && verificado ? fechaCorta(verificado) : publicado ? fechaCorta(publicado) : '';
  // 19/11/2026: sin el sello amarillo «Sin verificar». Lo no verificado dice de qué tipo es su fuente («Prensa»), en gris.
  // 20/11/2026: el ✓ es solo para organismos oficiales. Lo comprobado en prensa u otra fuente secundaria dice de qué tipo es.
  const marca = n === 'verificado' && verificado && (fuente?.leidoAuto || fuente?.tipo === 'oficial') ? `<span class="sello-ok">✓ ${fuente?.leidoAuto ? 'Web oficial' : 'Oficial'}</span>` : `<span class="sello-tipo">${esc(TIPO_SELLO[fuente?.tipo] || 'Sin fuente')}${n === 'verificado' && verificado && fuente?.tipo !== 'oficial' ? ' · sin parte oficial' : ''}</span>`;
  return [quien, cuando, marca].filter(Boolean).join(' · ');
}
function validacionHTML(n, verificado, fuente) {
  const txt = n === 'verificado' && verificado ? `${verificadoEn(fuente)} el ${fechaCorta(verificado)}` : n === 'por-verificar' || n === 'caducado' ? TIPO_SELLO[fuente?.tipo] || 'Sin fuente' : NIVELES[n]?.texto || n;
  return `<span class="val val-${esc(n)}">${esc(txt)}</span>`;
}
/** Estado operativo + línea de contexto: confirmado, o "Por verificar" con el último dato. */
function vistaHTML(v, { corto = false, tipo = 'paso' } = {}) {
  // HU-131: tramo vigilado sin avisos, o con la vigilancia parada, o sin vigilancia.
  if (v.vigilado) return `${estado(v.valor === 'sin-incidencias' ? 'sin-incidencias' : v.valor, tipo, v.etiqueta)}<span class="estado-fecha sello-linea" data-vig-fuentes="${esc(v.vigilancia.fuentes.join(' '))}">${txtEs(v.vigilancia.organismos)} · <a href="${u('/fuentes/')}">comprobado cada hora</a>${v.vigilancia.frecuencia ? ` · publica: ${esc(v.vigilancia.frecuencia)}` : ''}</span>`;
  if (v.sinLados) {
    const lineas = [`falta confirmación de ${listaY(v.sinLados.map((k) => PAISES[k]))}`, v.porAviso?.length ? textoPorAviso(v.porAviso) : ''].filter(Boolean);
    return `${estado('pendiente', tipo)}<span class="estado-fecha sello-linea">${lineas.join(' · ')}</span>`;
  }
  if (v.avisoLado) return `${estado(v.valor, tipo)}<span class="estado-fecha sello-linea">${esc(PAISES[v.avisoLado.lado])}: aviso oficial del ${fechaCorta(v.avisoLado.publicado)}${v.avisoLado.hora ? `, ${esc(v.avisoLado.hora)}` : ''}${v.avisoLado.emisor ? ` (${txtEs(v.avisoLado.emisor.replace(/\s*\(.*\)$/, ''))})` : ''}</span>`;
  if (v.accesoAvisos) return `${estado('restricciones', tipo)}<span class="estado-fecha sello-linea">${selloCorto('verificado', v.verificado, v.fuente)} · ${v.accesoAvisos === 1 ? 'aviso oficial' : `${v.accesoAvisos} avisos oficiales`} en la carretera de acceso</span>`;
  if (v.fuenteCaida) return `${estado(v.valor, tipo)}<span class="estado-fecha sello-linea fuente-caida">${selloCorto('verificado', v.verificado, v.fuente)} · <strong>la web oficial no responde</strong>${v.fuenteCaida.desde ? ` desde el ${fechaCorta(v.fuenteCaida.desde.slice(0, 10))}, ${new Date(v.fuenteCaida.desde).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Salta' })} (hora de Argentina)` : ''}: último estado leído</span>`;
  if (v.porAviso) return `${estado('operativo', tipo)}<span class="estado-fecha sello-linea">${selloCorto('verificado', v.verificado, v.fuente)} · <span class="por-aviso">${textoPorAviso(v.porAviso)}</span></span>`;
  if (v.etiqueta && !v.confirmado) return `${estado('pendiente', tipo, v.etiqueta)}<span class="estado-fecha">${v.vigilancia ? `${txtEs(v.vigilancia.organismos)} · ${v.etiqueta === 'Fuente atrasada' ? `no publica desde hace más de lo habitual (publica: ${esc(v.vigilancia.frecuencia || '—')})` : `su web no responde: sin lectura buena en las últimas ${HORAS_SIN_ACTUALIZAR} h`}` : 'Ninguna fuente oficial lo publica cada día'}</span>`;
  if (v.confirmado) return `${estado(v.valor, tipo)}<span class="estado-fecha sello-linea">${selloCorto('verificado', v.verificado, v.fuente)}</span>`;
  if (!v.ultimo) return `${estado('pendiente')}<span class="estado-fecha">Sin datos</span>`;
  const dias = diasDesde(v.publicado);
  const viejo = dias > 30; // un parte operativo de más de un mes ya no sirve para decidir
  const cuando = v.publicado ? `${corto ? fechaCorta(v.publicado) : fecha(v.publicado)} <span class="edad${viejo ? ' edad-vieja' : ''}">(${haceTiempo(v.publicado)})</span>` : 'sin fecha';
  const origen = !corto && v.fuente?.tipo ? `, ${TIPO_FUENTE[v.fuente.tipo]}` : '';
  const dato = v.ultimo === 'pendiente' ? 'sin estado confirmado' : `último dato: ${esc((ESTADOS[v.ultimo] || v.ultimo).toLowerCase())}`;
  return `${estado('pendiente')}<span class="estado-fecha">${dato[0].toUpperCase() + dato.slice(1)}, ${cuando}${origen}</span>`;
}
const estadoPasoHTML = (id, o) => vistaHTML(estadoPaso(id), o);
const HISTORICO_DIAS = 90;
const esHistorico = (iso) => diasDesde(iso) > HISTORICO_DIAS;
const recientes = novedades.filter((n) => !esHistorico(n.publicado));
const nivelReg = (r, tipo) => nivel(r, tipo, HOY);
/** Incidencias activas de un paso o de cualquiera de sus tramos. */
// Misma regla que el planificador: una incidencia con paso solo cuenta para ese paso; sin paso, para sus tramos.
const incidenciasDe = ({ paso, tramos = [] }) => activas.filter((i) => (i.paso ? i.paso === paso : (i.tramos || []).some((t) => tramos.includes(t))));
const tipoIncidencia = (t) => {
  const [txt, ic] = TIPOS_INCIDENCIA[t] || [t, 'restriccion'];
  return `<span class="tipo-inc tipo-${esc(ic)}">${icono(ic)}${esc(txt)}</span>`;
};
const km = (n) => (typeof n === 'number' ? `${n.toLocaleString('es-ES')}\u202fkm` : '');
const wa = (n) => `https://wa.me/${String(n).replace(/\D/g, '')}`;
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const listaY = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

// HU-133: accesos de negocio. Hasta la HU-95 (formulario con hoja privada), preparan un email al contacto del proyecto.
// Buzón por uso (contacto, soporte, legal, info); mientras no haya dominio, el correo general.
const buzon = (tipo) => site.contacto.buzones?.[tipo] || site.contacto.email || '';
const correo = (asunto, cuerpo) => `mailto:${buzon('contacto')}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
// Cotización y camión vacío: página propia con formulario (sin email personal en la web).
// 22/11/2026 (1.6): estadísticas sin cookies ni datos personales (GoatCounter). Solo en la web publicada: ni en local ni en las pruebas.
const estadisticas = site.estadisticas?.goatcounter && process.env.GITHUB_ACTIONS === 'true' ? `\n<script data-goatcounter="${esc(site.estadisticas.goatcounter)}" async src="https://gc.zgo.at/count.js"></script>` : '';
const cotizacion = () => u('/cotizar/');
const cargaRetorno = () => u('/cotizar/?tipo=retorno');

// Horas siempre en la hora del país del paso: «19:00 en Argentina». Sin hora de España (confundía a quien cruza).
// En portugués se añade la de Campo Grande (Brasil) como referencia: «19:00 en Argentina (18:00 em Campo Grande)».
const ZONA_ES = 'Europe/Madrid';
const minutosDesfase = (zona, dia) => {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date(`${dia}T12:00:00Z`)).find((x) => x.type === 'timeZoneName').value;
  if (v === 'GMT') return 0;
  const [, sg, h, m] = v.match(/GMT([+-])(\d\d):(\d\d)/);
  return (sg === '-' ? -1 : 1) * (Number(h) * 60 + Number(m));
};
const ZONA_PAIS = { 'America/Argentina/Salta': 'Argentina', 'America/Argentina/Catamarca': 'Argentina', 'America/Argentina/Cordoba': 'Argentina', 'America/Argentina/Buenos_Aires': 'Argentina', 'America/Argentina/Jujuy': 'Argentina', 'America/Santiago': 'Chile', 'America/Asuncion': 'Paraguay', 'America/Campo_Grande': 'Brasil' };
function enZona(hhmm, zona, dia = HOY, ref = ZONA_ES) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = h * 60 + m - minutosDesfase(zona, dia) + minutosDesfase(ref, dia);
  t = ((t % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
const enEspana = (hhmm, zona, dia = HOY) => enZona(hhmm, zona, dia);
// HU-135: la hora de referencia va marcada; en portugués se cambia por la de Campo Grande (Brasil).
const ZONA_BR = 'America/Campo_Grande';
// Marca vacía en castellano; i18n.mjs la cambia por « (HH:MM em Campo Grande)» en portugués.
const refHTML = (_es, br) => `<span class="h-ref" data-br="${br}"></span>`;
const rangoDosHoras = (a, c, zona) => `${a}–${c} en ${paisDeZona(zona)}`;
const rangoDosHorasHTML = (a, c, zona, dia = HOY) => `${a}–${c} en ${paisDeZona(zona)}${refHTML(`${enEspana(a, zona, dia)}–${enEspana(c, zona, dia)}`, `${enZona(a, zona, dia, ZONA_BR)}–${enZona(c, zona, dia, ZONA_BR)}`)}`;
const paisDeZona = (z) => ZONA_PAIS[z] || (/^America\/Argentina\//.test(z) ? 'Argentina' : 'hora local');
const dosHoras = (hhmm, zona) => `${hhmm} en ${paisDeZona(zona)}`;

// Marca RadarCorredor (src/assets/marca): el logotipo va en línea; el azul marino toma el color del texto (modo oscuro).
const marca = fs
  .readFileSync(path.join(ROOT, 'src', 'assets', 'marca', 'logo-horizontal.svg'), 'utf8')
  .trim()
  .replace(/#10243A/gi, 'currentColor')
  .replace(/ d="[^"]+"/g, (d) => d.replace(/(\d+\.\d)\d+/g, '$1'))
  .replace('<svg ', '<svg class="logo-svg" aria-hidden="true" focusable="false" ')
  .replace(/ width="321" height="64"/, '');

const temaInicial = `<script>try{var t=localStorage.getItem('guia-corredor:tema');if(t==='oscuro'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.dataset.tema='oscuro'}catch(e){}</script>`;

function layout({ titulo, descripcion, ruta, cuerpo, scripts = [], datos = '', estilos = [] }) {
  if (hayMapLibre && cuerpo.includes('id="mapa-vivo"') && !scripts.some((s) => /mapa(-perezoso)?\.js$/.test(s))) {
    scripts = [...scripts, '/assets/mapa-perezoso.js'];
    if (!datos.includes('id="datos-mapa"')) datos += datosMapaScript();
  }
  const t = titulo ? `${titulo} | ${site.nombre}` : site.nombreCompleto;
  const canon = `${site.url.replace(/\/$/, '')}${u(ruta)}`;
  // HU-133 (Versión 2): cuatro secciones. Avisos cuelga de Hoy; calendario y papeles, de Fronteras (y de cada paso).
  const secciones = [
    ['/', 'Estado', 'estado', (r) => r === '/' || r.startsWith('/avisos/') || r.startsWith('/novedades/')],
    ['/planificador/', 'Rutas', 'ruta', (r) => r.startsWith('/planificador/') || r.startsWith('/informe/') || r.startsWith('/mapa/') || r.startsWith('/guia/tramos/')],
    ['/pasos/', 'Fronteras', 'frontera', (r) => r.startsWith('/pasos/') || (r.startsWith('/guia/') && !r.startsWith('/guia/tramos/')) || r.startsWith('/calendario/') || r.startsWith('/papeles/')],
    ['/directorio/', 'Servicios', 'empresas', (r) => r.startsWith('/directorio/') || r.startsWith('/anunciate/') || r.startsWith('/cotizar/')],
  ];
  // Un solo menú: barra lateral en escritorio y tablet, barra inferior en móvil (lo decide el CSS).
  const menu = secciones
    .map(([href, txt, ic, activo]) => `<a href="${u(href)}"${activo(ruta) ? ' aria-current="page"' : ''}>${iconoMenu(ic, activo(ruta))}<span>${txt}</span></a>`)
    .join('');
  const leyenda = ['abierto', 'restricciones', 'cerrado'].map((o) => `<span>${OPERATIVA[o].icono}${OPERATIVA[o].texto}</span>`).join('');
  return `<!DOCTYPE html>
<html lang="${site.idioma}" data-base="${B}" data-vigilancia="${esc(VIGILANCIA_URL)}">
<head>
<meta charset="utf-8">
<meta name="generado" content="${GENERADO_ISO}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(t)}</title>
<meta name="description" content="${esc(descripcion || site.lema)}">
<link rel="canonical" href="${esc(canon)}">${
  tienePT(ruta)
    ? `\n<link rel="alternate" hreflang="es" href="${esc(canon)}">\n<link rel="alternate" hreflang="pt-BR" href="${esc(site.url.replace(/\/$/, '') + u('/pt' + ruta))}">\n<link rel="alternate" hreflang="x-default" href="${esc(canon)}">`
    : ''
}${site.indexable === false ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<meta property="og:title" content="${esc(t)}">
<meta property="og:description" content="${esc(descripcion || site.lema)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1826" media="(prefers-color-scheme: dark)">
${temaInicial}
${hayFuente ? `<link rel="preload" href="${u('/assets/fonts/dm-sans-latin.woff2')}" as="font" type="font/woff2" crossorigin>` : ''}
<link rel="icon" href="${u('/assets/marca/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${u('/assets/styles.css')}">${estilos.map((e) => `\n<link rel="stylesheet" href="${u(e)}">`).join('')}${estadisticas}
</head>
<body>
<a class="saltar" href="#contenido">Ir al contenido</a>
<header class="cabecera">
  <div class="contenedor cabecera-inner">
    <a class="logo" href="${u('/')}" aria-label="${esc(site.nombreCompleto)}, inicio">${marca}</a>
    <a class="buscar-pill" href="${u('/buscar/')}"${ruta === '/buscar/' ? ' aria-current="page"' : ''}>${icono('buscar')}<span>Buscar</span></a>
    <p class="leyenda-estados" aria-label="Leyenda de estados">${leyenda}</p>
    <div class="cabecera-acciones">
      ${tienePT(ruta) ? `<nav class="idiomas" aria-label="Idioma"><a href="${u(ruta)}" data-idioma="es" aria-current="true" data-fijo lang="es" hreflang="es" aria-label="Español">ES</a><a href="${u('/pt' + ruta)}" data-idioma="pt" data-fijo lang="pt-BR" hreflang="pt-BR" aria-label="Português">PT</a></nav>` : ''}
      <a class="btn btn-negocio btn-pequeno" href="${cotizacion()}">${icono('papeles')}Pedir cotización</a>
      <button class="boton-icono" type="button" id="cambiar-tema" aria-label="Activar modo oscuro">${icono('luna', 'icono icono-luna')}${icono('sol', 'icono icono-sol')}</button>
    </div>
  </div>
</header>
<main id="contenido">
${cuerpo}
</main>
<footer class="pie">
  <div class="contenedor pie-inner">
    <nav class="pie-nav" aria-label="Pie">
      <a href="${u('/mapa/')}">Mapa interactivo</a>
      <a href="${u('/anunciate/')}">Anunciar mi empresa</a>
      <a href="${u('/sobre/')}">Cómo trabajamos la información</a>
      <a href="${u('/fuentes/')}">Fuentes que vigilamos</a>
      ${buzon('contacto') ? `<a href="mailto:${esc(buzon('contacto'))}">Escríbenos</a>` : ''}
    </nav>
    <p class="pie-aviso">${esc(site.aviso)}</p>
    ${firmaMadre('pie-marca')}
  </div>
</footer>
<nav class="menu-app" aria-label="Secciones">${menu}<a class="menu-extra" href="${u('/fuentes/')}"${ruta.startsWith('/fuentes/') ? ' aria-current="page"' : ''}>${icono('escudo')}<span>Fuentes</span></a></nav>
${datos}
<script src="${u('/assets/comun.js')}" defer></script>
${scripts.map((s) => `<script src="${u(s)}" defer></script>`).join('\n')}
</body>
</html>
`;
}

const seccion = ({ titulo, contexto, enlace, cuerpo, id = '', clase = '' }) => `
<section class="contenedor seccion ${clase}"${id ? ` id="${id}"` : ''} aria-labelledby="t-${slugify(titulo)}">
  <div class="seccion-cabeza">
    <div><h2 id="t-${slugify(titulo)}">${esc(titulo)}</h2>${contexto ? `<p>${esc(contexto)}</p>` : ''}</div>
    ${enlace ? `<a class="enlace-seccion" href="${u(enlace[0])}">${esc(enlace[1])}</a>` : ''}
  </div>
  ${cuerpo}
</section>`;

/** Corredor como carretera. Horizontal en escritorio, vertical en móvil. */
function rutaHTML() {
  const items = [];
  // HU-115: la carretera dibuja la ruta principal; los ramales (Calama → Mejillones, Iquique) van en una línea aparte.
  const principales = rutas.tramos.filter((t) => !t.ramal);
  const ramales = rutas.tramos.filter((t) => t.ramal);
  rutas.nodos.slice(0, principales.length + 1).forEach((n, i) => {
    const nEmp = empresasEn([n.id]).length;
    items.push(`<li class="parada" data-i="${i}"><span class="via" aria-hidden="true"><span class="punto"></span></span>
      <span class="texto"><strong>${esc(n.nombre)}</strong><span class="parada-pais">${esc(PAISES[n.pais])}</span>${
        nEmp ? `<a class="parada-empresas" href="${u(`/directorio/?punto=${n.id}`)}">${plural(nEmp, 'empresa', 'empresas')}</a>` : ''
      }</span></li>`);
    const t = principales[i];
    if (!t) return;
    const enlace = t.paso?.guia || t.guia;
    const etiqueta = t.paso ? `${rutas.nodos[i].pais}–${rutas.nodos[i + 1].pais}` : km(t.km);
    const contenido = `<span class="tramo-estado">${estado(t.estado, t.paso ? 'paso' : 'tramo')}</span>${
      etiqueta ? `<span class="tramo-etiqueta">${t.paso ? '<span class="frontera">Frontera</span>' : ''}${esc(etiqueta)}</span>` : ''
    }`;
    items.push(`<li class="tramo tramo-${esc(t.estado)} tramo-op-${t.op}${t.paso ? ' tramo-frontera' : ''}" data-i="${i}"><span class="via" aria-hidden="true"></span>
      ${enlace ? `<a class="texto" href="${u(`/guia/${enlace}/`)}">${contenido}</a>` : `<span class="texto">${contenido}</span>`}</li>`);
  });
  const nota = ramales.length
    ? `<p class="ruta-ramales">También: ${ramales.map((t) => `${esc(nodoNombre[t.hasta])}`).join(' e ')}, desde ${esc(nodoNombre[ramales[0].desde])}.</p>`
    : '';
  return `<div class="carretera-marco"><ol class="ruta" id="ruta-corredor" aria-label="Recorrido del corredor de este a oeste">${items.join('')}</ol>${nota}</div>`;
}

// HU-116: puntos agrupados por país, en el orden del corredor (el valor sigue siendo el índice del nodo).
const opcionesNodos = (sel) =>
  [...new Set(rutas.nodos.map((n) => n.pais))]
    .map(
      (pais) =>
        `<optgroup label="${esc(PAISES[pais])}">${rutas.nodos
          .map((n, i) => (n.pais === pais ? `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(n.nombre)}</option>` : ''))
          .join('')}</optgroup>`
    )
    .join('');

const buscador = (clase = '') => `
<form class="buscador ${clase}" action="${u('/planificador/')}" method="get" role="search" aria-label="Buscar ruta">
  <div class="campos">
    <label class="campo campo-desde"><span>Desde</span><select name="desde" id="origen">${opcionesNodos(0)}</select></label>
    <button class="intercambiar" type="button" id="intercambiar" aria-label="Intercambiar origen y destino">${icono('intercambiar')}</button>
    <label class="campo campo-hasta"><span>Hasta</span><select name="hasta" id="destino">${opcionesNodos(rutas.nodos.length - 1)}</select></label>
    <button class="btn btn-principal" type="submit">${icono('buscar')}Buscar ruta</button>
  </div>
</form>`;

const empresaFila = (e) => `
<li class="empresa" data-pais="${esc(e.pais)}" data-categoria="${esc(e.categoria)}" data-puntos="${esc((e.puntos || []).join(' '))}" data-texto="${esc(
  [e.nombre, e.ciudad, catNombre[e.categoria], ...(e.servicios || []), ...(e.puntos || []).map((p) => nodoNombre[p])].join(' ').toLowerCase()
)}">
  <div>
    <div class="empresa-cabeza"><h3>${esc(e.nombre)}</h3>${e.destacada ? '<span class="etiqueta">Destacada</span>' : ''}${
      ''
    }</div>
    <p class="empresa-datos">${esc(catNombre[e.categoria] || e.categoria)} en ${esc(e.ciudad)}, ${esc(PAISES[e.pais] || e.pais)}</p>
    ${e.descripcion ? `<p class="empresa-desc">${txtEs(e.descripcion)}</p>` : ''}
    ${e.puntos?.length ? `<p class="empresa-puntos">Da servicio en ${esc(listaY(e.puntos.map((p) => nodoNombre[p] || p)))}</p>` : ''}
    ${e.servicios?.length ? `<ul class="servicios">${e.servicios.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="empresa-acciones">
    ${e.contacto?.whatsapp ? `<a class="btn btn-wa btn-pequeno" href="${wa(e.contacto.whatsapp)}" rel="nofollow">${icono('chat')}Escribir por WhatsApp</a>` : ''}
    ${e.contacto?.email ? `<a class="btn btn-borde btn-pequeno" href="mailto:${esc(e.contacto.email)}">Enviar email</a>` : ''}
    ${e.contacto?.web ? `<a class="btn btn-borde btn-pequeno" href="${esc(e.contacto.web)}" rel="nofollow noopener">Abrir web</a>` : ''}
    ${!e.contacto?.whatsapp && !e.contacto?.email && !e.contacto?.web ? '<span class="sin-contacto">Sin datos de contacto</span>' : ''}
  </div>
</li>`;

const empresaMini = (e) => `
<li class="mini${e.destacada ? ' mini-destacada' : ''}">
  <span class="mini-texto"><strong>${esc(e.nombre)}</strong><span>${esc(catNombre[e.categoria] || e.categoria)}</span></span>
  ${e.contacto?.whatsapp ? `<a class="btn btn-wa btn-pequeno" href="${wa(e.contacto.whatsapp)}" rel="nofollow" aria-label="Escribir por WhatsApp a ${esc(e.nombre)}">${icono('chat')}</a>` : ''}
</li>`;

const noticia = (n, { principal = false, conLugar = true } = {}) => {
  const lugar = n.guia && guiaPorRuta[n.guia];
  return `
<article class="noticia${principal ? ' noticia-principal' : ''}">
  <p class="noticia-meta"><span class="noticia-medio">${txtEs(n.fuente.nombre)}</span><span>${esc(listaY((n.paises || []).map((p) => PAISES[p] || p)))}</span>${tiempo(n.publicado)}${esHistorico(n.publicado) ? '<span class="etiqueta-suave">Histórico</span>' : ''}</p>
  <h3><a href="${esc(n.fuente.url)}" rel="noopener">${txtEs(n.titulo)}</a></h3>
  ${n.detalle ? `<p>${txtEs(n.detalle)}</p>` : ''}
  ${conLugar && lugar ? `<a class="noticia-lugar" href="${u(lugar.ruta)}">Abrir ${esc(lugar.meta.titulo.replace(/\s*\(.*\)$/, ''))}</a>` : ''}
</article>`;
};

// ---------- páginas ----------
const paginas = [];
const add = (ruta, html) => paginas.push({ ruta, html });

const pasosArr = () => (Array.isArray(D.pasos) ? D.pasos : D.pasos.pasos);
const datosRutas = (extra = {}) =>
  `<script type="application/json" id="datos-rutas">${JSON.stringify({
    nodos: rutas.nodos,
    // HU-116: km calculados con OpenStreetMap por tramo (y por el paso alternativo), para el planificador.
    tramos: rutas.tramos.map((t) => ({ ...t, kmCalc: kmCalc(t, t.paso), alternativa: t.alternativa ? { ...t.alternativa, kmCalc: kmCalc(t, t.alternativa) } : t.alternativa })),
    ladosPaso: Object.fromEntries(pasosArr().map((q) => [q.id, Object.keys(q.lados)])),
    documentosCruce: rutas.documentosCruce,
    avisoDocumentos: rutas.avisoDocumentos,
    tiposCarga: rutas.tiposCarga,
    estados: ESTADOS,
    operativa: OPERATIVA,
    iconos: iconosCliente(['chat', 'enlace', 'imprimir', 'papeles', 'campana', 'derecha', 'guardar', 'abajo']),
    iconoGuardada: ico('guardar', { relleno: true }),
    paises: PAISES,
    banderas: Object.fromEntries(Object.keys(PAISES).map((k) => [k, bandera(k)])),
    base: B,
    cruces: { porPaso: cruces.porPaso, tramos: TRAMOS_TIEMPO, sentidos: SENTIDOS, dias: DIAS },
    // Festivos de los próximos 45 días e incidencias activas por paso, para avisar en el planificador.
    festivos: festivos
      .filter((f) => diasDesde(f.fecha) >= -45)
      .map((f) => ({ pais: f.pais, fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, porConfirmar: f.validacion !== 'verificado' })),
    incidencias: activas.map((i) => ({
      id: i.id,
      paso: i.paso || null,
      tramos: i.tramos || [],
      tipo: TIPOS_INCIDENCIA[i.tipo]?.[0] || i.tipo,
      ubicacion: i.ubicacion,
      texto: i.descripcion,
      fuente: i.fuente.nombre,
      publicado: i.publicado,
      nivel: nivelReg(i, 'incidencia'),
      // HU-130: info no cambia el veredicto; rojo impide el paso (afecta: carga → «No habilitado para carga»).
      gravedad: i.gravedad || 'ambar',
      afecta: i.afecta || 'todo',
    })),
    niveles: Object.fromEntries(Object.entries(NIVELES).map(([k, v]) => [k, v.texto])),
    tiposFuente: TIPO_FUENTE,
    calendario: u('/calendario/'),
    avisos: u('/avisos/'),
    contacto: site.contacto.email || '',
    ...extra,
  }).replace(/</g, '\\u003c')}</script>`;

/** "Cruce 2–4 h" con el sentido más reportado, si hay datos suficientes. */
function cruceCorto(id) {
  const s = Object.values(cruces.porPaso[id] || {}).filter((x) => x.mediana).sort((a, b) => b.n - a.n)[0];
  return s ? `<span class="historia-cruce">Cruce ${nombreTiempo[s.mediana].nombre}</span>` : '';
}

/** Panel lateral de la página de un paso: tiempos reportados y formulario para contar el tuyo. */
function panelCruce(paso) {
  const datos = cruces.porPaso[paso.id] || {};
  const hayDatos = Object.keys(datos).length > 0;
  if (!envioCruce && !hayDatos) return '';
  const fila = (sentido) => {
    const s = datos[sentido];
    let valor;
    if (s?.mediana) {
      const max = Math.max(...Object.values(s.cuenta));
      const barras = TRAMOS_TIEMPO.map(
        (t) => `<li${t.id === s.mediana ? ' class="es-mediana"' : ''}><span class="barra" style="--h:${Math.round((s.cuenta[t.id] / max) * 100)}%"></span><span class="barra-txt">${t.corto}</span></li>`
      ).join('');
      valor = `<dd><strong>${nombreTiempo[s.mediana].nombre}</strong><span>${plural(s.n, 'reporte', 'reportes')}</span></dd>
        <dd class="cruce-barras"><ul aria-hidden="true">${barras}</ul></dd>`;
    } else {
      valor = s
        ? `<dd><strong class="sin-dato">Faltan datos</strong><span>${plural(s.n, 'reporte', 'reportes')} de ${MINIMO} necesarios</span></dd>`
        : `<dd><strong class="sin-dato">Nadie lo ha contado esta semana</strong></dd>`;
    }
    return `<div class="cruce-fila"><dt>${SENTIDOS[sentido]}</dt>${valor}</div>`;
  };
  const opcion = (nombre, valor, texto, req = false) =>
    `<label class="chip chip-radio"><input type="radio" name="${nombre}" value="${esc(valor)}"${req ? ' required' : ''}>${texto}</label>`;
  const formulario = envioCruce
    ? `<button class="btn btn-principal" type="button" data-abrir>Contar mi tiempo</button>
      <form class="cruce-form" data-form hidden>
        <fieldset><legend>Sentido</legend><div class="chips">${Object.entries(SENTIDOS).map(([k, v], i) => opcion('sentido', k, v, i === 0)).join('')}</div></fieldset>
        <fieldset><legend>Cuánto tardaste</legend><div class="chips">${TRAMOS_TIEMPO.map((t, i) => opcion('tiempo', t.id, t.nombre, i === 0)).join('')}</div></fieldset>
        <fieldset><legend>Cuándo cruzaste</legend><div class="chips">${opcion('cuando', '0', 'Hoy', true)}${opcion('cuando', '1', 'Ayer')}</div></fieldset>
        <p class="cruce-error" data-error role="alert" hidden></p>
        <div class="cruce-acciones"><button class="btn btn-principal" type="submit">Enviar mi tiempo</button><button class="btn btn-texto" type="button" data-cancelar>Cancelar</button></div>
      </form>
      <p class="cruce-gracias" data-gracias role="status" hidden></p>`
    : '';
  return `<section class="panel cruce" aria-labelledby="t-cruce" data-cruce="${esc(paso.id)}"${
    envioCruce ? ` data-accion="${esc(envioCruce.accion)}" data-campos="${esc(JSON.stringify(envioCruce.campos))}"` : ''
  }>
    <h2 id="t-cruce">Tiempo de cruce</h2>
    <p>De la fila a la salida de la aduana. Lo que contaron otros en los últimos ${DIAS} días.</p>
    <dl class="cruce-sentidos">${Object.keys(SENTIDOS).map(fila).join('')}</dl>
    ${formulario}
  </section>`;
}

/** Fila de festivo: fecha, país, nombre y si está por confirmar. */
const filaFestivo = (f) => `<li class="fila-fest">
  <time datetime="${esc(f.fecha)}"><span>${esc(diaSemana(f.fecha))}</span>${esc(fechaCorta(f.fecha))}</time>
  ${bandera(f.pais)}
  <span class="fest-nombre">${esc(f.nombre)}${f.tipo !== 'feriado' ? `<span class="etiqueta-suave">${esc(TIPOS_FESTIVO[f.tipo])}</span>` : ''}${f.validacion !== 'verificado' ? '<span class="etiqueta-suave">Por confirmar</span>' : ''}</span>
</li>`;

const enlaceOrganismo = (o) => `<li>${bandera(o.pais)}<a href="${esc(o.url)}" rel="noopener">${txtEs(o.nombre)}</a></li>`;

/** Portada: festivos, obras y meteorología en tres paneles. */
function tablero() {
  const ultimaInc = incidencias.map((i) => i.publicado).filter(Boolean).sort().pop();
  const meteo = avisosMeteo.length
    ? `<ul class="lista-inc">${avisosMeteo
        .slice(0, 3)
        .map((a) => `<li><strong>${esc(a.titulo)}</strong><span>${esc(a.zona)}. Hasta el ${fecha(a.vigenteHasta)}. Fuente: ${fuenteEnlace(a.fuente)}</span></li>`)
        .join('')}</ul>`
    : `<p class="nota-panel">No hay avisos cargados. Consulta los servicios oficiales:</p><ul class="lista-enlaces">${organismos
        .filter((o) => o.tipo === 'meteorologia')
        .map(enlaceOrganismo)
        .join('')}</ul>`;
  return `<div class="tablero">
  <section class="panel tablero-panel" aria-labelledby="t-tab-fest">
    <h3 id="t-tab-fest">Próximos festivos</h3>
    <p>Comprueba la atención de aduanas y organismos en estas fechas.</p>
    <ul class="lista-fest">${festivos.slice(0, 5).map(filaFestivo).join('')}</ul>
    <a class="enlace-mas" href="${u('/calendario/')}">Abrir el calendario</a>
  </section>
  <section class="panel tablero-panel" aria-labelledby="t-tab-obras">
    <h3 id="t-tab-obras">Obras y restricciones</h3>
    <p>${plural(activas.length, 'incidencia activa', 'incidencias activas')}, sin verificar salvo indicación. Última publicada el ${fecha(ultimaInc)}.</p>
    <ul class="lista-inc">${activas
      .slice(0, 3)
      .map((i) => `<li>${tipoIncidencia(i.tipo)}<strong>${esc(i.ubicacion)}</strong><span>${descInc(i.descripcion, i.resumen)}</span></li>`)
      .join('')}</ul>
    <a class="enlace-mas" href="${u('/avisos/#obras')}">Ver obras y restricciones</a>
  </section>
  <section class="panel tablero-panel" aria-labelledby="t-tab-meteo">
    <h3 id="t-tab-meteo">Meteorología y alertas</h3>
    <p>${avisosMeteo.length ? plural(avisosMeteo.length, 'aviso vigente', 'avisos vigentes') : 'Las predicciones las publica cada país.'}</p>
    ${meteo}
    <a class="enlace-mas" href="${u('/avisos/#meteorologia')}">Ver alertas y estado de rutas</a>
  </section>
</div>`;
}

/** Mapa esquemático con posiciones aproximadas (proyección equirectangular). */
/** Esquema del corredor. foco: ids de localidades o pasos a encuadrar; leyenda: solo en la página del mapa. */
function mapaHTML({ foco = null, leyenda = false } = {}) {
  const LON0 = -72.3, LAT0 = -19.3, K = 56.4, COS = 0.924;
  const X = (lon) => +((lon - LON0) * COS * K).toFixed(1);
  const Y = (lat) => +((LAT0 - lat) * K).toFixed(1);
  const n = Object.fromEntries(rutas.nodos.map((x) => [x.id, x]));
  // Un paso sin coordenadas con fuente se dibuja entre las dos localidades de su tramo (posición esquemática).
  const loc = (id) => {
    const u = fichaPaso[id].ubicacion;
    if (u.lat != null) return u;
    const t = rutas.tramos.find((x) => x.paso?.id === id || x.alternativa?.id === id);
    const a = n[t.desde], b = n[t.hasta];
    return id === 'pozo-hondo' ? n['pozo-hondo'] : { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2, esquematica: true };
  };
  const linea = (pts) => pts.map((o) => `${X(o.lon)},${Y(o.lat)}`).join(' ');
  // Cada tramo con su estado: color = semáforo; discontinua = distancia estimada; hueca = sin confirmar.
  const segmento = (t, alt = false) => {
    const via = alt ? t.alternativa : t.paso;
    const pts = [n[t.desde], ...(via ? [loc(via.id)] : []), n[t.hasta]];
    const v = alt ? t.alternativa.vista : t.vista;
    const op = v?.confirmado ? (alt ? t.alternativa.op : t.op) : 'sin-confirmar';
    const cls = `m-tramo m-op-${op}${typeof t.km === 'number' ? '' : ' m-estimado'}${alt ? ' m-alt' : ''}`;
    const titulo = `${nodoNombre[t.desde]} – ${nodoNombre[t.hasta]}${via ? ` por ${via.nombre}` : ''}: ${textoVista(v, op)}${typeof t.km === 'number' ? '' : ', distancia estimada'}`;
    return `<g><title>${esc(titulo)}</title><polyline class="${cls}" points="${linea(pts)}"/>${op === 'sin-confirmar' ? `<polyline class="m-tramo-hueco${alt ? ' m-alt' : ''}${typeof t.km === 'number' ? '' : ' m-estimado'}" points="${linea(pts)}"/>` : ''}</g>`;
  };
  const tramosMapa = [...rutas.tramos.filter((t) => t.alternativa).map((t) => segmento(t, true)), ...rutas.tramos.map((t) => segmento(t))].join('');
  // Puertos de Chile (HU-115: cada uno con su punto y su ramal desde Calama).
  const puertos = [
    ['antofagasta', 10, 18],
    ['mejillones', 10, -8],
    ['iquique', 10, 4],
  ]
    .filter(([id]) => n[id])
    .map(([id, dx, dy]) => ({ id, nombre: n[id].nombre, lat: n[id].lat, lon: n[id].lon, dx, dy }));
  const costa = [[-70.15, -19.3], [-70.15, -20.2], [-70.25, -21], [-70.2, -21.6], [-70.3, -22.3], [-70.5, -23], [-70.6, -23.5], [-70.45, -24], [-70.55, -25.6]];
  const oceano = `${costa.map(([lo, la]) => `${X(lo)},${Y(la)}`).join(' ')} 0,${Y(-25.6)} 0,0`;
  const etiqueta = (x, y, t, sub, a = 'start') =>
    `<text x="${x}" y="${y}" text-anchor="${a}" class="m-txt">${esc(t)}</text>${sub ? `<text x="${x}" y="${y + 15}" text-anchor="${a}" class="m-sub">${esc(sub)}</text>` : ''}`;
  const ciudades = [
    ['campo-grande', 0, 24, 'middle'],
    ['mariscal-estigarribia', 0, 26, 'middle'],
    ['salta-jujuy', 12, 18],
    ['san-pedro-atacama', 10, -14],
    ['calama', 10, -10],
  ]
    .filter(([id]) => n[id])
    .map(([id, dx, dy, a = 'start']) => {
      const o = n[id];
      const x = X(o.lon), y = Y(o.lat);
      return `<a href="${u(`/directorio/?punto=${id}`)}" aria-label="${esc(o.nombre)}: empresas y servicios"><circle class="m-ciudad" cx="${x}" cy="${y}" r="6"/>${etiqueta(x + dx, y + dy, o.nombre, '', a)}</a>`;
    })
    .join('');
  const posPaso = { 'puente-bioceanica': [0, -30, 'middle'], 'pozo-hondo': [0, -30, 'middle'], jama: [14, 0], sico: [-12, 22, 'end'] };
  const pasos = fichaPasos
    .map((p) => {
      const g = loc(p.id);
      const x = X(g.lon), y = Y(g.lat);
      const e = estadoPaso(p.id);
      const [dx, dy, a = 'start'] = posPaso[p.id] || [12, 4];
      const ruta = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id);
      const href = ruta?.guia ? u(`/guia/${ruta.guia}/`) : u('/pasos/');
      const opP = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
      return `<a href="${href}" aria-label="${esc(p.nombre)}: ${esc(OPERATIVA[opP].texto)}. Abrir la ficha"><rect class="m-paso m-${esc(e.valor)} m-pasoop-${opP}${e.porAviso ? ' m-por-aviso' : ''}" x="${x - 7}" y="${y - 7}" width="14" height="14" transform="rotate(45 ${x} ${y})"/>${etiqueta(
        x + dx,
        y + dy,
        p.nombre,
        OPERATIVA[opP].texto,
        a
      )}</a>`;
    })
    .join('');
  const pts = puertos
    .map((q) => {
      const x = X(q.lon), y = Y(q.lat);
      return `<a href="${u(`/directorio/?punto=${q.id}`)}" aria-label="Puerto de ${esc(q.nombre)}: empresas y servicios"><rect class="m-puerto" x="${x - 5}" y="${y - 5}" width="10" height="10"/>${etiqueta(x + q.dx, y + q.dy, q.nombre)}</a>`;
    })
    .join('');
  const paisesM = [
    ['BRASIL', -20.3, -55.4],
    ['PARAGUAY', -20.9, -60.2],
    ['BOLIVIA', -20.1, -64.2],
    ['ARGENTINA', -25.0, -63.0],
    ['CHILE', -21.0, -69.4],
  ];
  // Encuadre (V2): el SVG lleva la posición de cada punto; comun.js (GC.encuadrar) ajusta el viewBox
  // al corredor entero o a los puntos de data-foco, con margen y siempre 2:1. Sin JavaScript se ve entero.
  const punto = (id) => (n[id] ? n[id] : loc(id));
  const puntosXY = Object.fromEntries([...rutas.nodos.map((x) => x.id), ...fichaPasos.map((q) => q.id)].map((id) => [id, [X(punto(id).lon), Y(punto(id).lat)]]));
  const xs = Object.values(puntosXY).map((v) => v[0]), ys = Object.values(puntosXY).map((v) => v[1]);
  const caja = [Math.min(...xs) - 40, Math.min(...ys) - 60, Math.max(...xs) - Math.min(...xs) + 110, 0];
  caja[3] = Math.max((Math.max(...ys) - Math.min(...ys)) + 120, caja[2] / 2);
  caja[2] = Math.max(caja[2], caja[3] * 2);
  return `<figure class="mapa">
  <div class="mapa-marco">
    <svg viewBox="${caja.map((v) => +v.toFixed(1)).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="mapa-titulo mapa-desc" data-puntos="${esc(JSON.stringify(puntosXY))}"${foco?.length ? ` data-foco="${esc(foco.join(' '))}"` : ''}>
      <title id="mapa-titulo">Mapa esquemático del Corredor Bioceánico</title>
      <desc id="mapa-desc">De Campo Grande (Brasil) a los puertos del norte de Chile, por Paraguay y Argentina. Esquema sin límites políticos. Las localidades y los pasos de Jama y Sico se sitúan con coordenadas con fuente; el Puente de la Bioceánica se dibuja entre sus dos localidades.</desc>
      <polygon class="m-oceano" points="${oceano}"/>
      <text class="m-mar" x="${X(-72.1)}" y="${Y(-24.9)}">Océano Pacífico</text>
      ${paisesM.map(([t, la, lo]) => `<text class="m-pais" x="${X(lo)}" y="${Y(la)}" text-anchor="middle">${t}</text>`).join('')}
      ${tramosMapa}
      ${ciudades}${pts}${pasos}
    </svg>
  </div>
${leyenda ? `  <figcaption>
    <ul class="mapa-leyenda">
      <li><span class="ley-color op-abierto" style="background:var(--ok-dot)"></span>Abierto</li>
      <li><span class="ley-color" style="background:var(--obras-dot)"></span>Con restricciones</li>
      <li><span class="ley-color" style="background:var(--corte-dot)"></span>No habilitado</li>
      <li><span class="ley-tramo ley-hueco"></span>Sin confirmar</li>
      <li><span class="ley-tramo"></span>Distancia con fuente</li>
      <li><span class="ley-tramo ley-estimado"></span>Distancia estimada</li>
      <li><span class="ley-paso"></span>Paso fronterizo (línea fina: alternativa por Sico)</li>
      <li><span class="ley-ciudad"></span>Ciudad</li>
      <li><span class="ley-puerto"></span>Puerto</li>
    </ul>
    <p>Esquema sin límites políticos. Las coordenadas tienen fuente; la de Salta / Jujuy es un punto de referencia que agrupa las dos ciudades.</p>
  </figcaption>` : ''}
</figure>`;
}

/** Coordenadas con su fuente y precisión (P0.2). */
const PRECISION = { localidad: 'centro de la localidad', referencia: 'punto de referencia', paso: 'límite internacional', exacta: 'posición exacta' };
function coordenadasHTML(c, nota) {
  if (!c) return nota ? txtEs(nota) : 'Sin coordenadas con fuente.';
  const n = (x) => x.toLocaleString('es-ES', { maximumFractionDigits: 5 });
  return `Coordenadas: ${n(c.lat)}, ${n(c.lon)} (${esc(PRECISION[c.precision] || c.precision)}, ${esc(EVIDENCIAS[c.evidencia].toLowerCase())}). ${fuenteEnlace(typeof c.fuente === 'string' ? D.fuentes.get(c.fuente) : c.fuente)}${c.nota ? `. ${txtEs(c.nota)}` : ''}`;
}

/** Bloque de datos operativos de un paso, cada dato con su fuente. */
// Zonas horarias de cada país del corredor (HU-66).
const ZONAS = { AR: 'America/Argentina/Salta', CL: 'America/Santiago', PY: 'America/Asuncion', BR: 'America/Campo_Grande' };
/** +543884253630 → +54 388 425 3630 (legible; el enlace usa el número completo). */
const telLegible = (t) => {
  // Prefijos de área conocidos (el más largo primero); si no se conoce, se deja el número sin agrupar.
  const AREAS = { '54': ['3873', '387', '388', '11'], '56': ['2'], '595': ['21'], '55': ['67'] };
  const cc = ['595', '54', '56', '55'].find((c) => t.startsWith('+' + c));
  if (!cc) return t;
  const resto = t.slice(cc.length + 1);
  const area = AREAS[cc].find((a) => resto.startsWith(a));
  if (!area) return `+${cc} ${resto}`;
  const local = resto.slice(area.length);
  const corte = local.length - 4;
  return `+${cc} ${area} ${local.slice(0, corte)} ${local.slice(corte)}`;
};
const TIPO_CONTROL = { integrado: 'Control integrado', migraciones: 'Migraciones', aduana: 'Aduana', sanitario: 'Sanitario', seguridad: 'Seguridad', aviso: 'Aviso' };
/** HU-73: instante del parte con el desfase horario del país (hora local; sin hora, mediodía). */
const UMBRAL_PARTES_H = site.partes?.umbralHoras ?? 48;
const desfase = (zona, dia) => {
  const v = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date(`${dia}T12:00:00Z`)).find((x) => x.type === 'timeZoneName').value;
  return v === 'GMT' ? '+00:00' : v.slice(3);
};
const instanteParte = (x) => `${x.publicado}T${x.hora || '12:00'}:00${desfase(ZONAS[x.lado] || 'UTC', x.publicado)}`;
/** HU-113: sello de validación compacto. La fuente, la fecha y la comprobación se abren al tocarlo. */
function selloHTML(n, verificado, fuente, publicado) {
  // HU-133 (R3): un único sello en toda la web: «Organismo · cuándo · ✓ Web oficial».
  const corto = selloCorto(n, verificado, fuente, publicado);
  const largo = n === 'verificado' && verificado && fuente?.tipo !== 'oficial' && !fuente?.leidoAuto ? `Comprobado por el equipo el ${fecha(verificado)} en una fuente que no es oficial: no hay parte oficial que lo confirme.` : n === 'verificado' && verificado ? `${verificadoEn(fuente)} el ${fecha(verificado)}${fuente?.leidoAuto ? ', de forma automática' : ''}.` : n === 'caducado' ? 'Verificación caducada: confírmalo antes de salir.' : 'Publicado por su fuente, sin comprobar todavía.';
  const clase = n === 'verificado' && verificado && fuente?.tipo !== 'oficial' && !fuente?.leidoAuto ? 'secundaria' : n;
  return `<details class="sello sello-${esc(clase)}"><summary><span class="sello-corto">${corto}</span></summary><span class="sello-hoja">${esc(largo)} ${fuenteEnlace(fuente)}${publicado ? `, ${fecha(publicado)}` : ''}${fuente?.tipo ? ` (${TIPO_FUENTE[fuente.tipo]})` : ''}.</span></details>`;
}
/** HU-73 / HU-113: lo que informa cada organismo, una línea por parte, con fecha, hora y sello de fuente. */
function partesHTML(p, op) {
  const partes = p.partes || [];
  if (!partes.length && op === 'cerrado') return '';
  const porLado = Object.keys(p.lados).map((k) => {
    const del = partes.filter((x) => x.lado === k).sort((a, b) => (instanteParte(b) > instanteParte(a) ? 1 : -1));
    const items = del.length
      ? del
          .map(
            (x) => `<li class="parte" data-ts="${instanteParte(x)}"><details class="parte-pl">
          <summary class="parte-linea">${bandera(k)}<span class="parte-quien"><span class="parte-emisor">${esc(x.emisor)}</span>
          <span class="parte-cuando"><time datetime="${instanteParte(x)}">${fecha(x.publicado)}${x.hora ? `, ${x.hora} h` : ''}</time>${x.hora ? '' : ' <span class="texto-suave">(sin hora publicada)</span>'}</span><span class="parte-aviso" hidden></span></span>${x.valor ? estado(x.valor) : ''}${icono('abajo')}</summary>
          <p class="parte-texto">${txtEs(x.texto)}</p>
          ${selloHTML(nivelReg(x, 'estado-operativo'), x.verificado, x.fuente, x.publicado)}
        </details></li>`
          )
          .join('')
      : `<li class="parte parte-vacio"><div class="parte-linea">${bandera(k)}<span class="sin-dato">Sin parte cargado de ${esc(PAISES[k])}.</span></div></li>`;
    return `<div class="partes-lado" data-pais="${k}"><h4 class="sr-only">${esc(PAISES[k])}</h4><ul class="partes-lista">${items}</ul></div>`;
  });
  return `<section class="partes" aria-labelledby="t-partes" data-umbral="${UMBRAL_PARTES_H}">
    <h3 id="t-partes">Qué dice cada país</h3>
    <div class="partes-grid">${porLado.join('')}</div>
  </section>`;
}
/** HU-105: sentido de cruce. «AR-CL» = sale de Argentina y entra en Chile. */
const attrSentido = (x) => (x?.sentido ? ` data-sentido="${esc(x.sentido)}"` : '');
const etiquetaSentido = (x) => {
  if (!x?.sentido) return '';
  const [a, b] = x.sentido.split('-');
  return `<span class="solo-sentido">Solo ${esc(PAISES[a] || a)} → ${esc(PAISES[b] || b)}:</span> `;
};
function sentidoHTML(p) {
  const [a, b] = Object.keys(p.lados);
  return `<div class="sentido" data-sentido-paso="${a}-${b}" data-nombres='${esc(JSON.stringify(Object.fromEntries(Object.keys(p.lados).map((k) => [k, PAISES[k]]))))}'>
    <p class="sentido-texto"><span class="sr-only">Sentido del cruce: </span><span class="sentido-ruta"><span class="sentido-a">${bandera(a)} ${esc(PAISES[a])}</span> → <span class="sentido-b">${bandera(b)} ${esc(PAISES[b])}</span></span></p>
    <button type="button" class="btn btn-borde btn-pequeno btn-sentido" aria-label="Cambiar el sentido del cruce">⇄ Cambiar</button>
    <p class="sentido-nota" aria-live="polite">Sales de ${esc(PAISES[a])} y entras en ${esc(PAISES[b])}. Los controles van en ese orden.</p>
  </div>`;
}
/** HU-97: fiabilidad del paso en los últimos 30 y 90 días. */
const VIGENCIA_FIAB = site.fiabilidad?.vigenciaDias ?? 1;
const fiabPaso = (p, dias) => fiabilidad(p, HOY, dias, VIGENCIA_FIAB);
function frasesFiab(f) {
  const partes = [];
  if (f.cerrado) partes.push(`${f.cerrado} ${f.cerrado === 1 ? 'día' : 'días'} no habilitado`);
  if (f.soloCarga) partes.push(`${f.soloCarga} ${f.soloCarga === 1 ? 'día' : 'días'} sin paso para carga`);
  if (f.restricciones) partes.push(`${f.restricciones} con restricciones`);
  if (f.abierto) partes.push(`${f.abierto} habilitado`);
  if (f.sinDatos) partes.push(`${f.sinDatos} sin datos`);
  return partes.join(' · ');
}
function fiabilidadHTML(p) {
  // Un paso que aún no se ha habilitado no tiene fiabilidad que medir: se dice, para que no parezca un dato que falta.
  if (p.estado?.valor === 'en-obras')
    return `<section class="fiabilidad" aria-labelledby="t-fiab"><h3 id="t-fiab">Últimos 30 días</h3><p class="fiab-resumen">Aún no habilitado: la fiabilidad se medirá desde que abra. Los hitos de la obra están en el Historial.</p></section>`;
  const f30 = fiabPaso(p, 30);
  const f90 = fiabPaso(p, 90);
  if (f90.sinDatos === 90 && !f90.pendientesDeVerificar) return '';
  const cuadros = f30.porDia
    .map((d) => `<li class="fd fd-${d.clase}" title="${fecha(d.dia)}: ${ETIQUETAS_DIA[d.clase]}"><span class="sr-only">${fecha(d.dia)}: ${ETIQUETAS_DIA[d.clase]}</span></li>`)
    .join('');
  const fila = (f) => `<tr><th scope="row">Últimos ${f.dias} días</th><td>${f.cerrado}</td><td>${f.soloCarga}</td><td>${f.restricciones}</td><td>${f.abierto}</td><td>${f.sinDatos}</td></tr>`;
  return `<section class="fiabilidad" aria-labelledby="t-fiab">
    <h3 id="t-fiab">Últimos 30 días</h3>
    <ol class="fiab-tira" aria-label="Estado de cada uno de los últimos 30 días">${cuadros}</ol>
    <p class="fiab-resumen">${frasesFiab(f30) || 'sin datos'}.</p>
    <details class="fiab-mas"><summary>Ver detalle</summary>
    <p class="fiab-leyenda" aria-hidden="true"><span class="fd fd-cerrado"></span> No habilitado <span class="fd fd-carga"></span> Sin paso para carga <span class="fd fd-restricciones"></span> Restricciones <span class="fd fd-abierto"></span> Habilitado <span class="fd fd-sin-datos"></span> Sin datos</p>
    <div class="tabla-scroll"><table class="tabla-fiab">
      <thead><tr><th scope="col">Periodo</th><th scope="col">No habilitado</th><th scope="col">Sin paso para carga</th><th scope="col">Restricciones</th><th scope="col">Habilitado</th><th scope="col">Sin datos</th></tr></thead>
      <tbody>${fila(f30)}${fila(f90)}</tbody>
    </table></div>
    <p class="dato-fuente">Días calculados con los partes verificados (en «Historial»). Un día sin parte hereda el del día anterior${VIGENCIA_FIAB > 1 ? ` (como mucho ${VIGENCIA_FIAB} días)` : ''}; si no, cuenta como «sin datos», nunca como habilitado.${
      f90.pendientesDeVerificar ? ` Hay ${f90.pendientesDeVerificar} ${f90.pendientesDeVerificar === 1 ? 'parte' : 'partes'} de los últimos 90 días pendientes de verificar que todavía no cuentan.` : ''
    }</p>
    </details>
  </section>`;
}
/** HU-66: hora local de cada lado y «abierto ahora». Lo calcula ahora.js en el navegador. */
function ahoraHTML(p, op) {
  const h = (p.horarios || []).find((x) => x.apertura && x.cierre && x.zona);
  const datos = {
    paises: Object.keys(p.lados).map((k) => ({ pais: k, nombre: PAISES[k], zona: ZONAS[k] })),
    horario: h ? { apertura: h.apertura, cierre: h.cierre, zona: h.zona, verificado: h.validacion === 'verificado' && !!h.verificado } : null,
    op,
    soloCarga: p.estado.afecta === 'carga',
  };
  return `<div class="ahora" data-ahora="${esc(JSON.stringify(datos))}">
    <p class="ahora-relojes">${Object.keys(p.lados).map((k) => `<span class="ahora-reloj" data-pais="${k}">${bandera(k)} <span class="ahora-hora">--:--</span></span>`).join('')}<span class="ahora-reloj ahora-reloj-es" hidden><span class="ahora-hora">--:--</span></span></p>
    <p class="ahora-estado" aria-live="polite"></p>
  </div>`;
}
/** HU-65: novedades del paso, de la más reciente a la más antigua. */
function novedadesPaso(p) {
  const ruta = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id)?.guia;
  const items = [];
  const e = estadoPaso(p.id);
  items.push({ fecha: e.confirmado ? e.verificado : p.estado.publicado, op: e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar', valor: e.confirmado ? e.valor : null, texto: `Estado actual: ${p.estado.texto}`, fuente: p.estado.fuente, verificado: e.confirmado ? e.verificado : null, actual: true });
  for (const h of p.historial || []) items.push({ fecha: h.fecha, op: h.valor ? operativaDe(h.valor, 'paso') : null, valor: h.valor, texto: h.texto, fuente: h.fuente, verificado: h.verificado });
  const tramosPaso = rutas.tramos.filter((t) => t.paso?.id === p.id || t.alternativa?.id === p.id).map((t) => t.id);
  for (const i of incidenciasDe({ paso: p.id, tramos: tramosPaso })) if (i.publicado) items.push({ fecha: i.publicado, op: 'restricciones', valor: null, texto: `Aviso: ${i.descripcion}`, fuente: i.fuente, verificado: i.verificado });
  for (const n of novedades.filter((n) => ruta && n.guia === ruta)) items.push({ fecha: n.publicado, op: null, texto: n.titulo, fuente: n.fuente, verificado: null });
  const vistos = new Set();
  const lista = items
    .filter((x) => x.fecha)
    .sort((x, y) => (y.fecha > x.fecha ? 1 : y.fecha < x.fecha ? -1 : Number(!!y.actual) - Number(!!x.actual)))
    .filter((x) => {
      const k = `${x.fecha}|${x.fuente?.url}|${x.texto.slice(0, 40)}`;
      return vistos.has(k) ? false : vistos.add(k);
    });
  if (!lista.length) return null;
  return {
    n: lista.length,
    ultima: lista[0].fecha,
    html: `<ol class="linea-tiempo">${lista
      .map(
        (x) => `<li class="${x.op ? `op-${x.op}` : 'lt-noticia'}${x.actual ? ' lt-actual' : ''}">
        <time datetime="${x.fecha}">${fecha(x.fecha)} <span class="edad">(${haceTiempo(x.fecha)})</span></time>
        <p>${x.op ? `${estado(x.valor || (x.op === 'sin-confirmar' ? 'pendiente' : 'restricciones'))} ` : ''}${txtEs(x.texto)}</p>
        ${selloHTML(x.verificado ? 'verificado' : 'por-verificar', x.verificado, x.fuente, null)}
      </li>`
      )
      .join('')}</ol>`,
  };
}
/** HU-113: sección plegada de la ficha, con resumen de una línea. */
const plegable = (id, titulo, resumen, cuerpo, abierta = false) =>
  `<details class="plegable" id="${id}"${abierta ? ' open' : ''}><summary><span class="plegable-titulo">${titulo}</span><span class="plegable-resumen">${resumen}</span></summary><div class="plegable-cuerpo">${cuerpo}</div></details>`;
// HU-131: «Carreteras para llegar» a un paso: las carreteras de acceso del CSV de fuentes (destino paso:<id>), quién las
// vigila y si hay avisos suyos. Se empareja cada aviso con su carretera por el número de ruta («RN 52», «CH-27», «BR-267»).
const LECTORES_CARRETERA = new Set(['vialidad-ar', 'siemop-cl', 'dnit-alertas', 'mopc-pdf']);
const filasFuentes = cargarFuentesVigilancia().filas;
const numRuta = (s) => [...String(s).matchAll(/\b(?:RN|RP|CH|BR|PY|Ruta)\s*-?\s*0*(\d{1,3})\b/gi)].map((m) => m[1]);
function carreterasParaLlegar(p, inc) {
  const tramosDelPaso = rutas.tramos.filter((x) => x.paso?.id === p.id && !x.alternativa).map((x) => `tramo:${x.id}`);
  const filas = filasFuentes.filter((f) => (f.destino === `paso:${p.id}` || tramosDelPaso.includes(f.destino)) && (LECTORES_CARRETERA.has(f.lector) || /acceso/i.test(f.id)));
  if (!filas.length) return '';
  const items = filas.map((f) => {
    const nums = numRuta(f.carretera_o_paso);
    const suyos = inc.filter((i) => (i.gravedad || 'ambar') !== 'info' && nums.some((n) => numRuta(`${i.ubicacion} ${i.tramo || ''}`).includes(n)));
    const rojo = suyos.find((i) => i.gravedad === 'rojo');
    const [valor, etiqueta] =
      f.estado !== 'activa' ? ['pendiente', f.estado === 'manual' ? 'Revisión manual' : 'Sin vigilancia'] : !suyos.length && fuenteParada(f.fuente_id) ? ['pendiente', fuenteAtrasada(f.fuente_id) ? 'Fuente atrasada' : 'Fuente no disponible'] : rojo ? ['cerrado', rojo.afecta === 'carga' ? 'Cortado para carga' : 'Cortado'] : suyos.length ? ['restricciones', 'Con incidencias'] : ['sin-incidencias', 'Sin incidencias'];
    const org = f.organismo.split(',')[0].trim().replace(/^—$/, '');
    const nombre = nums.length ? f.carretera_o_paso : `${f.tramo} (${f.carretera_o_paso.toLowerCase()})`;
    return `<li><strong>${txtEs(nombre)}</strong> ${estado(valor, 'tramo', etiqueta)}<span class="dato-fuente"${f.estado === 'activa' && f.fuente_id ? ` data-vig-fuentes="${esc(f.fuente_id)}"` : ''}>${org ? txtEs(org) : 'Ninguna fuente oficial la publica cada día'}${f.estado === 'activa' ? ` · <a href="${u('/fuentes/')}">comprobado cada hora</a>${f.frecuencia ? ` · publica: ${esc(frecuenciaCorta(f.frecuencia))}` : ''}` : ''}${suyos.length ? ` · <a href="#avisos-paso">${plural(suyos.length, 'aviso', 'avisos')}</a>` : ''}</span></li>`;
  });
  return `<section class="carreteras-llegar" aria-labelledby="t-carreteras-${esc(p.id)}"><h3 id="t-carreteras-${esc(p.id)}">Carreteras para llegar</h3><ul class="lista-datos">${items.join('')}</ul></section>`;
}
function fichaOperativa(p, guiaPag) {
  const e = estadoPaso(p.id);
  const sello = (x, tipo = 'ficha') => selloHTML(peor(nivelReg(x, tipo), e.nivel === 'borrador' ? 'borrador' : null), x.verificado, x.fuente, x.publicado);
  const item = (x, tipo) => `<li${attrSentido(x)}>${etiquetaSentido(x)}${txtEs(x.texto)}${sello(x, tipo)}</li>`;
  const lista = (xs, tipo) => `<ul class="lista-datos">${xs.map((x) => item(x, tipo)).join('')}</ul>`;
  const orgs = (p.organismos || []).map((id) => organismoPorId[id]).filter(Boolean);
  const inc = incidenciasDe({ paso: p.id, tramos: rutas.tramos.filter((t) => t.paso?.id === p.id || t.alternativa?.id === p.id).map((t) => t.id) });
  // Primera pantalla: la respuesta a «¿puedo cruzar hoy con mi carga?».
  const op = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
  const soloCarga = e.confirmado && (p.estado.afecta === 'carga' || e.avisoLado?.afecta === 'carga') && op !== 'abierto';
  const detalleEstado = soloCarga ? ' para carga · turismo con atención normal' : e.confirmado && ESTADOS[e.valor] && ESTADOS[e.valor] !== OPERATIVA[op].texto && e.valor !== 'operativo' ? ` · ${ESTADOS[e.valor]}` : '';
  const frases = (p.estado.texto || '').match(/[^.]+(\.|$)/g)?.map((x) => x.trim()).filter(Boolean) || [];
  const resto = frases.slice(1).join(' ');
  const prevision = inc.find((i) => i.finPrevista)?.finPrevista;
  const respuesta = `<div class="respuesta op-${op}" data-estado="${esc(e.confirmado ? e.valor : 'pendiente')}" role="status" aria-live="polite">
    ${OPERATIVA[op].icono}
    <div>
      <p class="respuesta-titulo">${esc(OPERATIVA[op].texto + detalleEstado)}</p>
      ${ahoraHTML(p, op)}
      ${
        e.confirmado
          ? notaIntegridad(e)
            ? `<p class="respuesta-nota respuesta-integridad">${esc(notaIntegridad(e))}</p>`
            : resto
            ? `<p class="respuesta-nota">${txtOf(resto)}</p>`
            : ''
          : `<p class="respuesta-nota">${
              e.sinLados
                ? 'No todos los lados confirman hoy. Compruébalo antes de salir.'
                : e.ultimo && e.ultimo !== 'pendiente'
                ? `Último dato publicado: ${esc((ESTADOS[e.ultimo] || e.ultimo).toLowerCase())}, ${esc(haceTiempo(p.estado.publicado))}. Confírmalo antes de salir.`
                : 'No hay un estado confirmado. Consulta el parte oficial antes de salir.'
            }</p>`
      }
      ${ladosHTML(p, e)}
      ${prevision ? `<p class="respuesta-nota">Previsión: ${txtOf(prevision)}</p>` : ''}
      ${selloHTML(e.nivel, e.verificado, p.estado.fuente, p.estado.publicado)}
    </div>
  </div>`;
  // Acciones: llamar al primer teléfono oficial, compartir por WhatsApp, planificar.
  const tel = (p.contactos || []).find((c) => c.telefono);
  const hor = (p.horarios || []).find((x) => x.apertura && x.cierre);
  const textoWa = `${p.nombre}: ${OPERATIVA[op].texto + detalleEstado}${e.confirmado ? ` (${verificadoEn(p.estado.fuente).toLowerCase()} el ${fechaCorta(e.verificado)})` : ' (sin confirmar)'}.${hor ? ` Horario ${hor.zona ? rangoDosHoras(hor.apertura, hor.cierre, hor.zona) : `${hor.apertura}–${hor.cierre}, hora local`}.` : ''} ${site.url.replace(/\/$/, '')}${u('/guia/' + guiaPag + '/')}`;
  const acciones = `<div class="ficha-acciones no-imprimir">
    ${tel ? `<a class="btn btn-borde btn-llamar" href="tel:${esc(tel.telefono)}">${icono('telefono')}Llamar</a>` : ''}
    <a class="btn btn-borde" href="https://wa.me/?text=${encodeURIComponent(textoWa)}" rel="noopener">${icono('chat')}Compartir</a>
    <a class="btn btn-principal" href="${u('/planificador/')}">${icono('ruta')}Planificar</a>
  </div>`;
  // Lo demás, plegado con resumen de una línea.
  const controles = [...(p.controles || [])].sort((x, y) => x.orden - y.orden);
  const secControles = plegable(
    'controles',
    'Controles para carga',
    controles.length ? `${plural(controles.length, 'paso', 'pasos')}${controles.some((c) => c.tipo === 'integrado') ? ' en un solo complejo' : ''}` : 'Sin controles publicados',
    controles.length
      ? `<ol class="controles">${controles
          .map(
            (c) => `<li data-lado="${esc(c.lado || '')}" data-orden="${c.orden}"${attrSentido(c)}><span class="control-tipo">${esc(TIPO_CONTROL[c.tipo] || c.tipo)}</span> ${c.lado ? conBanderas(c.lado) : ''} ${txtEs(c.texto)}${
              c.organismo && organismoPorId[c.organismo] ? ` <a href="${esc(organismoPorId[c.organismo].url)}" rel="noopener">${txtEs(organismoPorId[c.organismo].nombre)}</a>` : ''
            }${sello(c)}</li>`
          )
          .join('')}</ol>`
      : '<p class="sin-dato">Sin controles publicados: el paso no está habilitado o no hay fuente.</p>'
  );
  const secHorarios = plegable(
    'horarios',
    'Horarios',
    hor ? (hor.zona ? rangoDosHorasHTML(hor.apertura, hor.cierre, hor.zona) : `${hor.apertura}–${hor.cierre}, hora local`) : p.horarios?.length ? 'Sin hora de apertura y cierre confirmada' : 'Sin horario con fuente',
    p.horarios?.length ? `<ul class="lista-datos">${p.horarios.map((h) => `<li${attrSentido(h)}><strong>${conBanderas(h.lado)}:</strong> ${etiquetaSentido(h)}${txtEs(h.texto)}${sello(h, 'horario')}</li>`).join('')}</ul>` : '<p class="sin-dato">Sin horario con fuente.</p>'
  );
  const tels = (p.contactos || []).filter((c) => c.telefono || c.email);
  const secTel = plegable(
    'telefonos',
    'Teléfonos',
    tels.length ? `${plural(tels.length, 'contacto oficial', 'contactos oficiales')}` : 'Sin teléfono con fuente',
    p.contactos?.length
      ? `<ul class="contactos">${p.contactos
          .map(
            (c) => `<li>${c.lado ? conBanderas(c.lado) + ' ' : ''}<strong>${txtEs(c.nombre || c.texto)}</strong>${c.nombre && c.texto ? `<span class="dato-fuente">${txtEs(c.texto)}</span>` : ''}
            <span class="contacto-acciones">${c.telefono ? `<a class="btn btn-borde btn-pequeno" href="tel:${esc(c.telefono)}">${icono('telefono')}${esc(telLegible(c.telefono))}</a>` : ''}${c.email ? `<a class="btn btn-borde btn-pequeno" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</span>
            ${sello(c)}</li>`
          )
          .join('')}</ul>`
      : `<p class="sin-dato">Sin teléfono con fuente. ${orgs.length ? 'Consulta la web oficial de cada organismo (en «Sobre el paso»).' : ''}</p>`
  );
  const nAvisos = inc.length + (p.restricciones?.length || 0);
  const secAvisos = plegable(
    'avisos-paso',
    'Obras y avisos',
    nAvisos ? `${plural(inc.length, 'aviso activo', 'avisos activos')}${p.restricciones?.length ? ` · ${plural(p.restricciones.length, 'norma', 'normas')} para camiones` : ''}` : 'Ninguno registrado',
    `${inc.length ? `<ul class="lista-datos">${inc.map((i) => `<li>${tipoIncidencia(i.tipo)} ${descInc(i.descripcion, i.resumen)} <a href="${u('/avisos/#inc-' + i.id)}">Ver aviso</a>${selloHTML(nivelReg(i, 'incidencia'), i.verificado, i.fuente, i.publicado)}</li>`).join('')}</ul>` : '<p class="sin-dato">Ninguna incidencia registrada.</p>'}
     ${p.restricciones?.length ? `<h4>Transporte pesado</h4>${lista(p.restricciones)}` : ''}`
  );
  const nov = novedadesPaso(p);
  const secHist = nov ? plegable('historial', 'Historial', `${plural(nov.n, 'entrada', 'entradas')} · la última, ${haceTiempo(nov.ultima)}`, nov.html) : '';
  const fila = (titulo, contenido) => `<div class="dato-fila"><dt>${titulo}</dt><dd>${contenido}</dd></div>`;
  const secSobre = plegable(
    'sobre-paso',
    'Sobre el paso',
    [p.ubicacion?.texto?.match(/\d[\d.]*\s?m de altitud/)?.[0], orgs.length ? plural(orgs.length, 'organismo', 'organismos') : null, 'acceso y servicios'].filter(Boolean).join(' · '),
    `<dl class="datos">
      ${fila('Países', Object.entries(p.lados).map(([k, v]) => `${bandera(k)} ${esc(PAISES[k])}: ${esc(v)}`).join('<br>'))}
      ${fila('Ubicación', `${txtEs(p.ubicacion.texto)}<span class="dato-fuente">${coordenadasHTML(p.ubicacion.coordenadas, p.ubicacion.coordenadasNota)}</span>`)}
      ${fila('Operaciones habilitadas', p.operaciones ? `${txtEs(p.operaciones.texto)}${sello(p.operaciones)}` : '<span class="sin-dato">Sin datos. Consulta con tu despachante.</span>')}
      ${fila('Acceso', p.acceso?.length ? lista(p.acceso) : '<span class="sin-dato">Sin datos</span>')}
      ${fila('Servicios en el paso', p.servicios?.length ? lista(p.servicios) : '<span class="sin-dato">Sin datos</span>')}
      ${fila('Organismos', orgs.length ? `<ul class="lista-enlaces">${orgs.map(enlaceOrganismo).join('')}</ul>` : '<span class="sin-dato">Sin datos</span>')}
      ${fila('Estado en detalle', `${txtEs(p.estado.texto)}${otras(p.estado) ? `<span class="dato-fuente">${otras(p.estado).replace(/^ · /, '')}</span>` : ''}`)}
      ${fila('Revisión', `Ficha revisada el ${fecha(p.revisado)}`)}
    </dl>
    <button class="btn btn-borde btn-pequeno no-imprimir" type="button" onclick="document.querySelectorAll('.ficha-operativa details').forEach((d) => (d.open = true)); window.print()">${icono('imprimir')}Imprimir ficha completa</button>`
  );
  // HU-133 (R7): tres pestañas. El sentido del cruce vale para las tres.
  const pest = (id, txt, on) => `<button type="button" role="tab" id="tab-${id}" aria-controls="${id}" aria-selected="${on}" tabindex="${on ? 0 : -1}">${txt}</button>`;
  return `<section class="ficha-operativa" aria-labelledby="t-ficha">
  <h2 id="t-ficha" class="sr-only">Situación operativa</h2>
  ${sentidoHTML(p)}
  <div class="pestanas" role="tablist" aria-label="Ficha del paso">${pest('hoy', 'Hoy', true)}${pest('papeles', 'Papeles', false)}${pest('calendario', 'Calendario', false)}</div>
  <div class="pestana" role="tabpanel" id="hoy" aria-labelledby="tab-hoy">
  ${respuesta}
  ${partesHTML(p, op)}
  ${carreterasParaLlegar(p, inc)}
  ${fiabilidadHTML(p)}
  ${acciones}
  <div class="plegables">
    ${secControles}${secHorarios}${secTel}${secAvisos}${secHist}${secSobre}
  </div>
  </div>
  <div class="pestana" role="tabpanel" id="papeles" aria-labelledby="tab-papeles" hidden>${papelesPaso(p)}</div>
  <div class="pestana" role="tabpanel" id="calendario" aria-labelledby="tab-calendario" hidden>${calendarioPaso(p)}</div>
</section>`;
}

/** HU-133 (R7): pestaña «Papeles» del paso. Lista de comprobación según la carga, marcable y guardada en el dispositivo. */
function papelesPaso(p, { porPais = true } = {}) {
  const chips = rutas.tiposCarga
    .map((c, i) => `<label class="chip chip-radio"><input type="radio" name="carga-paso" value="${esc(c.id)}"${i === 0 ? ' checked' : ''}>${esc(c.nombre)}</label>`)
    .join('');
  const docs = rutas.documentosCruce
    .map((d) => `<li data-cargas="${esc((d.cargas || []).join(' '))}"><label class="papel"><input type="checkbox" data-doc="${esc(d.id)}"><span class="papel-caja" aria-hidden="true"></span><span>${esc(d.nombre)}</span></label></li>`)
    .join('');
  return `<div class="papeles-paso" data-papeles>
    <fieldset class="pl-carga"><legend>¿Qué llevas?</legend><div class="chips">${chips}</div></fieldset>
    <p class="papeles-cuenta"><strong data-total></strong> <span data-listos></span></p>
    <ul class="papeles-lista">${docs}</ul>
    <p class="dato-fuente">${esc(rutas.avisoDocumentos)} Lo que marcas se guarda solo en este dispositivo.</p>
    ${porPais ? `<p class="papeles-mas">Tránsito aduanero y controles sanitarios de ${esc(listaY(Object.keys(p.lados).map((k) => PAISES[k])))}: <a href="${u('/papeles/')}">ver papeles por país</a>.</p>` : ''}
    <div class="barra-accion"><a class="btn btn-borde btn-grande" href="${u('/directorio/?categoria=despachante')}">Buscar despachante</a><button class="btn btn-borde btn-grande" type="button" onclick="window.print()">Imprimir lista</button></div>
  </div>`;
}
/** HU-133 (R7): pestaña «Calendario» del paso. ¿Cuándo cruzas? y festivos de los dos países. No inventa horarios especiales. */
function calendarioPaso(p, { proximos: conProximos = true } = {}) {
  const ps = Object.keys(p.lados);
  const fest = festivos.filter((f) => ps.includes(f.pais));
  const datos = {
    paises: Object.fromEntries(ps.map((k) => [k, PAISES[k]])),
    banderas: Object.fromEntries(ps.map((k) => [k, bandera(k)])),
    festivos: fest.map((f) => ({ fecha: f.fecha, pais: f.pais, nombre: f.nombre, tipo: TIPOS_FESTIVO[f.tipo] || f.tipo, porConfirmar: f.validacion !== 'verificado' })),
    especiales: (p.horariosEspeciales || []).map((h) => ({ desde: h.desde, hasta: h.hasta, texto: h.texto })),
    hoy: HOY,
  };
  const proximos = fest.slice(0, 6);
  return `<div class="calendario-paso" data-cal-paso="${esc(JSON.stringify(datos))}">
    <fieldset class="cal-cuando"><legend>¿Cuándo cruzas?</legend>
      <div class="chips"><label class="chip chip-radio"><input type="radio" name="cuando" value="0" checked>Hoy</label><label class="chip chip-radio"><input type="radio" name="cuando" value="1">Mañana</label>
      <label class="campo-fecha"><span class="sr-only">Otra fecha</span><input type="date" name="fecha" min="${HOY}" value="${HOY}"></label></div>
    </fieldset>
    <div class="cal-respuesta" aria-live="polite"></div>
    ${conProximos ? `<h3>Próximos festivos en ${esc(listaY(ps.map((k) => PAISES[k])))}</h3>
    ${proximos.length ? `<ul class="lista-fest">${proximos.map(filaFestivo).join('')}</ul>` : '<p class="sin-dato">Ninguno cargado.</p>'}
    <p class="dato-fuente">Un festivo no implica que la aduana cierre. Si nadie ha publicado horario especial, lo decimos tal cual. <a href="${u('/calendario/')}">Calendario completo</a></p>` : ''}
  </div>`;
}

/** Aviso de ficha según su nivel de validación (mismo sistema que los estados). */
function avisoValidacion(n, verificado) {
  const t = {
    borrador: '<strong>Texto de la guía en revisión.</strong> La situación operativa de arriba indica en cada dato si está verificado o solo publicado por su fuente, con la fecha.',
    'por-verificar': '<strong>Texto de la guía sin revisar.</strong> La situación operativa de arriba indica en cada dato si está verificado o solo publicado por su fuente, con la fecha.',
    caducado: `<strong>Verificación caducada.</strong> Se comprobó el ${fecha(verificado)}. Confírmalo antes de viajar.`,
  }[n];
  return t ? `<p class="aviso aviso-${esc(n)}"><span>${t}</span></p>` : '';
}

/** Tramos de una ficha de tramo (V2): una línea por tramo con su señal; fuente, distancia y avisos al abrirla. */
function bloqueTramos(ruta) {
  const ts = rutas.tramos.filter((t) => t.guia === ruta && !t.paso);
  if (!ts.length) return '';
  const linea = (t) => {
    const inc = incidenciasDe({ tramos: [t.id] });
    const op = t.op || 'sin-confirmar';
    const kmTxt = t.km ? GCkm(t.km) : t.estimacion ? `≈ ${GCkm(t.estimacion.km)} estimados` : 'sin distancia';
    const kmDet = t.km
      ? `${GCkm(t.km)}${t.kmTipo === 'calculado' ? ' · calculado con OpenStreetMap' : t.kmFuente ? ` · según ${fuenteEnlace(t.kmFuente)}` : ''}`
      : t.estimacion ? `≈ ${GCkm(t.estimacion.km)} en línea recta (${esc(t.estimacion.aviso)})` : 'Sin dato';
    return `<li class="inc-tarjeta"><details class="inc-linea"><summary>${OPERATIVA[op].icono}<span class="inc-que"><strong>${esc(nombreTramo(t))}</strong><small>${esc(t.vista.etiqueta || OPERATIVA[op].texto)} · ${kmTxt}${inc.length ? ` · ${plural(inc.length, 'aviso', 'avisos')}` : ''}</small></span>${icono('abajo')}</summary>
      <div class="inc-detalle"><div class="dato-estado">${vistaHTML(t.vista)}</div>${t.vista.fuente && !t.vista.vigilado ? `<p class="dato-fuente">${fuenteEnlace(t.vista.fuente)}</p>` : ''}
      <p><strong>Distancia:</strong> ${kmDet}</p>
      ${inc.map((i) => `<p class="it-aviso">${tipoIncidencia(i.tipo)} ${descInc(i.descripcion, i.resumen)} <a href="${u('/avisos/#inc-' + i.id)}">Ver aviso</a></p>`).join('')}</div></details></li>`;
  };
  return `<section class="ficha-operativa tramos-v2" aria-labelledby="t-tramos"><h2 id="t-tramos">Tramos</h2><ul class="inc-lista">${ts.map(linea).join('')}</ul></section>`;
}
const GCkm = (n) => `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' })}\u202Fkm`;

// Pasos fronterizos para las historias
const pasosHistoria = [];
rutas.tramos.forEach((t) => {
  const a = rutas.nodos.find((n) => n.id === t.desde);
  const b = rutas.nodos.find((n) => n.id === t.hasta);
  if (t.paso) pasosHistoria.push({ id: t.paso.id, nombre: t.paso.nombre.replace(/\s*\(.*\)$/, '').replace(/^Paso (de )?/, '').replace('Puente de la ', 'Puente '), guia: t.paso.guia, estado: t.estado, op: t.op, cara: [a.pais, b.pais] });
  if (t.alternativa) pasosHistoria.push({ id: t.alternativa.id, nombre: t.alternativa.nombre.replace(/\s*\(.*\)$/, '').replace(/^Paso (de )?/, ''), guia: t.alternativa.guia, estado: t.alternativa.estado || t.estado, op: t.alternativa.op || t.op, cara: [a.pais, b.pais] });
});
/** Estado de un paso en señal + palabra, sin fuente (el tablero no la repite: está en la ficha). */
const estadoCorto = (id) => {
  const e = estadoPaso(id);
  const op = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
  const nota = e.sinLados ? `Falta ${listaY(e.sinLados.map((k) => PAISES[k]))}` : e.avisoLado ? `Aviso de ${PAISES[e.avisoLado.lado]}` : e.accesoAvisos ? 'Aviso en el acceso' : e.fuenteCaida ? 'Fuente no responde' : e.porAviso ? textoPorAviso(e.porAviso) : '';
  return `<span class="estado op-${op}${e.porAviso ? ' estado-por-aviso' : ''}">${OPERATIVA[op].icono}<span class="estado-texto">${OPERATIVA[op].texto}</span></span>${nota ? `<small class="estado-parcial">${esc(nota)}</small>` : ''}`;
};
/** Horario habitual de un paso en hora local («09:00–19:15»), o «—». */
const horarioCorto = (id) => {
  const h = fichaPaso[id]?.horarios?.find((x) => x.apertura && x.cierre);
  return h ? `${h.apertura}–${h.cierre}` : '—';
};
/** 22/11/2026: el horario va aparte del estado operativo. comun.js añade «abre en…/cierra en…» con la hora del paso. */
const horarioDatos = (id) => {
  const h = fichaPaso[id]?.horarios?.find((x) => x.apertura && x.cierre);
  return h?.zona ? ` data-apertura="${esc(h.apertura)}" data-cierre="${esc(h.cierre)}" data-zona="${esc(h.zona)}"` : '';
};
/** Tablero de pasos (V2): una fila por paso, en el orden del corredor. Lo usan la portada y Fronteras. */
const tableroPasos = ({ sel = null } = {}) => `<div class="tablero-pasos" role="table" aria-label="Pasos del corredor, de Brasil a Chile">
  <div class="tablero-fila tablero-cab" role="row"><span role="columnheader">Pasos</span><span role="columnheader">Hoy</span><span role="columnheader">Horario local</span></div>
  ${pasosHistoria
    .map(
      (h) => `<a role="row" data-paso="${esc(h.id)}" class="tablero-fila${h.id === sel ? ' sel' : ''}" href="${u(h.guia ? `/guia/${h.guia}/` : '/pasos/')}"${h.id === sel ? ' aria-current="true"' : ''}>
    <span role="cell" class="tablero-paso"><strong>${esc(h.nombre)}</strong><small>${h.cara.map((c) => `<span class="tablero-pais">${bandera(c)}<span>${PAISES[c]}</span></span>`).join(' → ')}</small></span>
    <span role="cell">${estadoCorto(h.id)}</span><span role="cell" class="tablero-hora"${horarioDatos(h.id)}>${horarioCorto(h.id)}</span></a>`
    )
    .join('')}
</div>`;
const historia = (h) => {
  const contenido = `<span class="historia-anillo"><span class="historia-cara" role="img" aria-label="${esc(h.cara.map((c) => PAISES[c]).join(' – '))}">${h.cara.map((c) => bandera(c).replace(/ role="img" aria-label="[^"]*"/, '')).join('')}</span></span><span class="historia-nombre">${esc(h.nombre)}</span>${estadoPasoHTML(h.id, { corto: true })}${cruceCorto(h.id)}`;
  return `<li>${h.guia ? `<a class="historia historia-${esc(h.estado)} historia-op-${h.op}" href="${u(`/guia/${h.guia}/`)}">${contenido}</a>` : `<div class="historia historia-${esc(h.estado)} historia-op-${h.op}">${contenido}</div>`}</li>`;
};

// HU-115: datos del mapa interactivo (MapLibre + OpenFreeMap), sacados de los mismos datos que el resto de la web.
// Las capas salen de rutas.json, pasos.json y data/trazados.json (trazados calculados con OpenStreetMap).
function datosMapa() {
  const n = Object.fromEntries(rutas.nodos.map((x) => [x.id, x]));
  const posPaso = (id) => {
    const c = fichaPaso[id]?.ubicacion?.coordenadas;
    if (c?.lat != null) return { lon: c.lon, lat: c.lat, esquematica: false };
    const t = rutas.tramos.find((x) => x.paso?.id === id || x.alternativa?.id === id);
    if (id === 'pozo-hondo' && n['pozo-hondo']) return { lon: n['pozo-hondo'].lon, lat: n['pozo-hondo'].lat, esquematica: true };
    const a = n[t.desde], b = n[t.hasta];
    return { lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2, esquematica: true };
  };
  // Trazados calculados con OpenStreetMap (scripts/trazados.mjs), si los hay. Si no, línea recta entre puntos.
  const trazados = TRAZADOS;
  const lineas = [];
  for (const t of rutas.tramos) {
    for (const alt of [false, true]) {
      const via = alt ? t.alternativa : t.paso;
      if (alt && !via) continue;
      const v = alt ? t.alternativa.vista : t.vista;
      const op = v?.confirmado ? (alt ? t.alternativa.op : t.op) : 'sin-confirmar';
      const clave = `${t.id}${via ? `@${via.id}` : ''}`;
      const calc = trazados?.tramos?.[clave];
      const pts = calc?.geometria || [n[t.desde], ...(via ? [posPaso(via.id)] : []), n[t.hasta]].map((o) => [o.lon, o.lat]);
      lineas.push({
        id: clave,
        nombre: `${nodoNombre[t.desde]} – ${nodoNombre[t.hasta]}${via ? ` por ${via.nombre}` : ''}`,
        op,
        estado: textoVista(v, op),
        km: typeof t.km === 'number' ? t.km : null,
        kmCalculado: calc?.km ?? null,
        trazado: calc ? 'calculado' : 'recta',
        alt,
        url: via?.guia ? u(`/guia/${via.guia}/`) : t.guia ? u(`/guia/${t.guia}/`) : null,
        coords: pts,
      });
    }
  }
  const puntos = [
    ...rutas.nodos.map((x) => ({ id: x.id, nombre: x.nombre, pais: PAISES[x.pais], tipo: ['antofagasta', 'mejillones', 'iquique'].includes(x.id) ? 'puerto' : 'ciudad', lon: x.lon, lat: x.lat, url: u(`/directorio/?punto=${x.id}`) })),
    ...fichaPasos.map((p) => {
      const e = estadoPaso(p.id);
      const op = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
      const g = posPaso(p.id);
      const r = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id);
      return { id: p.id, nombre: p.nombre, tipo: 'paso', op, estado: OPERATIVA[op].texto + (e.confirmado ? ` · verificado el ${fechaCorta(e.verificado)}` : ' · sin confirmar'), lon: g.lon, lat: g.lat, esquematica: g.esquematica, url: r?.guia ? u(`/guia/${r.guia}/`) : null };
    }),
  ];
  const datosMapa = { puntos, lineas, colores: { abierto: '#1f9d55', restricciones: '#e07a10', cerrado: '#d64545', 'sin-confirmar': '#8a939b' } };
  return datosMapa;
}
/** Tarjeta de mapa (V2): igual en todas las páginas; el pie enlaza al mapa interactivo. */
const mapaTarjeta = (o = {}) => `<section class="tarjeta mapa-tarjeta${o.clase ? ` ${o.clase}` : ''}" aria-label="Mapa del corredor">${hayMapLibre ? mapaVivoHTML(o) : mapaHTML(o)}<p class="nota-pie">Estado de hoy · © OpenStreetMap. <a href="${u(`/mapa/${o.foco?.length ? `?foco=${o.foco.join(',')}` : ''}`)}">Ver en grande</a></p></section>`;
/** Marco del mapa: el mapa vivo (oculto hasta que carga) y el esquema SVG de respaldo. */
const mapaVivoHTML = (o = {}) => `<div class="mapa-vivo-marco" data-estado="esquema"${o.foco?.length ? ` data-foco="${esc(o.foco.join(' '))}"` : ''}>
    <div id="mapa-vivo" class="mapa-vivo" role="region" aria-label="Mapa interactivo del corredor. La misma información está en la tabla de tramos de la página del mapa."></div>
    <div class="mapa-respaldo">${mapaHTML(o)}</div>
  </div>`;
const datosMapaScript = () => `<script type="application/json" id="datos-mapa">${JSON.stringify(datosMapa()).replace(/</g, '\\u003c')}</script>`;

// Inicio · HU-133 (R5): «Hoy». Tu ruta con su veredicto, tus pasos, lo que impide o limita el paso y el mapa.
const GENERADO = new Date(GENERADO_ISO);
const horaEn = (zona, d = GENERADO) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(d);
const graveOrden = { rojo: 0, ambar: 1 };
const avisoHoy = (i) => {
  const forma = (i.gravedad || 'ambar') === 'rojo' ? 'cerrado' : 'restricciones';
  return `<li><a class="linea-aviso" href="${u(`/avisos/#inc-${i.id}`)}">${OPERATIVA[forma].icono}<span><strong>${esc(i.ubicacion)}</strong><small>${txtOf(i.resumen || primeraFrase(i.descripcion))}</small></span></a></li>`;
};
{
  const limitan = activas.filter((i) => (i.gravedad || 'ambar') !== 'info').sort((x, y) => graveOrden[x.gravedad || 'ambar'] - graveOrden[y.gravedad || 'ambar']);
  // HU-131: el resto del corredor en una línea: cuántos tramos de carretera están sin incidencias según su fuente oficial.
  const resumenTramosHoy = () => {
    const carr = rutas.tramos.filter((x) => !x.paso);
    const sin = carr.filter((x) => x.vista.valor === 'sin-incidencias').length;
    const sinVig = carr.filter((x) => ['Sin vigilancia', 'Fuente atrasada', 'Fuente no disponible'].includes(x.vista.etiqueta)).length;
    return `<p class="hoy-info hoy-resto">${OPERATIVA.abierto.icono} El resto: ${sin} de ${plural(carr.length, 'tramo de carretera', 'tramos de carretera')} sin incidencias según su fuente oficial${sinVig ? `; ${sinVig} sin vigilancia al día` : ''}. <a href="${u('/fuentes/')}">Qué vigilamos</a></p>`;
  };
  add(
    '/',
    layout({
      ruta: '/',
      scripts: ['/assets/inicio.js'],
      datos: datosRutas(),
      cuerpo: `
<div class="contenedor hoy">
  <header class="hoy-cabeza">
    <div class="hoy-titulo">
      <h1>Estado del corredor</h1>
      <p class="hoy-lema">Cada paso y carretera del Corredor Bioceánico, según su fuente oficial.</p>
    </div>
    <p class="hoy-hora" data-generado="${GENERADO.toISOString()}">Datos de las ${horaEn(ZONAS.AR)} en Argentina${refHTML(horaEn(ZONA_ES), horaEn(ZONA_BR))}</p>
  </header>
  <div class="hoy-grid">
    <div class="hoy-col tarjeta">
      <section class="veredicto" id="tu-ruta" aria-live="polite" hidden></section>
      <section class="hoy-buscar" id="sin-ruta" aria-labelledby="t-buscar">
        <h2 id="t-buscar">¿Adónde vas?</h2>
        ${buscador('buscador-hoy').replace(`${icono('buscar')}Buscar ruta`, '¿Se puede hoy?')}
      </section>
      <section class="hoy-bloque" aria-labelledby="t-limita">
        <h2 id="t-limita">Lo que impide o limita</h2>
        <ul class="lista-lineas">${limitan.slice(0, 3).map(avisoHoy).join('')}</ul>
        <a class="enlace-mas" href="${u('/avisos/')}">Ver ${plural(activas.length, 'aviso', 'avisos')}${icono('derecha')}</a>
      </section>
    </div>
    <div class="hoy-col tarjeta">
      <section class="hoy-mapa" aria-labelledby="t-mapa-hoy">
        <h2 id="t-mapa-hoy" class="sr-only">Mapa del corredor hoy</h2>
        ${hayMapLibre ? mapaVivoHTML() : mapaHTML()}
      </section>
      <section class="hoy-bloque" aria-labelledby="t-pasos-hoy">
        <h2 id="t-pasos-hoy">Pasos hoy</h2>
        ${tableroPasos()}
        ${resumenTramosHoy()}
      </section>
    </div>
  </div>
</div>`,
    })
  );
}

// Planificador (resultados)
{
  const emp = empresas.map((e) => ({
    nombre: e.nombre,
    cat: catNombre[e.categoria] || e.categoria,
    destacada: !!e.destacada,
    wa: e.contacto?.whatsapp ? wa(e.contacto.whatsapp) : '',
    puntos: e.puntos || [],
  }));
  add(
    '/planificador/',
    layout({
      titulo: 'Planificar ruta',
      descripcion: 'Compara opciones de ruta por el Corredor Bioceánico: fronteras, estado de cada tramo, papeles y empresas en cada punto.',
      ruta: '/planificador/',
      scripts: ['/assets/planificador.js'],
      datos: datosRutas({ empresas: emp }),
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col rutas-col">
    <section class="tarjeta" aria-labelledby="t-rutas">
      <h1 id="t-rutas">Rutas</h1>
      ${buscador('buscador-compacto')}
      <div id="resultado" aria-live="polite"></div>
      <noscript><p class="aviso">Activa JavaScript para ver las opciones de ruta.</p></noscript>
    </section>
    ${mapaTarjeta({ clase: 'solo-ancho' })}
  </div>
</div>`,
    })
  );
}

// Informe de viaje (HU-45): se genera en el navegador con los mismos datos que el planificador.
{
  const fuenteMin = (f) => (f ? { nombre: f.nombre, url: f.url, tipo: f.tipo } : null);
  const reg = (x) => ({ texto: x.texto, lado: x.lado || '', organismo: x.organismo || '', fuente: fuenteMin(x.fuente), publicado: x.publicado || null, verificado: x.verificado || null });
  const extra = {
    generadoDatos: HOY,
    umbralPartesH: UMBRAL_PARTES_H,
    festivosTodos: festivos.map((f) => ({ pais: f.pais, fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, organismo: f.organismo, verificado: f.verificado || null, fuente: fuenteMin(f.fuente) })),
    pasosInfo: Object.fromEntries(
      fichaPasos.map((p) => [
        p.id,
        {
          nombre: p.nombre,
          estado: { texto: p.estado.texto, fuente: fuenteMin(p.estado.fuente), publicado: p.estado.publicado },
          horarios: (p.horarios || []).map(reg),
          especiales: (p.horariosEspeciales || []).map((h) => ({ ...reg(h), desde: h.desde, hasta: h.hasta })),
          lados: Object.keys(p.lados),
          fiabilidad: (() => {
            const r = (f) => ({ dias: f.dias, cerrado: f.cerrado, soloCarga: f.soloCarga, restricciones: f.restricciones, abierto: f.abierto, sinDatos: f.sinDatos, pendientesDeVerificar: f.pendientesDeVerificar });
            return { d30: r(fiabPaso(p, 30)), d90: r(fiabPaso(p, 90)) };
          })(),
          partes: (p.partes || []).map((x) => ({ ...reg(x), emisor: x.emisor, valor: x.valor || null, hora: x.hora || null, ts: instanteParte(x) })).sort((a, b) => (b.ts > a.ts ? 1 : -1)),
          guia: rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id)?.guia || null,
        },
      ])
    ),
    incidenciasInfo: Object.fromEntries(activas.map((i) => [i.id, { finPrevista: i.finPrevista || null, fuente: fuenteMin(i.fuente), verificado: i.verificado || null }])),
  };
  add(
    '/informe/',
    layout({
      titulo: 'Informe de viaje',
      descripcion: 'Informe de una ruta del Corredor Bioceánico para una fecha de cruce: estado de cada paso y tramo, horarios, festivos, avisos, papeles y fuentes.',
      ruta: '/informe/',
      scripts: ['/assets/informe.js'],
      datos: datosRutas(extra),
      cuerpo: `
<div class="contenedor informe-pagina">
  <div id="informe" aria-live="polite"><p class="texto-suave">Preparando el informe…</p></div>
  <noscript><p class="aviso">Activa JavaScript para ver el informe.</p></noscript>
  ${firmaMadre('informe-firma')}
</div>`,
    })
  );
}

// Novedades
{
  const paisesN = [...new Set(novedades.flatMap((n) => n.paises || []))];
  const temas = [...new Set(novedades.map((n) => n.tema))];
  add(
    '/novedades/',
    layout({
      titulo: 'Novedades del corredor',
      descripcion: 'Cambios de estado, avances de obras y acuerdos del Corredor Bioceánico, con fecha y fuente.',
      ruta: '/novedades/',
      scripts: ['/assets/filtros.js'],
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col novedades-col">
    <section class="tarjeta" aria-labelledby="t-nov">
      <h1 id="t-nov">Novedades del corredor</h1>
      <div class="filtros-noticias" data-filtros="#lista-novedades">
        <div class="chips" role="group" aria-label="País">
          <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
          ${paisesN.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false" aria-label="${esc(PAISES[p])}">${bandera(p)}</button>`).join('')}
        </div>
        <div class="chips" role="group" aria-label="Tema">
          <button class="chip" type="button" data-filtro="tema" data-valor="" aria-pressed="true">Todos los temas</button>
          ${temas.map((t) => `<button class="chip" type="button" data-filtro="tema" data-valor="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('')}
        </div>
      </div>
      <ul class="noticias-pagina" id="lista-novedades">${novedades
        .map((n) => `<li data-pais="${esc((n.paises || []).join(' '))}" data-tema="${esc(n.tema)}">${noticia(n)}</li>`)
        .join('')}</ul>
      <div class="vacio" data-vacio hidden><p>No hay novedades con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>
    </section>
    <aside class="guia-lado">
      <section class="tarjeta" aria-labelledby="t-hoy-nov"><h2 id="t-hoy-nov">Lo que afecta hoy</h2>
        <p>${plural(activas.length, 'aviso activo', 'avisos activos')} en pasos y carreteras, con su fuente.</p>
        <a class="btn btn-principal" href="${u('/avisos/')}">Ver avisos</a></section>
      <p class="nota-pie">Las noticias son contexto: no cambian el estado de un paso. Cada una enlaza a su medio.</p>
    </aside>
  </div>
</div>`,
    })
  );
}

// Guía (tabla)
{
  const paisesG = [...new Set(guia.flatMap((p) => p.meta.paises || []))];
  const estadosG = [...new Set(guia.map(estadoGuia))];
  const filas = Object.keys(SECCIONES)
    .flatMap((sec) => guia.filter((p) => p.seccion === sec))
    .map(
      (p) => `<tr data-pais="${esc((p.meta.paises || []).join(' '))}" data-estado="${esc(estadoGuia(p))}" data-validacion="${esc(nivelGuia(p))}">
        <td><a href="${u(p.ruta)}">${esc(p.meta.titulo)}</a></td>
        <td class="col-tipo">${esc({ pasos: 'Paso fronterizo', tramos: 'Tramo', documentos: 'Documentos' }[p.seccion] || p.seccion)}</td>
        <td>${paises(p.meta.paises)}</td>
        <td>${vistaGuia(p) ? estado(estadoGuia(p)) : '<span class="sin-dato">No aplica</span>'}</td>
        <td>${validacionHTML(nivelGuia(p), p.meta.verificado, p.meta.fuente)}</td>
        <td class="col-revisado">${fecha(p.meta.revisado)}</td>
      </tr>`
    )
    .join('');
  add(
    '/guia/',
    layout({
      titulo: 'Guía del corredor',
      descripcion: 'Pasos fronterizos, tramos y documentos del Corredor Bioceánico, con estado y fuentes.',
      ruta: '/guia/',
      scripts: ['/assets/filtros.js'],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Guía del corredor</h1><p>Pasos, tramos y papeles. Cada página indica su estado, si está verificada y cuándo se revisó.</p></header>
  <div class="filtros-guia" data-filtros="#tabla-guia tbody">
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesG.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Estado"><span class="filtro-etiqueta">Estado</span>
      <button class="chip" type="button" data-filtro="estado" data-valor="" aria-pressed="true">Todos</button>
      ${estadosG.map((e) => `<button class="chip" type="button" data-filtro="estado" data-valor="${esc(e)}" aria-pressed="false">${esc(ESTADOS[e] || 'No aplica')}</button>`).join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="Validación"><span class="filtro-etiqueta">Validación</span>
      <button class="chip" type="button" data-filtro="validacion" data-valor="" aria-pressed="true">Todas</button>
      ${[...new Set(guia.map(nivelGuia))].map((n) => `<button class="chip" type="button" data-filtro="validacion" data-valor="${esc(n)}" aria-pressed="false">${esc(NIVELES[n].texto)}</button>`).join('')}
    </div>
  </div>
  <div class="tabla-marco">
    <table class="tabla-guia" id="tabla-guia">
      <thead><tr><th scope="col">Página</th><th scope="col">Tipo</th><th scope="col">Países</th><th scope="col">Estado</th><th scope="col">Validación</th><th scope="col">Revisado</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
  </div>
  <div class="vacio" data-vacio hidden><p>No hay páginas con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>
</div>`,
    })
  );
}

// HU-115 / HU-136 (V2): página del mapa interactivo. Mapa grande y, al lado, cada tramo con su estado (forma,
// color y palabra), su distancia y dos acciones: verlo en el mapa y abrir su ficha.
{
  const { lineas } = datosMapa();
  const km = (l) => (l.km != null ? `${GCkm(l.km)} con fuente` : l.kmCalculado != null ? `${GCkm(l.kmCalculado)} calculados con OpenStreetMap` : 'km por cargar');
  // V2: una línea por tramo; al tocarla, el mapa se centra en él. El icono abre su ficha.
  const tarjeta = (l) => `<li class="mapa-tramo">
    ${hayMapLibre ? `<button type="button" class="linea-tramo" data-tramo-mapa="${esc(l.id)}">` : '<span class="linea-tramo">'}
      ${OPERATIVA[l.op].icono}<span class="inc-que"><strong>${esc(l.nombre)}</strong><small>${esc(OPERATIVA[l.op].texto)} · ${esc(km(l))}</small></span>
    ${hayMapLibre ? '</button>' : '</span>'}
    ${l.url ? `<a class="ib" href="${esc(l.url)}" aria-label="Ficha: ${esc(l.nombre)}" title="Ver la ficha">${icono('derecha')}</a>` : ''}
  </li>`;
  add(
    '/mapa/',
    layout({
      titulo: 'Mapa del corredor',
      descripcion: 'Mapa interactivo del Corredor Bioceánico con el estado de cada tramo y paso fronterizo.',
      ruta: '/mapa/',
      estilos: hayMapLibre ? ['/assets/vendor/maplibre-gl.css'] : [],
      scripts: hayMapLibre ? ['/assets/vendor/maplibre-gl.js', '/assets/mapa.js'] : [],
      datos: datosMapaScript(),
      cuerpo: `
<div class="contenedor pagina-app mapa-pagina">
  <div class="dos-col mapa-col">
    <section class="tarjeta" aria-labelledby="t-mapa">
      <h1 id="t-mapa">Mapa del corredor</h1>
      ${mapaVivoHTML({ leyenda: true })}
      <p class="nota-pie">Mapa base: © OpenStreetMap y sus colaboradores, teselas de OpenFreeMap. Los km «calculados con OpenStreetMap» son un cálculo, no un dato oficial.</p>
    </section>
    <section class="tarjeta" aria-labelledby="t-tramos-mapa">
      <h2 id="t-tramos-mapa">Tramos</h2>
      <p class="nota-pie">Toca un tramo para verlo en el mapa.</p>
      <ul class="mapa-tramos">${lineas.map(tarjeta).join('')}</ul>
    </section>
  </div>
</div>`,
    })
  );
}

/** Ficha de un paso (V2): a la izquierda el tablero con el paso marcado (escritorio), a la derecha la ficha. */
function fichaPasoPagina(p, paso, cruce, zona, emp, nombresZona, nov) {
  const [, nombre, lados] = p.meta.titulo.match(/^(.*?)\s*(?:\((.*)\))?$/);
  const ayuda = zona.length
    ? `<section class="tarjeta" aria-labelledby="t-zona"><h2 id="t-zona">Servicios en la zona</h2><p class="nota-pie">${esc(nombresZona)}</p>
      ${emp.length ? `<ul class="minis">${emp.slice(0, 3).map(empresaMini).join('')}</ul>` : '<p class="nota-pie">Aún no hay empresas verificadas en esta zona.</p>'}
      <div class="acc"><a class="btn btn-borde" href="${u(`/directorio/?punto=${zona[0]}`)}">Ver servicios</a><a class="btn btn-borde" href="${u('/anunciate/')}">Anunciarme aquí</a></div></section>`
    : '';
  return `
<div class="contenedor pagina-app">
  <div class="dos-col ficha-paso-col">
    <div class="ficha-lado">
      <section class="tarjeta solo-ancho" aria-label="Todos los pasos">${tableroPasos({ sel: paso.id })}</section>
      ${(() => {
        const t = rutas.tramos.find((x) => x.paso?.id === paso.id || x.alternativa?.id === paso.id);
        return mapaTarjeta({ foco: [paso.id, t.desde, t.hasta] });
      })()}
      ${cruce ? `<section class="tarjeta">${cruce}</section>` : ''}
      ${ayuda}
    </div>
    <article class="tarjeta ficha-principal">
      <a class="volver" href="${u('/pasos/')}">${icono('izquierda')}Fronteras</a>
      <header class="ficha-titulo"><h1>${esc(nombre)}</h1>${lados ? `<p>${esc(lados)}</p>` : ''}</header>
      ${fichaOperativa(fichaPaso[paso.id], `${p.seccion}/${p.slug}`)}
      <div class="plegables plegables-guia">${plegable('guia-paso', 'Guía del paso', esc((NIVELES[nivelGuia(p)]?.texto || '').toLowerCase()), `${avisoValidacion(nivelGuia(p), p.meta.verificado)}<!--es--><div class="contenido-es" lang="es"><p class="resumen">${esc(p.meta.resumen)}</p>${p.html}</div><!--/es-->${nov.length ? `<h2 id="ultimos-cambios">Últimos cambios</h2><ul class="lista-noticias">${nov.map((n) => `<li>${noticia(n, { conLugar: false })}</li>`).join('')}</ul>` : ''}`)}</div>
    </article>
  </div>
</div>`;
}

// Páginas de la guía
for (const p of guia) {
  const zona = p.meta.puntos || [];
  const emp = empresasEn(zona);
  const nov = novedades.filter((n) => n.guia === `${p.seccion}/${p.slug}`);
  const nombresZona = listaY(zona.map((z) => nodoNombre[z] || z));
  const paso = pasoPorGuia[`${p.seccion}/${p.slug}`];
  const cruce = paso ? panelCruce(paso) : '';
  const esPaso = !!(paso && fichaPaso[paso.id]);
  add(
    p.ruta,
    layout({
      titulo: p.meta.titulo,
      descripcion: p.meta.resumen,
      ruta: p.ruta,
      scripts: [...(cruce && envioCruce ? ['/assets/cruces.js'] : []), ...(paso ? ['/assets/ahora.js'] : [])],
      cuerpo: esPaso ? fichaPasoPagina(p, paso, cruce, zona, emp, nombresZona, nov) : guiaPagina(p, zona, emp, nombresZona, nov, cruce),
    })
  );
}

/** Página de guía que no es un paso (V2): tramo o documento. Lo operativo arriba; el texto de la guía, plegado si hay datos encima. */
function guiaPagina(p, zona, emp, nombresZona, nov, cruce) {
  const ruta = `${p.seccion}/${p.slug}`;
  const tramos = bloqueTramos(ruta);
  const [volverA, volverTxt] = p.seccion === 'tramos' ? ['/planificador/', 'Rutas'] : ['/pasos/', 'Fronteras'];
  const nivel = nivelGuia(p);
  const ultimos = nov.length ? `<h2 id="ultimos-cambios">Últimos cambios</h2><ul class="lista-noticias">${nov.map((n) => `<li>${noticia(n, { conLugar: false })}</li>`).join('')}</ul>` : '';
  const texto = `${nivel === 'caducado' ? avisoValidacion(nivel, p.meta.verificado) : ''}<!--es--><div class="contenido-es" lang="es">${p.html}</div><!--/es-->${ultimos}`;
  return `
<div class="contenedor pagina-app">
  <div class="dos-col guia-col">
    <article class="tarjeta ficha-principal">
      <a class="volver" href="${u(volverA)}">${icono('izquierda')}${volverTxt}</a>
      <header class="ficha-titulo"><h1>${esc(p.meta.titulo)}</h1><p>${esc(p.meta.resumen)}</p>
        <p class="nota-pie guia-meta">${paises(p.meta.paises)}<span>Texto ${esc((NIVELES[nivel]?.texto || '').toLowerCase())} · revisado el ${fecha(p.meta.revisado)}</span></p></header>
      ${tramos}
      ${tramos ? `<div class="plegables plegables-guia">${plegable('guia-texto', 'Guía del tramo', p.indice.map((h) => h.t).slice(0, 3).join(', ').toLowerCase(), texto)}</div>` : texto}
    </article>
    <aside class="guia-lado">
      ${zona.length ? mapaTarjeta({ foco: zona }) : ''}
      ${cruce ? `<section class="tarjeta">${cruce}</section>` : ''}
      ${
        zona.length
          ? `<section class="tarjeta" aria-labelledby="t-zona"><h2 id="t-zona">Servicios en la zona</h2><p class="nota-pie">${esc(nombresZona)}</p>
        ${emp.length ? `<ul class="minis">${emp.slice(0, 3).map(empresaMini).join('')}</ul>` : '<p class="nota-pie">Aún no hay empresas verificadas en esta zona.</p>'}
        <div class="acc"><a class="btn btn-borde" href="${u(`/directorio/?punto=${zona[0]}`)}">Ver servicios</a><a class="btn btn-borde" href="${u('/anunciate/')}">Anunciarme aquí</a></div></section>`
          : ''
      }
      <section class="tarjeta" aria-labelledby="t-viaje"><h2 id="t-viaje">¿Viajas por aquí?</h2><a class="btn btn-principal" href="${u('/planificador/')}">${icono('ruta')}Planificar ruta</a></section>
    </aside>
  </div>
</div>`;
}

// Empresas
{
  const paisesUsados = [...new Set(empresas.map((e) => e.pais))];
  const cuenta = (fn) => empresas.filter(fn).length;
  const sugerencias = [
    ...empresas.map((e) => ({ t: e.nombre, d: catNombre[e.categoria] })),
    ...[...new Set(empresas.map((e) => e.ciudad))].map((c) => ({ t: c, d: 'Ciudad' })),
    ...categorias.filter((c) => cuenta((e) => e.categoria === c.id)).map((c) => ({ t: c.nombre, d: 'Tipo de empresa' })),
    ...[...new Set(empresas.flatMap((e) => e.servicios || []))].map((s) => ({ t: s, d: 'Servicio' })),
  ];
  // HU-133 (R8): las 11 categorías reales, primero las que se necesitan en ruta. En móvil se ven 4 y «Ver las 11».
  const ICONO_CAT = { combustible: 'surtidor', taller: 'llave', descanso: 'cama', bascula: 'bascula', transitario: 'globo', transportista: 'camion', despachante: 'papeles', alojamiento: 'cama', deposito: 'deposito', seguro: 'escudo', servicios: 'empresas' };
  const ORDEN_CAT = ['combustible', 'taller', 'descanso', 'bascula', 'transportista', 'transitario', 'despachante', 'deposito', 'alojamiento', 'seguro', 'servicios'];
  const catsOrden = [...categorias].sort((x, y) => (ORDEN_CAT.indexOf(x.id) + 99) % 99 - (ORDEN_CAT.indexOf(y.id) + 99) % 99);
  const categoriasHTML = `<section class="cats" aria-labelledby="t-cats"><h2 id="t-cats" class="sr-only">Qué necesitas</h2>
    <ul class="cats-lista">${catsOrden
      .map((c) => `<li><a class="cat" href="${u(`/directorio/?categoria=${c.id}`)}">${icono(ICONO_CAT[c.id] || 'empresas')}<strong>${esc(c.nombre)}</strong>${empresas.length ? `<span>${plural(cuenta((e) => e.categoria === c.id), 'empresa', 'empresas')}</span>` : ''}</a></li>`)
      .join('')}</ul>
    <button type="button" class="btn btn-borde cats-mas" onclick="this.closest('.cats').classList.add('cats-todas');this.remove()">Ver las ${categorias.length} categorías</button>
  </section>`;
  const puertaNegocio = `<a class="negocio negocio-ancho" href="${u('/anunciate/')}">${icono('empresas')}<span><strong>¿Das servicio en el corredor?</strong><span>Aparece en tu paso y en el planificador</span></span></a>`;
  const vacioDirectorio = `
<div class="contenedor pagina-app servicios">
  <div class="dos-col">
    <section class="tarjeta" aria-labelledby="t-servicios">
      <h1 id="t-servicios">Servicios</h1>
      <p class="servicios-ruta" id="servicios-ruta" hidden></p>
      <div class="caja-vacia"><strong>Aún no hay empresas verificadas en el corredor</strong><span>Solo publicamos empresas que han confirmado sus datos.</span></div>
      <div class="acc"><a class="btn btn-negocio" href="${cotizacion()}">Pedir cotización</a><a class="btn btn-borde" href="${cargaRetorno()}">${icono('camion')}Camión vacío</a></div>
      <p class="nota-pie">¿Das servicio en el corredor? <a href="${u('/anunciate/')}">Anunciar mi empresa</a></p>
    </section>
    <section class="tarjeta">${categoriasHTML.replace('class="sr-only">Qué necesitas', '>Qué necesitas')}</section>
  </div>
</div>
<script>document.addEventListener('DOMContentLoaded',function(){try{var r=JSON.parse(localStorage.getItem('guia-corredor:mi-ruta')||'null'),d=JSON.parse(document.getElementById('datos-nodos').textContent);if(r&&d[r.desde]&&d[r.hasta]){var e=document.getElementById('servicios-ruta');e.textContent='En tu ruta: '+d[r.desde]+' → '+d[r.hasta];e.hidden=false}}catch(x){}})</script>`;
  add(
    '/directorio/',
    layout({
      titulo: 'Servicios del corredor',
      descripcion: 'Transitarios, transportistas, despachantes, depósitos y servicios en cada punto del Corredor Bioceánico.',
      ruta: '/directorio/',
      scripts: empresas.length ? ['/assets/directorio.js'] : [],
      datos: `<script type="application/json" id="datos-sugerencias">${JSON.stringify(sugerencias).replace(/</g, '\\u003c')}</script><script type="application/json" id="datos-nodos">${JSON.stringify(rutas.nodos.map((n) => n.nombre)).replace(/</g, '\\u003c')}</script>`,
      cuerpo: !empresas.length ? vacioDirectorio : `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Servicios</h1><p>Busca quién da servicio en cada punto de la ruta y escríbele directamente.</p></header>
  ${categoriasHTML}
  <div class="busqueda-web">
    ${icono('buscar')}
    <label class="oculto" for="f-texto">Buscar empresas</label>
    <input id="f-texto" type="search" autocomplete="off" placeholder="Empresa, servicio o ciudad" role="combobox" aria-expanded="false" aria-controls="sugerencias" aria-autocomplete="list">
    <ul class="sugerencias" id="sugerencias" role="listbox" aria-label="Sugerencias" hidden></ul>
  </div>
  <div class="filtros-empresas">
    <div class="filtro-linea" role="group" aria-label="Tipo de empresa"><span class="filtro-etiqueta">Tipo</span>
      <button class="chip" type="button" data-filtro="tipo" data-valor="" aria-pressed="true">Todas <span class="n">${empresas.length}</span></button>
      ${categorias
        .filter((c) => cuenta((e) => e.categoria === c.id))
        .map((c) => `<button class="chip" type="button" data-filtro="tipo" data-valor="${esc(c.id)}" aria-pressed="false">${esc(c.nombre)} <span class="n">${cuenta((e) => e.categoria === c.id)}</span></button>`)
        .join('')}
    </div>
    <div class="filtro-linea" role="group" aria-label="País"><span class="filtro-etiqueta">País</span>
      <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
      ${paisesUsados.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false">${esc(PAISES[p])}</button>`).join('')}
    </div>
    <div class="filtro-linea"><label class="filtro-etiqueta" for="f-punto">Punto de la ruta</label>
      <select class="selector" id="f-punto"><option value="">Toda la ruta</option>${rutas.nodos
        .map((n) => `<option value="${esc(n.id)}">${esc(n.nombre)} (${cuenta((e) => (e.puntos || []).includes(n.id))})</option>`)
        .join('')}</select>
    </div>
  </div>
  <p class="contador" id="contador" role="status">${plural(empresas.length, 'empresa', 'empresas')}</p>
  <ul class="resultados-empresas" id="lista-empresas">${empresas.map(empresaFila).join('')}</ul>
  <div class="vacio" id="sin-resultados" hidden>
    <p>No hay empresas con esos filtros. Prueba con otro punto, país o tipo.</p>
    <button class="btn btn-borde" type="button" id="limpiar">Quitar filtros</button>
  </div>
</div>`,
    })
  );
}

// Pedir cotización en 3 pasos (V6, decisión 37): qué y por dónde, el detalle según el servicio y tus datos.
// Va a la hoja privada (Google Forms, site.json → cotizaciones.enlacePrellenado); si no, prepara un email.
// «Tengo el camión vacío» es el mismo formulario en modo vuelta (?tipo=retorno). Lógica: src/assets/cotizar.js.
{
  const envio = configEnvio(site.cotizaciones?.enlacePrellenado, CAMPOS_COTIZACION);
  const conGoogle = envio && !envio.error;
  const radio = (name, valor, txt = valor, extra = '') => `<label class="chip chip-radio"><input type="radio" name="${name}" value="${esc(valor)}"${extra}><span>${esc(txt)}</span></label>`;
  const casilla = (name, valor) => `<label class="chip chip-radio"><input type="checkbox" name="${name}" value="${esc(valor)}"><span>${esc(valor)}</span></label>`;
  const chips = (name, valores, marcado) => `<div class="chips">${valores.map((v) => radio(name, v, v, v === marcado ? ' checked' : '')).join('')}</div>`;
  const grupo = (leyenda, cuerpo, { opcional = false, ayuda = '', clave = '' } = {}) =>
    `<fieldset class="cot-grupo"${clave ? ` data-clave="${clave}"` : ''}><legend>${esc(leyenda)}${opcional ? ' <span class="cot-opc">(opcional)</span>' : ''}</legend>${cuerpo}${ayuda ? `<p class="cot-ayuda">${esc(ayuda)}</p>` : ''}</fieldset>`;
  const texto = (id, etiqueta, attrs = '', { opcional = false, ayuda = '' } = {}) =>
    `<div class="cot-grupo"><label class="cot-lbl" for="${id}">${esc(etiqueta)}${opcional ? ' <span class="cot-opc">(opcional)</span>' : ''}</label><input class="cot-inp" id="${id}" ${attrs}>${ayuda ? `<p class="cot-ayuda">${esc(ayuda)}</p>` : ''}</div>`;
  const notas = (id, ph) => `<div class="cot-grupo"><label class="cot-lbl" for="${id}">Algo especial <span class="cot-opc">(opcional)</span></label><textarea class="cot-inp" id="${id}" name="especial" placeholder="${esc(ph)}"></textarea></div>`;
  const PAISES_COT = [...Object.values(PAISES), 'Otro'];
  const lugares = [...new Set([...rutas.nodos.map((n) => n.nombre), 'Asunción', 'Ciudad del Este', 'Encarnación', 'Concepción', 'São Paulo', 'Curitiba', 'Paranaguá', 'Santos', 'Buenos Aires', 'Rosario', 'Córdoba', 'Salta', 'San Salvador de Jujuy', 'Santiago', 'Valparaíso', 'San Antonio', 'Arica'])];
  const lugar = (lado, titulo) => `<div class="cot-lugar" data-clave="${lado}"><h3>${titulo}</h3>
        <fieldset class="cot-grupo" data-clave="${lado}_pais"><legend class="sr-only">País de ${titulo.toLowerCase()}</legend>${chips(`${lado}_pais`, PAISES_COT)}</fieldset>
        <div class="cot-grupo"><label class="cot-lbl" for="cot-${lado}">Ciudad o localidad</label><input class="cot-inp" id="cot-${lado}" name="${lado === 'origen' ? 'desde' : 'hasta'}" list="cot-lugares" autocomplete="off" required></div></div>`;
  const pasosFrontera = ['No lo sé', ...pasosArr().map((p) => p.nombre.replace(/^Paso de /, "")), 'Otro'];
  const servicios = [
    ['Transporte de carga', 'camion', ''],
    ['Despacho de aduana', 'papeles', ''],
    ['Almacenamiento', 'deposito', ''],
    ['Logística completa', 'ruta', 'Transporte, aduana y almacén'],
  ];
  // Prefijos del teléfono con su bandera (SVG: el emoji de bandera sale como «PY» en Windows) y el país escrito.
  const prefijos = [['+595', 'PY', 'Paraguay'], ['+54', 'AR', 'Argentina'], ['+56', 'CL', 'Chile'], ['+55', 'BR', 'Brasil'], ['+34', 'ES', 'España']];
  const BANDERA_TEL = { ...BANDERAS, ES: '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>' };
  add(
    '/cotizar/',
    layout({
      titulo: 'Pedir cotización',
      descripcion: 'Pide precio de transporte, aduana o almacén en el Corredor Bioceánico, o publica tu vuelta con el camión vacío.',
      ruta: '/cotizar/',
      scripts: ['/assets/cotizar.js'],
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col">
    <section class="tarjeta" aria-labelledby="t-cotizar">
      <form class="cot" id="form-cotizar" data-nodos="${esc(JSON.stringify(rutas.nodos.map((n) => [n.nombre, PAISES[n.pais]])))}" data-asunto="Cotización" data-email="${esc(buzon('contacto'))}"${conGoogle ? ` data-accion="${esc(envio.accion)}" data-campos="${esc(JSON.stringify(envio.campos))}"` : ''} novalidate>
        <h1 id="t-cotizar"><span data-modo="pedir">Pedir cotización</span><span data-modo="retorno" hidden>Publica tu vuelta</span></h1>
        <div class="cot-progreso">
          <p id="cot-paso-txt" aria-live="polite">Paso 1 de 3 · Qué y por dónde</p>
          <ol class="cot-barra"><li aria-current="step">Qué y por dónde</li><li>El detalle</li><li>Tus datos</li></ol>
        </div>

        <fieldset class="cot-paso" data-paso="1" aria-label="Paso 1: qué y por dónde">
          <fieldset class="cot-grupo" data-clave="servicio" data-modo="pedir"><legend>¿Qué necesitas?</legend>
            <div class="cot-tiles">${servicios.map(([v, ic, sub]) => `<label class="cot-tile"><input type="radio" name="servicio" value="${esc(v)}">${icono(ic)}<span>${esc(v)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</label>`).join('')}</div>
            <div class="chips">${radio('servicio', 'Otro servicio')}</div>
            <p class="cot-ayuda">¿Tienes el camión vacío? <a href="${u('/cotizar/?tipo=retorno')}">Publica tu vuelta</a></p>
          </fieldset>
          <p class="cot-ayuda" data-modo="retorno" hidden>Avisa de tu viaje de vuelta y te buscamos carga. ¿Necesitas transporte? <a href="${u('/cotizar/')}">Pide cotización</a></p>
          <fieldset class="cot-grupo"><legend>¿Por dónde?</legend>
            <div class="cot-dos">${lugar('origen', 'Origen')}${lugar('destino', 'Destino')}</div>
            <datalist id="cot-lugares">${lugares.map((l) => `<option value="${esc(l)}"></option>`).join('')}</datalist>
          </fieldset>
          ${grupo('Paso de frontera', chips('paso', pasosFrontera, 'No lo sé'), { opcional: true, ayuda: 'Si no lo sabes, te proponemos uno según el estado de los pasos.' })}
          ${grupo('¿Para cuándo?', `${chips('cuando', ['Esta semana', 'Este mes', 'Más adelante', 'Fecha concreta'])}<div class="cot-grupo" id="cot-fecha-campo" hidden><label class="cot-lbl" for="cot-fecha">Fecha</label><input class="cot-inp" id="cot-fecha" name="fecha" type="date" min="${HOY}"></div>`, { clave: 'cuando' })}
        </fieldset>

        <fieldset class="cot-paso" data-paso="2" aria-label="Paso 2: el detalle" hidden>
          <p class="cot-ayuda" id="cot-contexto"></p>
          <div class="cot-paso" data-variante="carga">
            ${texto('cot-merc', 'Mercancía', 'name="mercancia" required placeholder="p. ej. soja en bolsas"')}
            ${grupo('Tipo de carga', chips('carga', [...rutas.tiposCarga.map((c) => c.nombre), 'Peligrosa']), { ayuda: 'Ninguna viene marcada: eliges tú.', clave: 'carga' })}
            <div class="cot-grupo" data-clave="peso"><label class="cot-lbl" for="cot-peso">Peso aproximado</label><input class="cot-inp" id="cot-peso" name="peso" placeholder="p. ej. 28 t" required><label class="cot-check"><input type="checkbox" name="peso_nose" value="1"> Aún no lo sé</label></div>
            ${texto('cot-vol', 'Volumen o medidas', 'name="volumen" placeholder="p. ej. 26 pallets o 60 m³"', { opcional: true })}
            ${grupo('¿Cuántos viajes?', chips('viajes', ['Un viaje', 'Varios', 'Todos los meses']), { clave: 'viajes' })}
            ${grupo('Camión o equipo', chips('equipo', ['Semirremolque', 'Furgón', 'Refrigerado', 'Portacontenedor', 'No lo sé']), { opcional: true })}
            ${notas('cot-esp-c', 'Temperatura, plazos, carga y descarga…')}
          </div>
          <div class="cot-paso" data-variante="aduana" hidden>
            ${grupo('Operación', chips('operacion', ['Exportación', 'Importación', 'Tránsito', 'No lo sé']), { clave: 'operacion' })}
            ${texto('cot-merc-a', 'Mercancía', 'name="mercancia" required placeholder="p. ej. carne vacuna congelada"', { ayuda: 'Si sabes el código arancelario, añádelo.' })}
            ${grupo('Documentos que ya tienes', `<div class="chips">${['Factura comercial', 'Certificado de origen', 'MIC/DTA', 'Ninguno todavía'].map((d) => casilla('documentos', d)).join('')}</div>`, { opcional: true, ayuda: 'Puedes marcar varios.' })}
            ${grupo('¿Necesitas también transporte?', chips('con_transporte', ['Sí', 'No, ya lo tengo']), { clave: 'con_transporte' })}
            ${notas('cot-esp-a', 'Plazos, aduana de salida o de llegada…')}
          </div>
          <div class="cot-paso" data-variante="almacen" hidden>
            ${texto('cot-merc-b', 'Mercancía', 'name="mercancia" required placeholder="p. ej. maquinaria en cajas"')}
            <div class="cot-grupo" data-clave="cantidad"><label class="cot-lbl" for="cot-cant">Cantidad</label><div class="cot-fila"><input class="cot-inp" id="cot-cant" name="cantidad" inputmode="decimal" required placeholder="p. ej. 24"><select class="cot-inp cot-pref" name="unidad" aria-label="Unidad"><option>pallets</option><option>m²</option><option>t</option></select></div></div>
            ${grupo('¿Cuánto tiempo?', chips('tiempo', ['Días', 'Semanas', 'Meses', 'No lo sé']), { clave: 'tiempo' })}
            ${grupo('Condiciones', `<div class="chips">${['Seco', 'Refrigerado', 'Depósito fiscal'].map((d) => casilla('condiciones', d)).join('')}</div>`, { opcional: true, ayuda: 'Depósito fiscal: la mercancía espera sin pagar aranceles todavía.' })}
            ${notas('cot-esp-b', 'Carga y descarga, accesos…')}
          </div>
          <div class="cot-paso" data-variante="otro" hidden>
            <div class="cot-grupo"><label class="cot-lbl" for="cot-esp-o">¿Qué necesitas?</label><textarea class="cot-inp" id="cot-esp-o" name="especial" required placeholder="Cuéntanos el servicio en pocas líneas"></textarea></div>
          </div>
          <div class="cot-paso" data-variante="retorno" hidden>
            ${grupo('Tu camión', chips('equipo', ['Semirremolque', 'Furgón', 'Refrigerado', 'Portacontenedor', 'Otro']), { clave: 'equipo' })}
            ${grupo('Qué puedes llevar', chips('carga', [...rutas.tiposCarga.map((c) => c.nombre), 'Lo que sea']), { opcional: true })}
            ${notas('cot-esp-r', 'Capacidad, fechas flexibles…')}
          </div>
        </fieldset>

        <fieldset class="cot-paso" data-paso="3" aria-label="Paso 3: tus datos y envío" hidden>
          <dl class="cot-resumen" id="cot-resumen" aria-label="Resumen de la solicitud"></dl>
          ${texto('cot-nombre', 'Tu nombre', 'name="nombre" required autocomplete="name"')}
          ${texto('cot-empresa', 'Empresa', 'name="empresa" required autocomplete="organization"')}
          <fieldset class="cot-grupo" data-clave="telefono"><legend>WhatsApp o teléfono</legend>
            <div class="cot-fila">
              <div class="cot-prefijo">
                <span class="cot-prefijo-ver" aria-hidden="true">${prefijos.map(([, iso]) => `<span class="cot-band" data-iso="${iso}"${iso === 'PY' ? '' : ' hidden'}><svg viewBox="0 0 30 20" width="24" height="16" focusable="false">${BANDERA_TEL[iso]}</svg><b>${iso}</b></span>`).join('')}<span class="cot-band" data-iso="" hidden>${icono('globo')}</span><span class="cot-prefijo-cod">+595</span><svg class="cot-flecha" viewBox="0 0 24 24" width="16" height="16" focusable="false"><path d="M6 9l6 6l6 -6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                <label class="sr-only" for="cot-prefijo">País del teléfono</label>
                <select id="cot-prefijo" name="prefijo" aria-describedby="cot-tel-ayuda">${prefijos.map(([p, iso, nombre]) => `<option value="${p}" data-iso="${iso}">${esc(nombre)} (${p})</option>`).join('')}<option value="" data-iso="">Otro país (escríbelo con el número)</option></select>
              </div>
              <label class="sr-only" for="cot-tel">Número</label>
              <input class="cot-inp" id="cot-tel" name="numero" type="tel" inputmode="tel" autocomplete="tel-national" required placeholder="981 123 456" aria-describedby="cot-tel-ayuda">
            </div>
            <p class="cot-ayuda" id="cot-tel-ayuda">Elige el país y escribe el número sin el prefijo. Te respondemos por aquí.</p></fieldset>
          ${texto('cot-email', 'Email', 'name="email" type="email" autocomplete="email"', { opcional: true })}
          ${grupo('Eres…', chips('perfil', ['Exportador o importador', 'Transportista', 'Despachante', 'Operador logístico', 'Otro']), { opcional: true })}
          <label class="cot-check"><input type="checkbox" name="compartir" value="Sí"> <span>Acepto que RadarCorredor pase mi solicitud y mi contacto a empresas del corredor que puedan hacerla. <span class="cot-opc">(opcional)</span></span></label>
          <p class="cot-priv">RadarCorredor usa estos datos solo para ayudarte a encontrar cotización. No los publicamos. Para consultarlos o borrarlos, escribe a <a href="mailto:${esc(site.contacto.email)}">${esc(site.contacto.email)}</a>.</p>
        </fieldset>

        <p class="form-error" id="cot-error" role="alert" hidden></p>
        <div class="cot-banda" id="cot-fallo" role="alert" hidden>
          <p><strong>No se pudo enviar.</strong> Tus datos siguen aquí. Vuelve a intentarlo o mándanos la solicitud por email: ya va escrita.</p>
          <div class="acc"><button type="submit" class="btn btn-negocio">Reintentar</button><a class="btn btn-borde" id="cot-por-email" href="#">${icono('correo')}Enviar por email</a></div>
        </div>
        <div class="cot-pie">
          <button type="button" class="btn btn-borde" id="cot-atras" hidden>Atrás</button>
          <button type="button" class="btn btn-negocio" id="cot-seguir">Seguir</button>
          <button type="submit" class="btn btn-negocio" id="cot-enviar" hidden>Enviar solicitud</button>
        </div>
        <p class="nota-pie">Sin coste y sin registro.</p>
      </form>

      <div class="cot-ok" id="cot-ok" tabindex="-1" hidden>
        <h1>Solicitud recibida</h1>
        <div class="cot-id"><span class="cot-ayuda">Número de solicitud</span><strong id="cot-id"></strong><span class="cot-ayuda">Lo usamos para encontrarla si nos escribes.</span></div>
        <h2>Qué pasa ahora</h2>
        <ol class="cot-pasos-ok">
          <li>La revisamos en 2 días laborables como máximo.</li>
          <li data-modo="pedir">Buscamos empresas del corredor que puedan hacerla.</li>
          <li data-modo="retorno" hidden>Buscamos carga para tu vuelta.</li>
          <li>Te escribimos con lo que encontremos, también si no hay nada disponible.</li>
        </ol>
        <p class="cot-ayuda">Sin tu permiso, no damos tu contacto a ninguna empresa.</p>
        <button type="button" class="btn btn-borde" id="cot-copiar">Copiar el resumen</button>
        <a href="${u('/pasos/')}">Ver el estado de los pasos</a>
      </div>
      <div id="cot-textos" hidden>
        <span data-t="paso1">Qué y por dónde</span><span data-t="paso2">El detalle</span><span data-t="paso3">Tus datos</span>
        <span data-t="paso">Paso</span><span data-t="de">de</span><span data-t="falta">Falta</span>
        <span data-t="tel">Escribe el número con al menos 6 cifras.</span><span data-t="mail">Revisa el email: no parece válido.</span>
        <span data-t="servicioRuta">Servicio y ruta</span><span data-t="detalle">El detalle</span><span data-t="cambiar">Cambiar</span>
        <span data-t="enviando">Enviando…</span><span data-t="copiado">Copiado</span><span data-t="paso_no">paso: no lo sé</span>
        <span data-t="retorno">Camión vacío</span><span data-t="nose">peso por confirmar</span>
      </div>
    </section>
    <aside class="tarjeta cot-lado solo-ancho" aria-label="Tu solicitud">
      <h2>Tu solicitud</h2>
      <dl id="cot-lado"><div><dt>Servicio</dt><dd>—</dd></div><div><dt>Ruta</dt><dd>—</dd></div><div><dt>Cuándo</dt><dd>—</dd></div></dl>
      <h2>Después de enviarla</h2>
      <ul><li>La revisamos en 2 días laborables como máximo.</li><li>Buscamos empresas del corredor que puedan hacerla.</li><li>Te escribimos, también si no hay ninguna.</li></ul>
      <p class="cot-ayuda">Sin coste y sin registro.</p>
    </aside>
  </div>
</div>`,
    })
  );
}

// Anunciar
{
  const planes = site.planes
    .map(
      (pl) => `
<section class="plan${pl.id === 'destacada' ? ' plan-destacado' : ''}" aria-labelledby="plan-${esc(pl.id)}">
  <h2 id="plan-${esc(pl.id)}">${esc(pl.nombre)}</h2>
  <p class="precio">${esc(pl.precio.replace(' / mes', ' al mes'))}</p>
  <ul class="lista-check">${pl.incluye.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
  ${
    pl.id === 'destacada'
      ? pl.enlacePago
        ? `<a class="btn btn-principal" href="${esc(pl.enlacePago)}" rel="noopener">Contratar con PayPal</a><p class="nota">Pago mensual con PayPal o tarjeta. Factura incluida. Cancelas cuando quieras.</p>`
        : '<p class="nota">Abrimos los pagos pronto, con PayPal o tarjeta y factura. Si te interesa, indícalo al darte de alta.</p>'
      : '<a class="btn btn-borde" href="#alta">Darme de alta gratis</a>'
  }
</section>`
    )
    .join('');
  // Formulario de solicitud (P0.6): sin servidor. Prepara un email al contacto del proyecto.
  // La solicitud no se publica: queda pendiente de revisión (docs/como-editar.md#solicitudes-de-empresas).
  const opc = (xs) => xs.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  // Si hay formulario de Google configurado, la solicitud va a su hoja de cálculo (privada); si no, por email.
  const envioSol = configEnvio(site.solicitudes?.enlacePrellenado, CAMPOS_SOLICITUD);
  const conGoogle = envioSol && !envioSol.error;
  const formSolicitud = site.contacto.email
    ? `<form class="solicitud" id="solicitud" data-email="${esc(site.contacto.email)}"${conGoogle ? ` data-accion="${esc(envioSol.accion)}" data-campos="${esc(JSON.stringify(envioSol.campos))}"` : ''} novalidate>
    <fieldset class="sol-tipo"><legend>Qué quieres hacer</legend>
      <label class="chip chip-radio"><input type="radio" name="tipo" value="alta" checked>Dar de alta</label>
      <label class="chip chip-radio"><input type="radio" name="tipo" value="correccion">Corregir una ficha</label>
      <label class="chip chip-radio"><input type="radio" name="tipo" value="retirada">Retirar una ficha</label>
    </fieldset>
    <div class="sol-campos">
      <label class="sol-campo"><span>Nombre comercial *</span><input name="nombre" required autocomplete="organization"></label>
      <label class="sol-campo"><span>Razón social</span><input name="razonSocial"></label>
      <label class="sol-campo"><span>País de la sede *</span><select name="pais" required><option value="">Elige</option>${opc(Object.entries(PAISES))}</select></label>
      <label class="sol-campo"><span>Localidad de la sede *</span><input name="localidad" required></label>
      <label class="sol-campo" data-solo="alta correccion"><span>Tipo de empresa *</span><select name="categoria" required><option value="">Elige</option>${opc(categorias.map((c) => [c.id, c.nombre]))}</select></label>
      <label class="sol-campo sol-ancho" data-solo="alta correccion"><span>Servicios *</span><textarea name="servicios" rows="3" required placeholder="Qué haces, para qué cargas y con qué medios"></textarea></label>
      <fieldset class="sol-campo sol-ancho" data-solo="alta correccion"><legend>Cobertura en el corredor (dónde das servicio, no tu sede)</legend>
        <div class="sol-puntos">${rutas.nodos.map((n) => `<label class="chip"><input type="checkbox" name="puntos" value="${esc(n.id)}">${esc(n.nombre)}</label>`).join('')}</div>
        <input name="cobertura" placeholder="Otras zonas o detalle de la cobertura" aria-label="Otras zonas o detalle de la cobertura">
      </fieldset>
      <label class="sol-campo"><span>Persona de contacto *</span><input name="persona" required autocomplete="name"></label>
      <label class="sol-campo"><span>Email *</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="sol-campo"><span>Teléfono o WhatsApp (con prefijo de país)</span><input name="telefono" type="tel" placeholder="+595 …" autocomplete="tel"></label>
      <label class="sol-campo"><span>Web</span><input name="web" type="url" placeholder="https://"></label>
      <label class="sol-campo sol-ancho"><span>Documentación o referencias</span><textarea name="referencias" rows="2" placeholder="Registro, habilitación, clientes que puedan dar referencias, enlaces"></textarea></label>
      <label class="sol-campo sol-ancho" data-solo="correccion retirada"><span>Qué hay que cambiar o retirar *</span><textarea name="cambio" rows="2"></textarea></label>
    </div>
    <label class="sol-acepto"><input type="checkbox" name="acepto" required> Entiendo que la solicitud se revisa antes de publicarse y que los datos aparecerán como declarados por la empresa hasta que se verifiquen.</label>
    <p class="sol-error" role="alert" hidden></p>
    <div class="acciones">
      <button class="btn btn-principal" type="submit">${conGoogle ? 'Enviar la solicitud' : `${icono('correo')}Preparar el email de solicitud`}</button>
      <button class="btn btn-borde" type="button" data-copiar>Copiar la solicitud</button>
    </div>
    <p class="sol-ok" role="status" hidden></p>
    <p class="nota">${
      conGoogle
        ? `La solicitud se guarda en una hoja privada del proyecto (Formularios de Google) para revisarla. Si tienes problemas, escríbenos a <a href="mailto:${esc(site.contacto.email)}">${esc(site.contacto.email)}</a>.`
        : `Se abre tu programa de correo con la solicitud ya escrita, dirigida a <a href="mailto:${esc(site.contacto.email)}">${esc(site.contacto.email)}</a>. Esta web no guarda nada. Si no se abre, usa «Copiar la solicitud» y pégala en un email.`
    }</p>
  </form>`
    : '<p class="sin-dato">El canal de alta se publica en breve.</p>';
  add(
    '/anunciate/',
    layout({
      titulo: 'Anunciar mi empresa',
      descripcion: 'Aparece en el punto del Corredor Bioceánico donde das servicio. Ficha básica gratis.',
      ruta: '/anunciate/',
      scripts: site.contacto.email ? ['/assets/solicitud.js'] : [],
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col anunciate-col">
    <section class="tarjeta" aria-labelledby="t-anunciate">
      <h1 id="t-anunciate">Anunciar mi empresa</h1>
      <p class="nota-pie">Aparece en tu paso, en el planificador y en el buscador. Cada alta la revisa una persona.</p>
      <div class="planes">${planes}</div>
    </section>
    <section class="tarjeta" id="alta" aria-labelledby="t-alta">
      <h2 id="t-alta">Darme de alta</h2>
      ${formSolicitud}
    </section>
  </div>
</div>`,
    })
  );
}

// HU-136: «Fuentes que vigilamos», desde el CSV de fuentes del vigilante (el mismo que usa el vigilante).
{
  const { filas } = cargarFuentesVigilancia();
  const ESTADO_FUENTE = {
    activa: ['abierto', 'Comprobada cada hora'],
    pausada: ['sin-confirmar', 'Pausada'],
    pendiente: ['sin-confirmar', 'Pendiente'],
    manual: ['restricciones', 'Manual'],
    'sin-fuente': ['cerrado', 'Sin fuente'],
  };
  const TIPO_TXT = { automatico: 'Automático', semiautomatico: 'Semiautomático', manual: 'Manual', whatsapp: 'WhatsApp', 'sin-fuente': 'Sin fuente' };
  const orden = ['BR', 'PY', 'AR', 'CL'];
  const cuenta = (e) => filas.filter((f) => f.estado === e).length;
  // V2: una línea por carretera o paso; al abrirla, cómo se lee, la regla y el enlace oficial.
  const fila = (f) => {
    const [op, txt] = ESTADO_FUENTE[f.estado];
    return `<li class="inc-tarjeta" id="f-${esc(f.id)}"><details class="inc-linea"><summary>
      ${OPERATIVA[op].icono}
      <span class="inc-que"><strong>${esc(f.tramo)}</strong><span>${esc(f.fuente)}</span><small>${[txt, f.estado === 'activa' && f.frecuencia ? `el organismo publica: ${frecuenciaCorta(f.frecuencia)}` : '', TIPO_TXT[f.tipo] || f.tipo].filter((x, k, l) => x && l.indexOf(x) === k).map(esc).join(' · ')}</small></span>
      ${icono('abajo')}</summary>
      <div class="inc-detalle"><dl class="inc-datos">
        <div><dt>Qué es</dt><dd>${esc(f.carretera_o_paso)}</dd></div>
        <div><dt>Frecuencia</dt><dd>${esc(f.frecuencia)}</dd></div>
        ${f.como_se_lee && f.como_se_lee !== '—' ? `<div><dt>Cómo se lee</dt><dd>${esc(f.como_se_lee)}</dd></div>` : ''}
        <div><dt>Regla</dt><dd>${esc(f.regla)}</dd></div>
        ${f.notas ? `<div><dt>Notas</dt><dd>${esc(f.notas)}</dd></div>` : ''}
      </dl>${f.url ? `<a class="enlace-mas" href="${esc(f.url)}" rel="noopener">Ver la fuente oficial${icono('derecha')}</a>` : ''}</div>
    </details></li>`;
  };
  const resumen = [
    ['abierto', cuenta('activa'), 'cada hora'],
    ['restricciones', cuenta('manual'), 'manuales'],
    ['sin-confirmar', cuenta('pendiente') + cuenta('pausada'), 'pendientes'],
    ['cerrado', cuenta('sin-fuente'), 'sin fuente'],
  ]
    .filter(([, n]) => n)
    .map(([op, n, txt]) => `<span class="op-${op}">${n} ${txt}</span>`)
    .join(' · ');
  add(
    '/fuentes/',
    layout({
      titulo: 'Fuentes que vigilamos',
      descripcion: 'Qué fuente oficial se lee para cada carretera y paso del Corredor Bioceánico, cada cuánto y con qué regla.',
      ruta: '/fuentes/',
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col avisos-col">
    <section class="tarjeta" aria-labelledby="t-fuentes">
      <h1 id="t-fuentes">Fuentes que vigilamos</h1>
      <p class="resumen-estados">${resumen}</p>
      ${orden
        .filter((k) => filas.some((f) => f.pais === k))
        .map((k) => `<h2 class="fuentes-pais" id="fp-${k}">${bandera(k)} ${esc(PAISES[k])}</h2><ul class="inc-lista">${filas.filter((f) => f.pais === k).map(fila).join('')}</ul>`)
        .join('')}
    </section>
    <section class="tarjeta" aria-labelledby="t-como">
      <h2 id="t-como">Cómo funciona</h2>
      <p class="nota-pie">Solo fuentes oficiales. Es la misma lista que usa el vigilante.</p>
      <div class="plegables">
        ${plegable('cada-hora', 'Comprobada cada hora', 'de 06:00 a 21:00, hora de Argentina', '<p>El vigilante lee la fuente cada hora y publica solo lo que cambia, con el sello «✓ Web oficial». Comprobar cada hora no es lo mismo que un dato de hace una hora: cada organismo publica a su ritmo (cada línea dice cuál) y si deja de publicar más de lo habitual, el tramo pasa a «Fuente atrasada».</p>')}
        ${plegable('manuales', 'Manual', 'se revisa a mano', '<p>Fuentes sin web legible (WhatsApp, redes): se revisan a mano y se cargan con su fuente y su hora.</p>')}
        ${plegable('pendientes', 'Pendiente o sin fuente', 'todavía sin lectura', '<p>No hay fuente oficial que leer todavía. El tramo sale «Sin vigilancia».</p>')}
      </div>
    </section>
  </div>
</div>`,
    })
  );
}

// Sobre la guía
add(
  '/sobre/',
  layout({
    titulo: 'Cómo trabajamos la información',
    ruta: '/sobre/',
    cuerpo: `
<div class="contenedor pagina-app">
  <header class="pagina-cabeza"><h1>Cómo trabajamos la información</h1><p>De dónde sale cada dato y qué significa lo que ves.</p></header>
  <div class="dos-col sobre-col">
    <section class="tarjeta" aria-labelledby="s-fuente"><h2 id="s-fuente">De dónde sale cada dato</h2>
      <ul class="lista-corta">
        <li><strong>Solo las fuentes oficiales deciden el estado.</strong> Lo que el vigilante lee cada hora de una web oficial lleva el sello «✓ Web oficial» y la hora de lectura.</li>
        <li>Lo que publica la prensa es contexto: va en gris, con el nombre del medio, y no cambia el estado.</li>
        <li>Una persona verifica lo que se carga a mano. Una IA nunca marca un dato como verificado.</li>
      </ul>
      <a class="btn btn-borde" href="${u('/fuentes/')}">${icono('escudo')}Fuentes que vigilamos</a>
    </section>
    <section class="tarjeta" aria-labelledby="s-estados"><h2 id="s-estados">Qué significa cada estado</h2>
      <ul class="lista-estados">
        <li>${OPERATIVA.abierto.icono}<span><strong>${OPERATIVA.abierto.texto}</strong> Se puede pasar con carga.</span></li>
        <li>${OPERATIVA.restricciones.icono}<span><strong>${OPERATIVA.restricciones.texto}</strong> Se pasa, pero hay un aviso que conviene leer.</span></li>
        <li>${OPERATIVA.cerrado.icono}<span><strong>${OPERATIVA.cerrado.texto}</strong> Hoy no se puede pasar con carga.</span></li>
        <li>${OPERATIVA['sin-confirmar'].icono}<span><strong>${OPERATIVA['sin-confirmar'].texto}</strong> Ninguna fuente oficial lo publica hoy: confírmalo.</span></li>
      </ul>
      <p class="nota-pie">Un parte de más de ${UMBRAL_PARTES_H} h se marca para que lo confirmes. Un festivo no significa que la aduana cierre.</p>
    </section>
    <section class="tarjeta" aria-labelledby="s-km"><h2 id="s-km">Distancias</h2>
      <p>Con fuente, o calculadas con OpenStreetMap y marcadas así. Si no hay ninguna, una estimación en línea recta, siempre como «estimación»: por carretera es más.</p>
    </section>
    <section class="tarjeta" aria-labelledby="s-datos"><h2 id="s-datos">Tus datos</h2>
      <p>Tu ruta se guarda solo en tu navegador. No pedimos registro. Contamos las visitas a cada página con GoatCounter, sin cookies y sin guardar datos personales: solo la página, el país y el tipo de navegador, en conjunto.${envioCruce ? ' Si cuentas tu tiempo de cruce, solo se envían el paso, el sentido, el tiempo y el día.' : ''}</p>
      <p>No transportamos mercancía ni cobramos comisiones: la contratación es directa entre empresas. Los datos son abiertos en <a href="${u('/api/v1/indice.json')}">api/v1</a>.</p>
      ${buzon('soporte') ? `<a class="btn btn-borde" href="mailto:${esc(buzon('soporte'))}?subject=${encodeURIComponent('Dato desactualizado')}">${icono('correo')}Avisar de un dato desactualizado</a>` : ''}
    </section>
  </div>
</div>`,
  })
);

// Fronteras
{
  const conteo = pasosHistoria.reduce((a, h) => {
    const e = estadoPaso(h.id);
    const op = e.confirmado ? operativaDe(e.valor, 'paso') : 'sin-confirmar';
    a[op] = (a[op] || 0) + 1;
    return a;
  }, {});
  const resumen = [
    ['abierto', 'abierto', 'abiertos'],
    ['restricciones', 'con restricciones', 'con restricciones'],
    ['cerrado', 'no habilitado', 'no habilitados'],
    ['sin-confirmar', 'sin confirmar', 'sin confirmar'],
  ]
    .filter(([k]) => conteo[k])
    .map(([k, s, pl]) => `<span class="op-${k}">${conteo[k]} ${conteo[k] === 1 ? s : pl}</span>`)
    .join(' · ');
  // Festivo en los próximos 7 días en algún país con paso: una sola línea, no en cada paso.
  const paisesPaso = new Set(fichaPasos.flatMap((p) => Object.keys(p.lados)));
  const fest = festivos.find((x) => paisesPaso.has(x.pais) && diasDesde(x.fecha) <= 0 && diasDesde(x.fecha) >= -7);
  add(
    '/pasos/',
    layout({
      titulo: 'Pasos fronterizos',
      descripcion: 'Estado y horario de cada paso fronterizo del Corredor Bioceánico, con fuente y fecha.',
      ruta: '/pasos/',
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col">
    <section class="tarjeta" aria-labelledby="t-fronteras">
      <h1 id="t-fronteras">Fronteras</h1>
      <p class="resumen-estados">${resumen}</p>
      ${tableroPasos()}
      ${fest ? `<p class="aviso-festivo">${icono('calendario')}${esc(diaSemana(fest.fecha))} ${esc(fechaCorta(fest.fecha))} · Festivo en ${esc(PAISES[fest.pais])}</p>` : ''}
      <p class="nota-pie">Toca un paso para ver su ficha: estado, papeles y calendario.</p>
    </section>
    <section class="tarjeta" aria-labelledby="t-partes">
      <h2 id="t-partes">Partes oficiales</h2>
      <p class="nota-pie">Antes de salir, mira el parte del día en su fuente.</p>
      <ul class="lista-enlaces">${organismos.filter((o) => o.tipo === 'estado-pasos').map(enlaceOrganismo).join('')}</ul>
    </section>
  </div>
</div>`,
    })
  );
}

// Avisos: obras, restricciones y meteorología
{
  const paisesI = [...new Set(incidencias.flatMap((i) => i.paises))];
  const tiposI = [...new Set(incidencias.map((i) => i.tipo))];
  // HU-136 (V2): agrupados por lo que significan para el camión. Color + forma + palabra; sello único.
  const GRAV = {
    rojo: ['cerrado', 'Impiden pasar'],
    ambar: ['restricciones', 'Con restricciones o sin confirmar'],
    info: ['sin-confirmar', 'Informativos: no cambian el veredicto'],
    resuelta: ['abierto', 'Resueltos en los últimos 15 días'],
  };
  const grav = (i) => (i.estado !== 'activa' ? 'resuelta' : i.gravedad || 'ambar');
  // V2: cada aviso es una línea (señal · lugar · qué pasa · fuente y fecha); al abrirla, el texto oficial y los datos.
  const tarjetaInc = (i) => {
    const g = grav(i);
    const op = GRAV[g][0];
    const tramosA = (i.tramos || [])
      .map((id) => tramoPorId[id])
      .filter(Boolean)
      .map((t) => {
        const gg = t.paso?.guia || t.guia;
        return gg ? `<a href="${u(`/guia/${gg}/`)}">${esc(nombreTramo(t))}</a>` : esc(nombreTramo(t));
      })
      .join(' · ');
    return `<li class="inc-tarjeta inc-${g}" id="inc-${esc(i.id)}" data-pais="${esc(i.paises.join(' '))}" data-gravedad="${g}">
  <details class="inc-linea"><summary>
    ${OPERATIVA[op].icono}
    <span class="inc-que"><strong>${esc(i.ubicacion)}</strong><span>${txtOf(i.resumen || primeraFrase(i.descripcion))}</span>
    <small>${esc(TIPOS_INCIDENCIA[i.tipo]?.[0] || i.tipo)}${i.afecta === 'carga' ? ' para carga' : ''} · ${i.publicado ? fechaCorta(i.publicado) : 'sin fecha'} ${i.paises.map(bandera).join('')}</small></span>
    ${icono('abajo')}
  </summary>
  <div class="inc-detalle">
    <p class="inc-texto">${descLarga(i.descripcion)}</p>
    <dl class="inc-datos">
      ${i.inicio ? `<div><dt>Inicio</dt><dd>${fecha(i.inicio)}</dd></div>` : ''}
      ${i.finPrevista ? `<div><dt>Fin previsto</dt><dd>${txtEs(i.finPrevista)}</dd></div>` : ''}
      ${i.impacto ? `<div><dt>Transporte pesado</dt><dd>${txtEs(i.impacto)}</dd></div>` : ''}
      ${tramosA ? `<div><dt>Afecta a</dt><dd>${tramosA}</dd></div>` : ''}
    </dl>
    <p class="sello-linea">${selloCorto(nivelReg(i, 'incidencia'), i.verificado, i.fuente, i.publicado)}${otras(i)}</p>
  </div></details>
</li>`;
  };
  const ordenG = ['rojo', 'ambar', 'info', 'resuelta'];
  const hace15 = new Date(new Date(`${HOY}T12:00:00Z`).getTime() - 15 * 864e5).toISOString().slice(0, 10);
  const visibles = incidencias.filter((i) => i.estado === 'activa' || (i.fin || i.publicado || '') >= hace15);
  const grupos = ordenG.map((g) => [g, visibles.filter((i) => grav(i) === g)]).filter(([, l]) => l.length);
  const listaInc = grupos.map(([g, l]) => `<li class="inc-grupo" data-cabecera id="g-${g}"><h3>${GRAV[g][1]} <span class="inc-cuenta">${l.length}</span></h3></li>${l.map(tarjetaInc).join('')}`).join('');
  const porPais = Object.keys(PAISES).map((k) => {
    const de = (t) => organismos.filter((o) => o.pais === k && t.includes(o.tipo));
    return `<tr><th scope="row">${esc(PAISES[k])}</th>
      <td data-l="Alertas meteorológicas">${de(['meteorologia']).map((o) => `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`).join('<br>') || '<span class="sin-dato">Sin enlace verificado</span>'}</td>
      <td data-l="Estado de rutas y pasos">${de(['vialidad', 'estado-pasos']).map((o) => `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`).join('<br>') || '<span class="sin-dato">Sin enlace verificado</span>'}</td></tr>`;
  });
  add(
    '/avisos/',
    layout({
      titulo: 'Obras, restricciones y alertas',
      descripcion: 'Obras, cortes y restricciones del Corredor Bioceánico, y enlaces a las alertas meteorológicas oficiales de cada país.',
      ruta: '/avisos/',
      scripts: ['/assets/filtros.js'],
      cuerpo: `
<div class="contenedor pagina-app">
  <div class="dos-col avisos-col">
    <section class="tarjeta" aria-labelledby="t-avisos">
      <h1 id="t-avisos">Avisos</h1>
      <div class="filtros-noticias" data-filtros="#lista-inc">
        <div class="chips" role="group" aria-label="Qué significan">
          <button class="chip" type="button" data-filtro="gravedad" data-valor="" aria-pressed="true">Todos ${incidencias.length}</button>
          ${grupos.map(([g, l]) => `<button class="chip chip-${g}" type="button" data-filtro="gravedad" data-valor="${g}" aria-pressed="false">${{ rojo: 'Impiden', ambar: 'Limitan', info: 'Informativos', resuelta: 'Resueltos' }[g]} ${l.length}</button>`).join('')}
        </div>
        <div class="chips" role="group" aria-label="País">
          <button class="chip" type="button" data-filtro="pais" data-valor="" aria-pressed="true">Todos</button>
          ${paisesI.map((p) => `<button class="chip" type="button" data-filtro="pais" data-valor="${esc(p)}" aria-pressed="false" aria-label="${esc(PAISES[p])}" title="${esc(PAISES[p])}">${bandera(p)}</button>`).join('')}
        </div>
      </div>
      <ul class="inc-lista" id="lista-inc">${listaInc}</ul>
      <div class="vacio" data-vacio hidden><p>No hay avisos con esos filtros.</p><button class="btn btn-borde" type="button" data-limpiar>Quitar filtros</button></div>
    </section>
    <div class="ficha-lado">
      ${mapaTarjeta({ clase: 'solo-ancho' })}
      <section class="tarjeta plegables" aria-label="Más información">
        ${plegable('meteorologia', 'Meteorología y estado de rutas', avisosMeteo.length ? plural(avisosMeteo.length, 'aviso vigente', 'avisos vigentes') : 'enlaces oficiales por país', `${
          avisosMeteo.length
            ? `<ul class="inc-lista">${avisosMeteo.map((a) => `<li class="inc-tarjeta"><h3>${esc(a.titulo)}</h3><p>${esc(a.zona)}</p><p class="inc-revisado">Vigente hasta el ${fecha(a.vigenteHasta)}. Fuente: ${fuenteEnlace(a.fuente)}</p></li>`).join('')}</ul>`
            : ''
        }<div class="tabla-marco"><table class="tabla-oficial">
          <thead><tr><th scope="col">País</th><th scope="col">Alertas meteorológicas</th><th scope="col">Estado de rutas y pasos</th></tr></thead>
          <tbody>${porPais.join('')}</tbody></table></div>
          <p class="nota-pie">En Jama y Sico el viento blanco, la nieve y el hielo pueden cerrar la ruta en pocas horas.</p>`)}
        ${plegable('novedades', 'Novedades recientes', 'avances de obras y acuerdos', `<ul class="lista-noticias">${recientes.slice(0, 3).map((n) => `<li>${noticia(n)}</li>`).join('')}</ul><a class="enlace-mas" href="${u('/novedades/')}">Ver todas las novedades${icono('derecha')}</a>`)}
      </section>
    </div>
  </div>
</div>`,
    })
  );
}

// Calendario aduanero (V3): una pantalla. A la izquierda, ¿qué día cruzas? y el mes en cuadrícula con los festivos
// de cada país; a la derecha, el próximo feriado de cada país y los horarios de cada paso, plegados.
{
  const ORGANISMOS_CAL = { general: 'Feriado nacional', aduana: 'Aduana', migraciones: 'Migraciones', sanitario: 'Sanitario', complejo: 'Complejo fronterizo' };
  const ym = (iso) => iso.slice(0, 7);
  const meses = [];
  for (let m = ym(HOY < festivosDoc.desde ? festivosDoc.desde : HOY); m <= ym(festivosDoc.hasta); ) {
    meses.push(m);
    const [y, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  const nombreMes = (m) => {
    const t = new Date(m + '-15T12:00:00Z').toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return t[0].toUpperCase() + t.slice(1);
  };
  const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const mesHTML = (m, i) => {
    const [y, mm] = m.split('-').map(Number);
    const primero = (new Date(Date.UTC(y, mm - 1, 1)).getUTCDay() + 6) % 7;
    const n = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    const delMes = festivos.filter((f) => f.fecha.startsWith(m));
    const celdas = [...Array(primero)].map(() => '<span class="cal-dia vacio" aria-hidden="true"></span>');
    for (let d = 1; d <= n; d++) {
      const iso = `${m}-${String(d).padStart(2, '0')}`;
      const fs = delMes.filter((f) => f.fecha === iso);
      const cls = ['cal-dia', fs.length ? 'con-fest' : '', iso === HOY ? 'hoy' : '', iso < HOY ? 'pasado' : ''].filter(Boolean).join(' ');
      const titulo = fs.map((f) => `${f.nombre} (${PAISES[f.pais]})`).join('; ');
      celdas.push(
        `<button type="button" class="${cls}" data-dia="${iso}" data-paises="${esc([...new Set(fs.map((f) => f.pais))].join(' '))}"${titulo ? ` title="${esc(titulo)}"` : ''} aria-label="${esc(`${d} de ${nombreMes(m).split(' ')[0].toLowerCase()}${titulo ? `: ${titulo}` : ''}`)}"><span class="cal-num">${d}</span>${fs.length ? `<span class="cal-banderas">${[...new Set(fs.map((f) => f.pais))].map(bandera).join('')}</span>` : ''}</button>`
      );
    }
    const lista = delMes.length
      ? `<ul class="cal-lista">${delMes
          .map(
            (f) => `<li data-pais="${esc(f.pais)}"><details class="plegable cal-fest"><summary><span class="plegable-titulo">${filaFestivoCorta(f)}</span></summary><div class="plegable-cuerpo">${validacionHTML(nivelReg(f, 'festivo'), f.verificado, f.fuente)} ${f.nota ? `${txtEs(f.nota)} ` : ''}Norma: ${fuenteEnlace(f.fuente)}</div></details></li>`
          )
          .join('')}</ul>`
      : '<p class="sin-dato">Ningún festivo cargado este mes.</p>';
    return `<section class="cal-mes" data-mes="${m}"${i ? ' hidden' : ''} aria-label="${esc(nombreMes(m))}">
      <div class="cal-mes-cab"><button type="button" class="boton-icono" data-mes-ir="-1" aria-label="Mes anterior"${i ? '' : ' disabled'}>${icono('izquierda')}</button><h2>${esc(nombreMes(m))}</h2><button type="button" class="boton-icono" data-mes-ir="1" aria-label="Mes siguiente"${i === meses.length - 1 ? ' disabled' : ''}>${icono('derecha')}</button></div>
      <div class="cal-rejilla"><span class="cal-sem" aria-hidden="true">${DIAS.join('</span><span class="cal-sem" aria-hidden="true">')}</span>${celdas.join('')}</div>
      ${lista}
    </section>`;
  };
  const filaFestivoCorta = (f) => `<span class="fila-fest"><time datetime="${esc(f.fecha)}"><span>${esc(diaSemana(f.fecha))}</span>${esc(fechaCorta(f.fecha))}</time>${bandera(f.pais)}<span class="fest-nombre">${esc(f.nombre)}${f.tipo !== 'feriado' ? `<span class="etiqueta-suave">${esc(TIPOS_FESTIVO[f.tipo])}</span>` : ''}${f.validacion !== 'verificado' ? '<span class="etiqueta-suave">Por confirmar</span>' : ''}</span></span>`;
  const proximos = Object.keys(PAISES)
    .map((k) => {
      const f = festivos.find((x) => x.pais === k && x.tipo === 'feriado' && x.fecha >= HOY);
      return f ? `<li>${bandera(k)}<span class="prox-pais">${esc(PAISES[k])}</span><strong>${esc(diaSemana(f.fecha))} ${esc(fechaCorta(f.fecha))}</strong><span class="prox-nombre">${esc(f.nombre)}</span></li>` : '';
    })
    .join('');
  const paisesDeLado = (lado, p) => {
    const ks = Object.keys(PAISES).filter((k) => lado.includes(k));
    return ks.length ? ks : Object.keys(p.lados);
  };
  const lineaHorario = (h, p) => `<li><p class="cal-h-quien">${paisesDeLado(h.lado || '', p).map(bandera).join('')} <strong>${esc(ORGANISMOS_CAL[h.organismo] || h.organismo || 'Complejo fronterizo')}</strong></p><p lang="es" class="txt-es">${esc(h.texto)}</p><p class="dato-fuente">${fuenteEnlace(h.fuente)}${h.publicado ? `, ${fechaCorta(h.publicado)}` : ''} · ${validacionHTML(nivelReg(h, 'horario'), h.verificado, h.fuente)}</p></li>`;
  const horariosPaso = fichaPasos
    .filter((p) => (p.horarios || []).length)
    .map((p) => plegable(`h-${p.id}`, esc(p.nombre.replace(/\s*\(.*?\)/g, '')), plural(p.horarios.length, 'horario', 'horarios'), `<ul class="cal-horarios">${p.horarios.map((h) => lineaHorario(h, p)).join('')}</ul><a class="enlace-mas" href="${u(`/guia/${guiaDePaso[p.id]}/`)}">Ficha del paso</a>`))
    .join('');
  const especiales = fichaPasos.flatMap((p) => (p.horariosEspeciales || []).map((h) => ({ p, h })));
  add(
    '/calendario/',
    layout({
      titulo: 'Calendario aduanero',
      descripcion: 'Festivos y horarios de atención en fronteras de Brasil, Paraguay, Argentina y Chile, con su fuente y su estado de verificación.',
      ruta: '/calendario/',
      scripts: ['/assets/ahora.js', '/assets/calendario.js'],
      cuerpo: `
<div class="contenedor pagina-app calendario-v3">
  <div class="dos-col">
    <section class="tarjeta" aria-labelledby="t-cal">
      <header class="cal-cab"><div><h1 id="t-cal">Calendario aduanero</h1><p class="texto-suave">Festivos y horarios de frontera de los cuatro países, con su norma o su fuente.</p></div>
        <button class="ib no-imprimir" type="button" onclick="window.print()" aria-label="Imprimir" title="Imprimir">${icono('imprimir')}</button></header>
      <div class="chips cal-paises" role="group" aria-label="País"><button class="chip" type="button" data-pais="" aria-pressed="true">Todos</button>${Object.entries(PAISES)
        .map(([k, n]) => `<button class="chip" type="button" data-pais="${k}" aria-pressed="false">${bandera(k)}${esc(n)}</button>`)
        .join('')}</div>
      ${meses.map(mesHTML).join('')}
      <p class="dato-fuente">Un festivo no implica que la aduana cierre. Festivos cargados del ${fecha(festivosDoc.desde)} al ${fecha(festivosDoc.hasta)}.</p>
      ${plegable('cal-pendiente', 'Qué falta por verificar', plural((festivosDoc.pendiente || []).length + 1, 'punto', 'puntos'), `<ul class="lista-datos">${(festivosDoc.pendiente || []).map((x) => `<li>${esc(x)}</li>`).join('')}<li>Horarios del lado paraguayo y chileno de cada paso.</li></ul>`)}
    </section>
    <div class="guia-lado">
      <section class="tarjeta cal-cuando-tarjeta" aria-label="¿Qué día cruzas?">${calendarioPaso({ lados: Object.fromEntries(Object.keys(PAISES).map((k) => [k, PAISES[k]])) }, { proximos: false })}</section>
      <section class="tarjeta" aria-labelledby="t-prox"><h2 id="t-prox">Próximo feriado en cada país</h2><ul class="cal-proximos">${proximos}</ul></section>
      <section class="tarjeta" aria-labelledby="t-horarios"><h2 id="t-horarios">Horarios de atención</h2>
        <p class="texto-suave">En hora local de cada paso. La situación de hoy, en la ficha del paso.</p>
        ${horariosPaso}
        <p class="dato-fuente">${especiales.length ? `<strong>Horarios especiales:</strong> ${especiales.map(({ p, h }) => `${esc(p.nombre)}, ${fecha(h.desde)} – ${fecha(h.hasta)}: <span lang="es" class="txt-es">${esc(h.texto)}</span>`).join('; ')}` : 'Ningún horario especial publicado. Si se anuncia uno, aparecerá aquí con sus fechas.'}</p>
      </section>
    </div>
  </div>
</div>`,
    })
  );
}

// Papeles y operativa aduanera
{
  const alcance = (t) => `<span class="alcance">${esc(t)}</span>`;
  const org = (id) => {
    const o = organismoPorId[id];
    return `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`;
  };
  const tablaOrg = Object.keys(PAISES)
    .map((k) => {
      const de = (t) => organismos.filter((o) => o.pais === k && t.includes(o.tipo)).map((o) => `<a href="${esc(o.url)}" rel="noopener">${esc(o.nombre)}</a>`).join('<br>') || '<span class="sin-dato">Sin enlace verificado</span>';
      return `<tr><th scope="row">${esc(PAISES[k])}</th><td data-l="Aduana y trámites">${de(['aduana', 'tramite'])}</td><td data-l="Sanidad">${de(['sanitario'])}</td><td data-l="Migraciones y transporte">${de(['migraciones', 'transporte'])}</td></tr>`;
    })
    .join('');
  const docGuia = guiaPorRuta['documentos/crt-mic-dta'];
  add(
    '/papeles/',
    layout({
      titulo: 'Papeles y trámites aduaneros',
      descripcion: 'Documentos de transporte internacional, tránsito aduanero y controles sanitarios en el Corredor Bioceánico, con los organismos de cada país.',
      ruta: '/papeles/',
      scripts: ['/assets/ahora.js'],
      cuerpo: `
<div class="contenedor">
  <header class="cabeza-pagina"><h1>Papeles y trámites aduaneros</h1><p>Qué documentos lleva un camión por el corredor y qué organismo los controla en cada país.</p></header>
  <p class="aviso"><span><strong>Orientativo.</strong> Los requisitos exactos dependen de la mercancía, el régimen y el país. Confírmalos con tu despachante.</span><button class="btn btn-borde btn-pequeno" type="button" onclick="window.print()">${icono('imprimir')}Imprimir</button></p>
  <div class="papeles-pagina">
    <section aria-labelledby="t-pap-gen" class="papeles-tu-lista">
      <h2 id="t-pap-gen">Tu lista de papeles ${alcance('Según la carga')}</h2>
      ${papelesPaso({ lados: Object.fromEntries(Object.keys(PAISES).map((k) => [k, PAISES[k]])) }, { porPais: false })}
      ${docGuia ? `<a class="enlace-mas" href="${u(docGuia.ruta)}">Para qué sirve el CRT y el MIC/DTA</a>` : ''}
    </section>
    <section aria-labelledby="t-pap-tr">
      <h2 id="t-pap-tr">Tránsito aduanero ${alcance('Por país')}</h2>
      <dl class="datos">
        <div class="dato-fila"><dt>Brasil</dt><dd>El tránsito se declara en Siscomex Trânsito; el MIC-DTA ampara cargas de entrada, salida o paso. ${org('br-transito')}</dd></div>
        <div class="dato-fila"><dt>Argentina</dt><dd>MIC/DTA electrónico para tránsitos de importación y exportación (Resolución General 2.619, sistema SINTIA). ${org('ar-arca')}</dd></div>
        <div class="dato-fila"><dt>Paraguay</dt><dd>Sistemas aduaneros de la DNIT, entre ellos SOFIA y el seguimiento vehicular (SSV). ${org('py-dnit')}</dd></div>
        <div class="dato-fila"><dt>Chile</dt><dd><span class="sin-dato">Procedimiento de tránsito pendiente de verificar.</span> ${org('cl-aduanas')}</dd></div>
      </dl>
    </section>
    <section aria-labelledby="t-pap-san">
      <h2 id="t-pap-san">Controles sanitarios y fitosanitarios ${alcance('Por mercancía')}</h2>
      <p>Se aplican a cargas de origen animal o vegetal (granos, refrigerados…).</p>
      <dl class="datos">
        <div class="dato-fila"><dt>Argentina</dt><dd>Los productos de origen vegetal o animal en tránsito necesitan el Permiso Fitozoosanitario de Tránsito Internacional (PFTI), que gestiona el agente de transporte aduanero en la frontera de ingreso. ${org('ar-senasa')}</dd></div>
        <div class="dato-fila"><dt>Paraguay</dt><dd>La exportación de productos vegetales requiere certificado fitosanitario del SENAVE, que se solicita por la Ventanilla Única de Exportación (VUE). ${org('py-senave')}</dd></div>
        <div class="dato-fila"><dt>Chile</dt><dd>El SAG controla en frontera la carga de importación y la carga en tránsito hacia terceros países. ${org('cl-sag')}</dd></div>
        <div class="dato-fila"><dt>Brasil</dt><dd><span class="sin-dato">Pendiente de verificar.</span></dd></div>
      </dl>
    </section>
    <section aria-labelledby="t-pap-esp">
      <h2 id="t-pap-esp">Mercancías especiales ${alcance('Por mercancía')}</h2>
      <p>Mercancías peligrosas: Paraguay publica la normativa MERCOSUR aplicable (fichas de emergencia, rótulos y paneles de riesgo). ${org('py-dinatran')}</p>
      <p class="sin-dato">Requisitos del resto de países pendientes de verificar.</p>
    </section>
    <section aria-labelledby="t-pap-org">
      <h2 id="t-pap-org">Organismos por país</h2>
      <div class="tabla-marco"><table class="tabla-oficial">
        <thead><tr><th scope="col">País</th><th scope="col">Aduana y trámites</th><th scope="col">Sanidad</th><th scope="col">Migraciones y transporte</th></tr></thead>
        <tbody>${tablaOrg}</tbody>
      </table></div>
    </section>
  </div>
</div>`,
    })
  );
}

// Buscador interno
{
  const indice = [
    ...fichaPasos.map((p) => {
      const g = rutas.tramos.flatMap((t) => [t.paso, t.alternativa]).find((q) => q?.id === p.id)?.guia;
      return { t: p.nombre, d: `Paso fronterizo. ${p.ubicacion.texto}`, u: u(`/guia/${g}/`), k: 'Paso fronterizo' };
    }),
    ...guia.filter((p) => p.seccion !== 'pasos').map((p) => ({ t: p.meta.titulo, d: p.meta.resumen, u: u(p.ruta), k: SECCIONES[p.seccion] })),
    ...incidencias.map((i) => ({ t: `${i.ubicacion}: ${TIPOS_INCIDENCIA[i.tipo]?.[0] || i.tipo}`, d: i.descripcion, u: u('/avisos/#obras'), k: 'Obra o restricción' })),
    ...festivos.map((f) => ({ t: `${f.nombre} (${PAISES[f.pais]})`, d: `${fecha(f.fecha)}. ${TIPOS_FESTIVO[f.tipo]}${f.validacion !== 'verificado' ? ', por confirmar' : ''}.`, u: u('/calendario/'), k: 'Festivo' })),
    ...novedades.map((n) => ({ t: n.titulo, d: n.detalle || '', u: n.fuente.url, k: `Novedad, ${n.fuente.nombre}` })),
    ...organismos.map((o) => ({ t: o.nombre, d: `Organismo oficial de ${PAISES[o.pais]}`, u: o.url, k: 'Enlace oficial' })),
    ...empresas.map((e) => ({ t: e.nombre, d: `${catNombre[e.categoria] || ''}, ${e.ciudad}`, u: u(`/directorio/?q=${encodeURIComponent(e.nombre)}`), k: 'Empresa' })),
    { t: 'Papeles y trámites aduaneros', d: 'CRT, MIC/DTA, tránsito aduanero y controles sanitarios por país.', u: u('/papeles/'), k: 'Página' },
    { t: 'Planificar ruta', d: 'Compara rutas, fronteras, papeles y empresas de origen a destino.', u: u('/planificador/'), k: 'Página' },
  ];
  paginas.push({ ruta: '/assets/indice.json', html: JSON.stringify(indice), archivo: true });
  add(
    '/buscar/',
    layout({
      titulo: 'Buscar',
      descripcion: 'Busca pasos, obras, festivos, papeles y empresas del Corredor Bioceánico.',
      ruta: '/buscar/',
      scripts: ['/assets/buscar.js'],
      cuerpo: `
<div class="contenedor contenedor-estrecho">
  <header class="cabeza-pagina"><h1>Buscar en la guía</h1><p>Pasos, obras, festivos, papeles, organismos y empresas.</p></header>
  <form class="busqueda-web" role="search" action="${u('/buscar/')}" method="get">
    <label class="sr" for="q">Qué buscas</label>
    ${icono('buscar')}<input id="q" name="q" type="search" placeholder="Jama, MIC/DTA, festivo, Salta…" autocomplete="off" data-indice="${u('/assets/indice.json')}">
  </form>
  <p class="buscar-estado" id="buscar-estado" role="status"></p>
  <ul class="resultados" id="resultados"></ul>
  <noscript><p class="aviso">Activa JavaScript para buscar.</p></noscript>
</div>`,
    })
  );
}

// 404
paginas.push({
  ruta: '/404.html',
  html: layout({
    titulo: 'Página no encontrada',
    ruta: '/404.html',
    cuerpo: `<div class="contenedor"><header class="cabeza-pagina"><h1>Esta página no existe</h1><p>El enlace puede estar mal o la página se ha movido.</p></header><div class="acciones"><a class="btn btn-principal" href="${u(
      '/'
    )}">Ir al inicio</a><a class="btn btn-borde" href="${u('/guia/')}">Abrir la guía</a></div></div>`,
  }),
});

// HU-135: versión en portugués de Brasil de Hoy, Rutas, Fronteras, fichas de paso y Servicios (/pt/…).
{
  const frases = cargarDiccionario();
  // Títulos y resúmenes de la guía traducidos (salen también en listas y menús).
  for (const p of guia) if (guiaPT[p.ruta]) Object.assign(frases, { [p.meta.titulo]: guiaPT[p.ruta].titulo, [p.meta.resumen]: guiaPT[p.ruta].resumen });
  const trPT = compilar(frases);
  const guiaRuta = Object.fromEntries(guia.map((p) => [p.ruta, p]));
  const conGuiaPT = (ruta, html) => {
    const g = guiaRuta[ruta];
    const t = guiaPT[ruta];
    if (!g || !t) return html;
    // Mismas anclas que en español, en el mismo orden (el índice de la página apunta a ellas).
    let n = 0;
    const cuerpo = t.html.replace(/<h2 id="[^"]*">/g, (m) => (g.indice[n] ? `<h2 id="${g.indice[n++].id}">` : m));
    return html.replace(/<!--es--><div class="contenido-es" lang="es">[\s\S]*?<\/div><!--\/es-->/, `<!--pt--><div class="contenido-pt"><p class="resumen">${esc(t.resumen)}</p>\n${cuerpo}</div><!--/pt-->`);
  };
  const urlBasePT = site.url.replace(/\/$/, '') + B;
  // El diccionario va en un archivo aparte (antes, ~76 KB dentro de cada página en portugués): se descarga una vez y queda en caché.
  paginas.push({ ruta: '/assets/idioma-pt.js', archivo: true, html: `window.GC_IDIOMA = ${JSON.stringify({ frases, rutas: ['*'] })};\n` });
  const conIdioma = (html) => html.replace(`<script src="${u('/assets/comun.js')}" defer></script>`, `<script src="${u('/assets/idioma-pt.js')}" defer></script>\n<script src="${u('/assets/comun.js')}" defer></script>`);
  for (const p of paginas.filter((x) => !x.archivo && tienePT(x.ruta)))
    paginas.push({ ruta: `/pt${p.ruta}`, html: conIdioma(traducirHTML(conGuiaPT(p.ruta, p.html), trPT, { B, urlBase: urlBasePT, ruta: p.ruta })) });
}

// ---------- escribir ----------
fs.rmSync(DIST, { recursive: true, force: true });
for (const { ruta, html } of paginas.filter((p) => !p.archivo)) {
  const destino = ruta.endsWith('.html') ? path.join(DIST, ruta) : path.join(DIST, ruta, 'index.html');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, html);
}
fs.cpSync(path.join(ROOT, 'src', 'assets'), path.join(DIST, 'assets'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'data', 'fuentes-vigilancia.csv'), path.join(DIST, 'assets', 'fuentes-vigilancia.csv'));
for (const { ruta, html } of paginas.filter((p) => p.archivo)) fs.writeFileSync(path.join(DIST, ruta), html);

// HU-115: MapLibre GL (código abierto) alojado en la propia web. Opcional: si no está instalado,
// la página del mapa muestra el esquema SVG de siempre.
try {
  const dirML = path.join(path.dirname(require.resolve('maplibre-gl/package.json')), 'dist');
  fs.mkdirSync(path.join(DIST, 'assets', 'vendor'), { recursive: true });
  for (const f of ['maplibre-gl.js', 'maplibre-gl.css']) fs.copyFileSync(path.join(dirML, f), path.join(DIST, 'assets', 'vendor', f));
} catch {
  console.warn('Aviso: no está instalado maplibre-gl; el mapa interactivo usará el esquema SVG.');
}

// Tipografías DM Sans y DM Mono alojadas en la propia web (opcional: si no están instaladas, se usa la de sustitución).
{
  const destino = path.join(DIST, 'assets', 'fonts');
  fs.mkdirSync(destino, { recursive: true });
  const copiar = (paquete, pares) => {
    try {
      const dir = path.join(path.dirname(require.resolve(`${paquete}/package.json`)), 'files');
      const hay = fs.readdirSync(dir);
      for (const [prefijo, nombre] of pares) {
        const f = hay.find((x) => x.startsWith(prefijo) && x.endsWith('.woff2'));
        if (f) fs.copyFileSync(path.join(dir, f), path.join(destino, nombre));
        else console.warn(`Aviso: ${paquete} no trae ${prefijo}*.woff2.`);
      }
    } catch {
      console.warn(`Aviso: no está instalada la tipografía ${paquete}; se usará la de sustitución.`);
    }
  };
  copiar('@fontsource-variable/dm-sans', [['dm-sans-latin-wght-normal', 'dm-sans-latin.woff2'], ['dm-sans-latin-ext-wght-normal', 'dm-sans-latin-ext.woff2']]);
  copiar('@fontsource/dm-mono', [['dm-mono-latin-400-normal', 'dm-mono-latin-400.woff2'], ['dm-mono-latin-500-normal', 'dm-mono-latin-500.woff2']]);
}

// HU-133 (R10): service worker para ver la web sin cobertura. Páginas: primero la red y, si no hay, lo último guardado.
// Dos cachés para no volver a descargar todo en cada publicación (se publica varias veces al día por los datos):
// - archivos (estilos, scripts, diccionario): versión = huella de su contenido; solo cambia si cambian ellos.
// - páginas: una caché fija; se guarda cada página que se visita y, al instalar, solo las básicas que aún no estén.
{
  const archivos = ['/assets/styles.css', '/assets/comun.js', '/assets/inicio.js', '/assets/planificador.js', '/assets/ahora.js'];
  const huella = createHash('sha256').update(archivos.map((a) => fs.readFileSync(path.join(DIST, a))).join('')).digest('hex').slice(0, 12);
  const basicas = ['/', '/planificador/', '/pasos/', ...guia.filter((g) => pasoPorGuia[`${g.seccion}/${g.slug}`]).map((g) => g.ruta)];
  fs.writeFileSync(
    path.join(DIST, 'sw.js'),
    `// Generado por scripts/build.mjs (HU-133). Archivos: ${huella}
const ARCHIVOS = 'guia-archivos-${huella}';
const PAGINAS = 'guia-paginas';
const LISTA_ARCHIVOS = ${JSON.stringify(archivos.map(u))};
const BASICAS = ${JSON.stringify(basicas.map(u))};
self.addEventListener('install', (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(ARCHIVOS).then((c) => Promise.allSettled(LISTA_ARCHIVOS.map((x) => c.add(x)))),
      caches.open(PAGINAS).then((c) => Promise.allSettled(BASICAS.map((x) => c.match(x).then((m) => m || c.add(x))))),
    ]).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('guia-') && k !== ARCHIVOS && k !== PAGINAS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(PAGINAS).then((c) => c.put(r, copia));
          }
          return res;
        })
        .catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match(BASICAS[0])))
    );
    return;
  }
  e.respondWith(
    caches.match(r).then((m) => {
      const red = fetch(r)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(ARCHIVOS).then((c) => c.put(r, copia));
          }
          return res;
        })
        .catch(() => m);
      return m || red;
    })
  );
});
`
  );
}

const urlBase = site.url.replace(/\/$/, '') + B;
const hoy = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginas
  .filter((p) => !p.ruta.endsWith('.html') && !p.archivo)
  .map((p) => `  <url><loc>${urlBase}${p.ruta}</loc><lastmod>${hoy}</lastmod></url>`)
  .join('\n')}
</urlset>
`
);
fs.writeFileSync(
  path.join(DIST, 'robots.txt'),
  site.indexable === false ? 'User-agent: *\nAllow: /api/\nDisallow: /\n' : `User-agent: *\nAllow: /\nSitemap: ${urlBase}/sitemap.xml\n`
);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

// Exportación api/v1 y esquemas públicos (mismos datos y estados que las páginas).
const api = generarApi({ D, HOY, site, urlBase, nivelReg, estadoPaso, nodoNombre });
fs.mkdirSync(path.join(DIST, 'api', 'v1'), { recursive: true });
for (const [f, o] of Object.entries(api)) fs.writeFileSync(path.join(DIST, 'api', 'v1', f), JSON.stringify(o, null, 2) + '\n');
fs.cpSync(path.join(ROOT, 'data', 'esquemas'), path.join(DIST, 'esquemas'), { recursive: true });

console.log(`OK: ${paginas.filter((p) => !p.archivo).length} páginas en dist/ (${guia.length} de guía, ${empresas.length} empresas, ${novedades.length} novedades) y api/v1 (${Object.keys(api).length} archivos).`);
