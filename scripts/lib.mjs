// Utilidades compartidas por build.mjs y check.mjs. Sin dependencias externas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const readJSON = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

export const ESTADOS = {
  operativo: 'Operativo',
  'en-obras': 'En obras',
  intermitente: 'Intermitente',
  pendiente: 'Por confirmar',
};

export const SECCIONES = {
  pasos: 'Pasos fronterizos',
  tramos: 'Tramos',
  documentos: 'Documentos',
};

export const PAISES = { BR: 'Brasil', PY: 'Paraguay', AR: 'Argentina', CL: 'Chile' };

export const CAMPOS_OBLIGATORIOS = ['titulo', 'tipo', 'resumen', 'paises', 'estado', 'revisado'];

/** Front matter mínimo: líneas "clave: valor" entre dos "---". */
export function parseFrontMatter(src) {
  const m = src.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    meta[k] = v;
  }
  if (typeof meta.paises === 'string') meta.paises = meta.paises.split(',').map((s) => s.trim()).filter(Boolean);
  return { meta, body: m[2] };
}

/** Lee content/guia/<seccion>/<slug>.md */
export function loadGuia() {
  const base = path.join(ROOT, 'content', 'guia');
  const paginas = [];
  for (const seccion of fs.readdirSync(base).sort()) {
    const dir = path.join(base, seccion);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const slug = file.replace(/\.md$/, '');
      const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(dir, file), 'utf8'));
      paginas.push({ seccion, slug, ruta: `/guia/${seccion}/${slug}/`, meta, body, archivo: `content/guia/${seccion}/${file}` });
    }
  }
  return paginas;
}

export const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
