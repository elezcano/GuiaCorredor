# ◆ Guía del Corredor Bioceánico

Web de referencia para mover carga por carretera por el **Corredor Bioceánico** (Brasil – Paraguay – Argentina – Chile): rutas, pasos fronterizos, documentos y empresas que dan servicio en el camino.

> Este repositorio sustituye al antiguo proyecto *Red de Cargas* (marketplace de matching). El estado anterior está guardado en la rama [`legacy-red-de-cargas`](../../tree/legacy-red-de-cargas).

## Qué es y qué no es

| Es | No es |
|---|---|
| Una **guía** gratuita de pasos, tramos y papeles, con fuente y fecha en cada página | Un marketplace donde se negocian cargas |
| Un **directorio** de empresas con ficha básica gratis y **ficha destacada de pago** | Un intermediario: no movemos dinero entre empresas |
| Un **planificador** de ruta: tramos, fronteras, estado y documentos | Un operador logístico |
| *(Fase 2)* Un **generador de CRT y MIC/DTA** con pago por documento | |

**Objetivo de negocio:** ingresos recurrentes con poco mantenimiento. El plan completo está en el documento *Guía del Corredor Bioceánico — Plan de lanzamiento* y las tareas en el tablero de Trello del proyecto.

## Cómo está hecho

Web **estática**: sin servidores ni base de datos. Se genera con un script de Node a partir de archivos de texto y se publica gratis (GitHub Pages, Cloudflare Pages o Netlify).

```
content/guia/        Páginas de la guía en Markdown (pasos/, tramos/, documentos/)
data/site.json       Nombre, contacto, planes y precios
data/directorio.json Empresas del directorio
data/categorias.json Tipos de empresa
data/rutas.json      Nodos y tramos del corredor (planificador)
src/assets/          Estilos y JavaScript del navegador
scripts/build.mjs    Genera la web en dist/
scripts/check.mjs    Revisa datos y contenido antes de publicar
docs/                Arquitectura, cómo editar, siguientes fases
```

## Uso

Requisito: Node 20 o superior.

```bash
npm install      # una sola vez
npm run check    # revisa errores y avisos
npm run dev      # genera y abre en http://localhost:4321
npm run build    # solo genera dist/
```

## Publicar

Cada cambio en `main` se revisa, se genera y se publica con GitHub Actions (`.github/workflows/publicar.yml`).

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables: `SITE_URL` (p. ej. `https://midominio.com`) y, si se publica en una subcarpeta, `BASE_PATH` (p. ej. `/guia`).

GitHub Pages en un repositorio **privado** requiere plan de pago. Alternativas gratis: hacer el repo público o conectar Cloudflare Pages (build: `npm run build`, salida: `dist`).

## Antes del lanzamiento

`npm run check` lista lo pendiente. Como mínimo:

- [ ] Nombre definitivo, dominio, email y WhatsApp en `data/site.json`.
- [ ] Borrar las fichas de ejemplo de `data/directorio.json`.
- [ ] Revisión de las páginas de la guía por un despachante y quitar `borrador: true`.
- [ ] Enlace de pago de la ficha destacada.
- [ ] Textos legales (aviso legal, privacidad, condiciones).

## Hoja de ruta

| Fase | Qué | Cuándo |
|---|---|---|
| 1 | Guía + directorio + planificador + alta por email/WhatsApp + enlace de pago | Feb 2027 |
| 1.5 | Versión en portugués, formulario de alta, panel de visitas | Verano 2027 |
| 2 | Generador de CRT y MIC/DTA, avisos de estado de pasos, alta y pago en autoservicio | Dic 2027 |

Detalle en [`docs/arquitectura.md`](docs/arquitectura.md).
