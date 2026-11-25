// Prueba sin navegador (25/11/2026): la documentación es confiable si sus enlaces llevan a donde dicen.
// Comprueba en la documentación del repositorio (todos los .md salvo content/, que son páginas de la web con rutas de la
// web, el informe generado docs/informe-contenidos.md, dist/ y node_modules/):
//   1. que cada enlace relativo apunta a un archivo o carpeta que existe;
//   2. que cada ancla (#…) a un .md existe como título en ese documento (misma regla que GitHub);
//   3. que las decisiones van numeradas 1, 2, 3… sin huecos ni repetidas.
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const f = [];
const ok = (c, m) => c || f.push(m);

const mds = [];
(function recorrer(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'content'].includes(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) recorrer(p);
    else if (e.name.endsWith('.md') && e.name !== 'informe-contenidos.md') mds.push(p);
  }
})(RAIZ);

const sinCodigo = (s) => s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, (m) => (m.includes('](') ? '' : m));
// Ancla de un título, como la calcula GitHub.
const ancla = (t) =>
  t
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
const anclas = new Map();
const anclasDe = (archivo) => {
  if (!anclas.has(archivo)) {
    const vistos = {};
    const lista = new Set();
    for (const m of sinCodigo(fs.readFileSync(archivo, 'utf8')).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
      const a = ancla(m[1]);
      lista.add(vistos[a] ? `${a}-${vistos[a]}` : a);
      vistos[a] = (vistos[a] || 0) + 1;
    }
    anclas.set(archivo, lista);
  }
  return anclas.get(archivo);
};

let enlaces = 0;
for (const md of mds) {
  const rel = path.relative(RAIZ, md);
  const texto = sinCodigo(fs.readFileSync(md, 'utf8'));
  for (const m of texto.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const destino = m[1];
    if (/^(https?:|mailto:|tel:)/.test(destino)) continue;
    enlaces++;
    const [ruta, hash] = destino.split('#');
    const archivo = ruta ? path.resolve(path.dirname(md), decodeURIComponent(ruta)) : md;
    if (!archivo.startsWith(RAIZ)) {
      f.push(`${rel}: el enlace «${destino}» sale del repositorio (usa la URL completa de GitHub)`);
      continue;
    }
    if (!fs.existsSync(archivo)) {
      f.push(`${rel}: «${destino}» no existe`);
      continue;
    }
    if (hash && archivo.endsWith('.md') && !anclasDe(archivo).has(decodeURIComponent(hash).toLowerCase()))
      f.push(`${rel}: el ancla «#${hash}» no es ningún título de ${path.relative(RAIZ, archivo)}`);
  }
}

const dec = fs.readFileSync(path.join(RAIZ, 'docs', 'decisiones.md'), 'utf8');
const nums = [...dec.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]));
ok(nums.length > 0 && nums.every((n, i) => n === i + 1), `docs/decisiones.md: las decisiones deben ir 1, 2, 3… sin huecos ni repetidas (${nums.join(', ')})`);

if (f.length) {
  console.log(`✗ Documentación: ${f.length} fallo(s)`);
  f.forEach((m) => console.log('  - ' + m));
  process.exit(1);
}
console.log(`✓ Documentación: ${mds.length} documentos, ${enlaces} enlaces internos y ${nums.length} decisiones en orden`);
