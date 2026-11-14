// Comprobación periódica de enlaces externos (fuentes, organismos y guía). No bloquea la publicación:
// escribe un informe en Markdown (enlaces-externos.md) que el flujo semanal publica en un issue.
// Algunos sitios oficiales rechazan peticiones automáticas: un fallo es un aviso para revisar a mano.
import fs from 'node:fs';
import { cargar } from './datos.mjs';
import { loadGuia } from './lib.mjs';

const D = cargar();
const urls = new Map();
const anotar = (url, donde) => url && /^https?:\/\//.test(url) && urls.set(url, [...(urls.get(url) || []), donde]);
for (const f of D.fuentes.values()) anotar(f.url, `fuente ${f.id}`);
for (const o of D.organismos) anotar(o.url, `organismo ${o.id}`);
for (const p of loadGuia()) for (const [, u] of p.body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) anotar(u, `guía ${p.seccion}/${p.slug}`);

const probar = async (url) => {
  for (const metodo of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method: metodo, redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'GuiaCorredor-enlaces/1.0 (+https://github.com/elezcano/GuiaCorredor)' } });
      if (r.ok) return { ok: true, codigo: r.status, final: r.url !== url ? r.url : null };
      if (metodo === 'GET') return { ok: false, codigo: r.status };
    } catch (e) {
      if (metodo === 'GET') return { ok: false, codigo: e.name === 'TimeoutError' ? 'tiempo agotado' : e.cause?.code || e.message };
    }
  }
};
const res = [];
const lista = [...urls.entries()];
for (let i = 0; i < lista.length; i += 6) res.push(...(await Promise.all(lista.slice(i, i + 6).map(async ([u, d]) => ({ url: u, donde: d, ...(await probar(u)) })))));
const mal = res.filter((r) => !r.ok);
const movidos = res.filter((r) => r.ok && r.final);
const hoy = new Date().toISOString().slice(0, 10);
const md = [
  `Comprobación del ${hoy}: ${res.length} enlaces, ${mal.length} con fallo, ${movidos.length} redirigidos.`,
  '',
  mal.length ? '## Con fallo (revisar a mano; puede ser un bloqueo del sitio a robots)' : '',
  ...mal.map((r) => `- [ ] ${r.url} — ${r.codigo} — ${r.donde.join(', ')}`),
  movidos.length ? '\n## Redirigidos (actualizar la url si el destino es el definitivo)' : '',
  ...movidos.map((r) => `- ${r.url} → ${r.final} — ${r.donde.join(', ')}`),
  '',
  'Generado por `scripts/enlaces-externos.mjs`. Este informe no bloquea la publicación.',
].filter((x) => x !== '').join('\n');
fs.writeFileSync('enlaces-externos.md', md + '\n');
console.log(md);
