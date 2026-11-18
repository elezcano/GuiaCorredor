// HU-136: mapa de fuentes del vigilante en un CSV plano (data/fuentes-vigilancia.csv).
// Una fila por carretera o paso y fuente. El vigilante solo lee las filas «activa»; el resto se publica
// en la página «Fuentes» para saber qué está vigilado, qué es manual y qué falta.
//
// Columnas que usa el vigilante (cerradas):
//   estado   activa | pausada | pendiente | manual | sin-fuente
//   lector   gendarmeria-paso | vialidad-ar | siemop-cl | mopc-pdf | dnit-alertas | siemop-pasos | whatsapp | manual | ninguno
//   fuente_id  id de data/fuentes.json (obligatorio en las filas activas: la dirección sale de allí)
//   destino  paso:<id de data/pasos.json> o tramo:<id de data/rutas.json>
//   filtro   pares clave=valor separados por «;»; listas con «|»
//            vialidad-ar: provincia=Jujuy;ruta=9;tramos=S.S. de Jujuy|Yala - Volcán   (tramos=* : todos)
//            siemop-cl:   regiones=01|02;km=3;dias_sin_novedad=14;max_horas=192
// El resto de columnas (fuente, organismo, frecuencia, regla, notas…) son para leer.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

export const ARCHIVO = path.join(ROOT, 'data', 'fuentes-vigilancia.csv');
export const COLUMNAS = ['id', 'pais', 'tramo', 'carretera_o_paso', 'fuente', 'organismo', 'url', 'formato', 'frecuencia', 'como_se_lee', 'tipo', 'estado', 'lector', 'fuente_id', 'destino', 'filtro', 'regla', 'notas'];
export const ESTADOS = ['activa', 'pausada', 'pendiente', 'manual', 'sin-fuente'];
export const LECTORES = ['gendarmeria-paso', 'vialidad-ar', 'siemop-cl', 'mopc-pdf', 'dnit-alertas', 'siemop-pasos', 'whatsapp', 'manual', 'ninguno'];
/** Lectores que el vigilante sabe ejecutar hoy. */
export const LECTORES_AUTOMATICOS = ['gendarmeria-paso', 'vialidad-ar', 'siemop-cl', 'mopc-pdf'];
export const TIPOS = ['automatico', 'semiautomatico', 'manual', 'whatsapp', 'sin-fuente'];

/** CSV (RFC 4180: comas, comillas dobles, saltos de línea dentro de comillas) → filas de texto. */
export function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((x) => x.trim()));
}

/** «a=1;b=x|y» → { a: '1', b: 'x|y' } */
export const leerFiltro = (s) => Object.fromEntries((s || '').split(';').map((p) => p.trim()).filter(Boolean).map((p) => [p.slice(0, p.indexOf('=')).trim(), p.slice(p.indexOf('=') + 1).trim()]));
/** «paso:jama» → { paso: 'jama' }; «tramo:pozo-hondo» → { tramo: 'pozo-hondo' } */
export const leerDestino = (s) => {
  const [k, v] = (s || '').split(':');
  return k && v ? { [k]: v } : null;
};

export function cargar(texto = fs.readFileSync(ARCHIVO, 'utf8')) {
  const [cab, ...resto] = parseCSV(texto);
  return { cabecera: cab, filas: resto.map((f) => Object.fromEntries(COLUMNAS.map((c) => [c, (f[cab.indexOf(c)] ?? '').trim()]))) };
}

/** Errores del CSV: columnas, valores cerrados y referencias a fuentes, pasos y tramos que existan. */
export function validar({ cabecera, filas }, { fuentes = new Map(), pasos = new Set(), tramos = new Set() } = {}) {
  const e = [];
  const donde = (f, i) => `data/fuentes-vigilancia.csv, fila ${i + 2} (${f.id || 'sin id'})`;
  const faltan = COLUMNAS.filter((c) => !cabecera?.includes(c));
  if (faltan.length) return [`data/fuentes-vigilancia.csv: faltan columnas: ${faltan.join(', ')}.`];
  const ids = new Set();
  filas.forEach((f, i) => {
    const d = donde(f, i);
    if (!/^[a-z0-9-]+$/.test(f.id)) e.push(`${d}: id vacío o con caracteres no válidos.`);
    if (ids.has(f.id)) e.push(`${d}: id repetido.`);
    ids.add(f.id);
    if (!['AR', 'BR', 'CL', 'PY'].includes(f.pais)) e.push(`${d}: país «${f.pais}» no válido (AR, BR, CL, PY).`);
    if (!ESTADOS.includes(f.estado)) e.push(`${d}: estado «${f.estado}» no válido (${ESTADOS.join(', ')}).`);
    if (!LECTORES.includes(f.lector)) e.push(`${d}: lector «${f.lector}» no válido (${LECTORES.join(', ')}).`);
    if (!TIPOS.includes(f.tipo)) e.push(`${d}: tipo «${f.tipo}» no válido (${TIPOS.join(', ')}).`);
    if (f.url && !/^https:\/\//.test(f.url)) e.push(`${d}: la dirección debe empezar por https://.`);
    if (f.destino) {
      const g = leerDestino(f.destino);
      if (!g || !(g.paso || g.tramo)) e.push(`${d}: destino «${f.destino}» no válido (paso:<id> o tramo:<id>).`);
      else if (g.paso && pasos.size && !pasos.has(g.paso)) e.push(`${d}: el paso «${g.paso}» no existe en data/pasos.json.`);
      else if (g.tramo && tramos.size && !tramos.has(g.tramo)) e.push(`${d}: el tramo «${g.tramo}» no existe en data/rutas.json.`);
    }
    if (f.estado !== 'activa') return;
    // Una fila activa tiene que poder ejecutarse.
    if (!LECTORES_AUTOMATICOS.includes(f.lector)) e.push(`${d}: activa, pero el vigilante todavía no sabe leer «${f.lector}» (pon estado «pendiente»).`);
    if (!f.fuente_id) e.push(`${d}: activa sin fuente_id.`);
    else if (fuentes.size && !fuentes.has(f.fuente_id)) e.push(`${d}: fuente_id «${f.fuente_id}» no existe en data/fuentes.json.`);
    else if (fuentes.size && fuentes.get(f.fuente_id).tipo !== 'oficial') e.push(`${d}: el vigilante solo lee fuentes oficiales («${f.fuente_id}» no lo es).`);
    if (!f.destino) e.push(`${d}: activa sin destino.`);
    const flt = leerFiltro(f.filtro);
    if (f.lector === 'gendarmeria-paso' && !leerDestino(f.destino)?.paso) e.push(`${d}: gendarmeria-paso necesita destino paso:<id>.`);
    if (f.lector === 'vialidad-ar' && (!flt.provincia || !flt.ruta || !flt.tramos)) e.push(`${d}: vialidad-ar necesita filtro provincia=…;ruta=…;tramos=… (tramos=* para todos).`);
    if (f.lector === 'mopc-pdf' && !flt.localidades) e.push(`${d}: mopc-pdf necesita filtro localidades=…|… (lo que se busca en el informe del MOPC).`);
    if (f.lector === 'siemop-cl') {
      if (!/^\d\d(\|\d\d)*$/.test(flt.regiones || '')) e.push(`${d}: siemop-cl necesita regiones=01|02.`);
      for (const k of ['km', 'dias_sin_novedad', 'max_horas']) if (!(Number(flt[k]) > 0)) e.push(`${d}: siemop-cl necesita ${k} con un número mayor que 0.`);
    }
  });
  // Los parámetros de la capa de Chile son de toda la capa: tienen que coincidir en todas sus filas.
  const cl = filas.filter((f) => f.estado === 'activa' && f.lector === 'siemop-cl').map((f) => leerFiltro(f.filtro));
  for (const k of ['regiones', 'km', 'dias_sin_novedad', 'max_horas']) if (new Set(cl.map((x) => x[k])).size > 1) e.push(`data/fuentes-vigilancia.csv: las filas siemop-cl activas tienen distinto «${k}»; debe ser el mismo en todas.`);
  return e;
}

/** Lo que necesita el vigilante, sacado de las filas activas. */
export function configuracion({ filas } = cargar()) {
  const activas = filas.filter((f) => f.estado === 'activa');
  const de = (l) => activas.filter((f) => f.lector === l);
  const cl = de('siemop-cl').map((f) => leerFiltro(f.filtro))[0];
  return {
    pasosAR: de('gendarmeria-paso').map((f) => ({ paso: leerDestino(f.destino).paso, fuente: f.fuente_id, fila: f.id })),
    correspondenciasAR: de('vialidad-ar').map((f) => {
      const x = leerFiltro(f.filtro);
      return { guia: leerDestino(f.destino), provincia: x.provincia, ruta: x.ruta, tramos: x.tramos === '*' ? '*' : x.tramos.split('|').map((t) => t.trim()), fila: f.id };
    }),
    // HU-134: informe del MOPC (Paraguay). Qué localidades del informe cuentan para cada tramo de la Guía.
    mopc: de('mopc-pdf').map((f) => ({ guia: leerDestino(f.destino), localidades: leerFiltro(f.filtro).localidades.split('|').map((t) => t.trim()).filter(Boolean), fuente: f.fuente_id, fila: f.id })),
    chile: cl ? { regiones: cl.regiones.split('|'), km: Number(cl.km), diasSinNovedad: Number(cl.dias_sin_novedad), maxHoras: Number(cl.max_horas) } : null,
  };
}
