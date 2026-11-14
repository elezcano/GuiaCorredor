# Modernización del portal: auditoría y propuesta

Fecha: 14 de noviembre de 2026. Responde al encargo «Modernización del Portal del Corredor Bioceánico».

## Fase 1. Auditoría del portal tal como estaba

### Estructura (13 páginas)

| Página | Qué hace | Se mantiene |
|---|---|---|
| Portada | Buscador de ruta, estado de pasos (formato historias), carretera de punta a punta, últimas novedades | Sí, reorganizada |
| Planificador | Compara rutas (Jama / Sico), tramos, papeles según carga, empresas por parada, tiempos de cruce | Sí, ampliado con festivos |
| Novedades | Noticias con fuente, filtros por país y tema | Sí, dentro de «Avisos» |
| Guía (tabla) | Índice de fichas con filtros | Sí, como «Todas las fichas» |
| Fichas de guía | 3 pasos, 1 tramo, 1 documento (Markdown) | Sí, con datos operativos estructurados |
| Empresas | Directorio con buscador y filtros | Sí, como «Servicios», con categorías para transportistas |
| Anunciarse, Cómo trabajamos, 404 | Comercial e institucional | Sí |

### Tecnología

- Web estática generada con Node (`scripts/build.mjs`), contenido en JSON y Markdown, publicada en GitHub Pages.
- Sin backend ni base de datos. La única entrada externa son los tiempos de cruce (formulario de Google publicado como CSV), con alternativa: si no responde, se publica sin ellos.
- Publicación automática en cada cambio y cada 3 horas.

### Problemas detectados

1. **Estado de paso duplicado**: el estado de cada paso estaba en `data/rutas.json` y en la cabecera de su ficha Markdown. Podían contradecirse.
2. **Estado sin fecha ni fuente estructuradas**: el estado se mostraba como actual aunque el dato tuviera meses. Incumple el principio «nunca asignar un estado actual sin fuente y fecha».
3. **Pozo Hondo sin ficha** pese a ser frontera de la ruta principal.
4. **Horarios, organismos y restricciones** solo como texto «Pendiente» dentro de las fichas.
5. **Faltaban** mapa, calendario de festivos, listado de obras e incidencias, meteorología, documentación por país y buscador interno.
6. **Servicios**: las categorías del directorio no cubrían servicios del camión (combustible, descanso, básculas…).

## Fase 2. Propuesta

### Arquitectura de información y menú

| Menú | Página | Responde a |
|---|---|---|
| Rutas | Portada y planificador | ¿Qué ruta uso? |
| Fronteras | `/pasos/` + fichas | ¿Qué pasos tengo? ¿Qué horario tiene la aduana? |
| Avisos | `/avisos/` (obras, restricciones, meteorología) + novedades | ¿Hay obras o restricciones? ¿Qué tiempo voy a encontrar? |
| Calendario | `/calendario/` | ¿Hay festivos que afecten a mi operación? |
| Papeles | `/papeles/` | ¿Qué documentación necesito? |
| Servicios | `/directorio/` | ¿Dónde encuentro servicios para mi camión? |

Buscador interno en la cabecera (`/buscar/`). En móvil, barra inferior con Rutas, Fronteras, Avisos, Calendario y Servicios.

### Datos (contenido separado de presentación)

| Archivo | Contenido | Quién lo actualiza y cuándo |
|---|---|---|
| `data/pasos.json` | Ficha operativa de cada paso: estado con fuente y fecha, horarios, organismos, restricciones, acceso | Cuando cambie un parte oficial |
| `data/festivos.json` | Festivos nacionales por país y año, con norma de origen | Una vez al año (y cuando se publiquen traslados) |
| `data/incidencias.json` | Obras, restricciones y cortes, con impacto y fuente | Cuando haya una novedad |
| `data/avisos.json` | Avisos meteorológicos copiados de fuentes oficiales, con vigencia | Solo si hay un aviso relevante |
| `data/organismos.json` | Organismos oficiales por país con enlace verificado | Al detectar un enlace roto |

Cada registro lleva `fuente` y fecha. `npm run check` bloquea la publicación si falta la fuente de un estado o de una incidencia.

### Regla de frescura de estados

Un estado «operativo» o «con restricciones» con más de 30 días se muestra como **Pendiente de verificación** (indicando el último dato). Un estado de obra o cierre caduca a los 120 días. Así la web no presenta como actual un dato viejo.

### Qué es viable sin backend

| Funcionalidad | Cómo |
|---|---|
| Buscador interno | Índice JSON generado en la publicación, búsqueda en el navegador |
| Filtros por país, categoría y fecha | Botones y selectores sobre listas generadas |
| Mapa interactivo | SVG con posiciones aproximadas y enlaces a fichas |
| Calendario | `festivos.json` → listado por mes con filtros |
| Incidencias, meteorología | JSON + enlaces oficiales; los avisos vencidos desaparecen en la siguiente publicación (cada 3 h) |
| Imprimible | Hoja de estilos de impresión en fichas, calendario y papeles |

### Descartado y por qué

- **Descarga de PDF**: no hay documentos propios verificados que ofrecer; enlazamos los oficiales.
- **Predicción meteorológica propia**: sin API no se puede mostrar sin que quede desactualizada. Se enlaza a los servicios oficiales.
- **Filtro por organismo en el calendario**: no hay datos verificables de cierres por organismo. Queda preparado en el modelo (`organismos` opcional por festivo).
- **Festivos regionales**: pendientes de verificar (Mato Grosso do Sul, Salta, Jujuy, Antofagasta).
- **Límites políticos en el mapa**: sin cartografía oficial incorporada; el mapa indica que es esquemático.

## Fase 4. Preparado para el futuro

- **APIs oficiales y estado de pasos**: `pasos.json` tiene la forma que devolvería un conector (estado, fuente, fecha). Un script en `scripts/` puede rellenarlo antes de `build`, como ya hace `scripts/cruces.mjs` con los tiempos de cruce.
- **Festivos automáticos**: `festivos.json` admite generar los años siguientes con un script a partir de las leyes, dejando como «por confirmar» los traslados por decreto.
- **Meteorología y tráfico**: `avisos.json` acepta avisos con `vigenteHasta`; un conector solo tendría que escribir ese archivo.
- **Panel de administración**: los datos son JSON planos, compatibles con un CMS basado en Git (Decap CMS, por ejemplo) sin cambiar la web.
- **Notificaciones**: el Canal de WhatsApp propuesto puede publicar cada cambio de `pasos.json` o `incidencias.json`.
