// HU-135: la Guía en portugués de Brasil (pt-BR).
// Las páginas /pt/ se generan a partir de las españolas con un diccionario de frases de la interfaz (src/i18n/pt-BR.json).
// Lo que está marcado en castellano (lang="es": avisos y partes oficiales, datos y artículos) no se toca.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

/** Páginas que tienen versión en portugués (ruta española). */
// HU-136: todas las páginas tienen versión en portugués (salvo archivos como 404.html).
export const tienePT = (r) => typeof r === 'string' && r.startsWith('/') && !r.startsWith('/pt/') && !/\.\w+$/.test(r);

export function cargarDiccionario() {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'i18n', 'pt-BR.json'), 'utf8'));
  return d.frases;
}

const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ0-9';
/** Expresión única con todas las frases (las más largas primero), con límites de palabra. */
export function compilar(frases) {
  const claves = Object.keys(frases).filter((k) => frases[k] && frases[k] !== k).sort((a, b) => b.length - a.length);
  if (!claves.length) return (t) => t;
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![${LETRA}])(?:${claves.map(escRe).join('|')})(?![${LETRA}])`, 'g');
  return (t) => t.replace(re, (m) => frases[m]);
}

const ATRIBUTOS = /\b(aria-label|title|placeholder|alt|content)="([^"]*)"/g;
/**
 * Traduce un HTML: solo texto y atributos de lectura; no toca etiquetas, URL ni clases.
 * Se salta <script>, <style> y todo lo que va entre <!--es--> y <!--/es--> o en un elemento hoja con lang="es".
 */
export function traducirHTML(html, tr, { B, urlBase, ruta = '/' }) {
  // Enlaces: los relativos (p. ej. en el texto de la guía) se resuelven contra la página española, porque /pt/
  // añade un nivel de carpeta; y los internos van a su versión en portugués. También dentro de lo protegido.
  html = html.replace(/<a\b[^>]*>/g, (tag) => {
    if (/\bdata-fijo\b/.test(tag)) return tag;
    return tag.replace(/\bhref="([^"]*)"/, (m, href) => {
      if (/^(mailto:|https:\/\/wa\.me\/)/.test(href)) return m;
      let h = href;
      if (!/^([a-z]+:|\/|#)/.test(h)) {
        const x = new URL(h.replace(/&amp;/g, '&'), `https://x${B}${ruta}`);
        h = `${x.pathname}${x.search}${x.hash}`;
      }
      if (h.startsWith(`${B}/`) && !h.startsWith(`${B}/pt/`) && !h.startsWith(`${B}/assets/`) && !h.startsWith(`${B}/api/`)) {
        const [r, extra = ''] = h.slice(B.length).split(/(?=[?#])/);
        if (tienePT(r)) h = `${B}/pt${r}${extra}`;
      }
      return `href="${h}"`;
    });
  });
  const guardados = [];
  const guardar = (m) => `\u0000${guardados.push(m) - 1}\u0000`;
  let h = html
    .replace(/<!--es-->[\s\S]*?<!--\/es-->/g, guardar)
    .replace(/<!--pt-->[\s\S]*?<!--\/pt-->/g, guardar)
    .replace(/<script\b[\s\S]*?<\/script>/g, (m) => (/type="application\/json"/.test(m) ? m : guardar(m)))
    .replace(/<style\b[\s\S]*?<\/style>/g, guardar)
    .replace(/<(span|p|strong|em|td|li|div)\b[^>]*\blang="es"[^>]*>[^<]*<\/\1>/g, guardar);
  // Los JSON de datos llevan textos de la interfaz que pinta el navegador: allí los traduce comun.js.
  h = h.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, guardar);
  h = h
    .split(/(<[^>]+>)/)
    .map((parte) => {
      if (!parte.startsWith('<')) return tr(parte);
      let tag = parte.replace(ATRIBUTOS, (m, a, v) => (a === 'content' && !/name="description"|property="og:(title|description)"/.test(parte) ? m : `${a}="${tr(v)}"`));
      // Enlaces internos a páginas con versión en portugués.
      if (/\bdata-fijo\b/.test(tag)) return tag;
      tag = tag.replace(/\bhref="([^"]*)"/, (m, href) => {
        // Email y WhatsApp preparados: también en portugués.
        if (/^(mailto:|https:\/\/wa\.me\/)/.test(href)) return `href="${traducirEnlace(href, tr)}"`;
        return m;
      });
      return tag;
    })
    .join('');
  h = h.replace(/\u0000(\d+)\u0000/g, (m, i) => guardados[i]).replace(/\u0000(\d+)\u0000/g, (m, i) => guardados[i]);
  // Las dos horas: en portugués, la segunda es la de Campo Grande (Brasil), no la de España.
  h = h.replace(/<span class="h-ref" data-br="([^"]+)">[^<]*<\/span>/g, '$1 em Campo Grande');
  return h
    .replace('data-idioma="es" aria-current="true"', 'data-idioma="es"')
    .replace('data-idioma="pt"', 'data-idioma="pt" aria-current="true"')
    .replace(/<html lang="[^"]*"/, '<html lang="pt-BR"')
    .replace(/<link rel="canonical" href="([^"]*)">/, (m, href) => `<link rel="canonical" href="${href.replace(urlBase, `${urlBase}/pt`)}">`);
}

/** Traduce los textos de un enlace mailto: o wa.me (asunto, cuerpo, text). */
export function traducirEnlace(href, tr) {
  const [base, q] = href.split('?');
  if (!q) return href;
  const dec = (v) => decodeURIComponent(v.replace(/&amp;/g, '&'));
  return `${base}?${q
    .replace(/&amp;/g, '&')
    .split('&')
    .map((par) => {
      const [k, v = ''] = par.split('=');
      return ['subject', 'body', 'text'].includes(k) ? `${k}=${encodeURIComponent(tr(dec(v)))}` : par;
    })
    .join('&amp;')}`;
}
