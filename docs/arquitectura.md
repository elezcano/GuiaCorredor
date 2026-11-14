# Arquitectura

## Principio: lo más simple que genere ingresos

El objetivo es un negocio con poco mantenimiento. Cada pieza técnica tiene que justificarse por ingresos o por ahorro de tiempo. Por eso la fase 1 no tiene servidor, base de datos ni cuentas de usuario.

## Fase 1 (actual)

```
 archivos de texto (content/, data/)
          │  npm run build
          ▼
    dist/  (HTML + CSS + JS)
          │  GitHub Actions
          ▼
   alojamiento estático (gratis)
```

| Necesidad | Solución en fase 1 | Coste |
|---|---|---|
| Páginas de la guía | Markdown → HTML en el build | 0 |
| Posicionamiento en Google | HTML estático, `sitemap.xml`, títulos y descripciones por página | 0 |
| Directorio y filtros | JSON incrustado + filtros en el navegador | 0 |
| Planificador | `data/rutas.json` + JavaScript en el navegador | 0 |
| Alta de empresas | Email o WhatsApp con plantilla; se añade a mano a `directorio.json` | 0 |
| Cobro de fichas destacadas | Enlace de pago de una pasarela de suscripciones (sin código) | % por cobro |
| Revisión de calidad | `npm run check` en cada cambio | 0 |

**Límite de esta fase:** a partir de unas 300–500 empresas o de muchas altas por semana, mantener el JSON a mano deja de compensar. Ese es el momento de pasar a la fase 2.

## Fase 2 (cuando haya clientes pagando)

- Base de datos gestionada (PostgreSQL) para empresas, suscripciones y documentos generados.
- Alta y edición de ficha en autoservicio, con inicio de sesión por enlace al email.
- Webhooks de la pasarela de pago: activan o desactivan la ficha destacada solos.
- Generador de CRT y MIC/DTA: formulario → PDF, pago por documento.
- Avisos de estado de pasos fronterizos por email/WhatsApp a quien se suscriba.

La guía sigue siendo estática; solo el directorio y los documentos pasan a tener servidor.

## Modelo de datos

### Empresa (`data/directorio.json`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | texto | Único, en minúsculas con guiones |
| `nombre` | texto | |
| `categoria` | texto | Uno de `data/categorias.json` |
| `pais` | `BR` · `PY` · `AR` · `CL` | |
| `ciudad` | texto | |
| `servicios` | lista de textos | Se muestran como etiquetas |
| `descripcion` | texto | Opcional |
| `destacada` | sí/no | Ficha de pago |
| `contacto` | `{ email, whatsapp, web }` | WhatsApp con prefijo de país, solo números |
| `ejemplo` | sí/no | Fichas de muestra; no se publican si `mostrarEjemplos` es `false` |

### Página de guía (`content/guia/<sección>/<slug>.md`)

Cabecera obligatoria: `titulo`, `tipo`, `resumen`, `paises` (separados por comas), `estado` (`operativo`, `en-obras`, `intermitente`, `pendiente`), `revisado` (AAAA-MM-DD). Opcional: `borrador: true`.

Cuerpo en Markdown. Toda página de pasos o tramos termina con `## Fuentes`. El `check` avisa cuando una página lleva más de 90 días sin revisar.

### Rutas (`data/rutas.json`)

El corredor se modela como una línea de **nodos** con un **tramo** entre cada par consecutivo. Un tramo puede tener `paso` (frontera) y `alternativa`. Las distancias sin fuente van como `null` y se muestran como "por verificar": **no se inventan cifras**.
