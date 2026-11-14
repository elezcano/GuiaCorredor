# Auditoría funcional y técnica de Guía Corredor

Fecha: 14 de noviembre de 2026 · Versión auditada: commit `1f12325` (PR #34) · Estado: **diagnóstico, pendiente de aprobación antes de programar**.

## Cómo se ha comprobado

| Comprobación | Resultado |
|---|---|
| Lectura del código, datos y fichas del repositorio | Hecha |
| Generación de la web (`npm run build`) con y sin ruta base | 19 páginas, sin errores |
| Validación de datos (`npm run check`) | 0 errores, 22 avisos |
| Enlaces internos (`npm run enlaces`) | 0 rotos en 19 páginas |
| Prueba funcional en navegador (Playwright, local): portada, planificador, avisos, fichas, calendario, buscador, guía, directorio, novedades | 21 comprobaciones, 0 fallos |
| Capturas a 1440 y 390 px, claro y oscuro | Sin desbordes |
| Despliegue en GitHub Pages | Correcto según GitHub Actions |
| **Web publicada abierta directamente** | **No verificable desde este entorno** (el dominio no está permitido) |
| **Enlaces externos** (fuentes, organismos) | **No verificable desde este entorno** (sin red en la terminal); no hay comprobación automática |
| **IA DEV** | **No verificable**: no está en este repositorio ni hay documentación de su interfaz |
| Lectores de pantalla | No verificable (solo comprobado: contraste calculado, foco visible, teclado en buscador y formularios) |

---

## Entregable A · Estado actual

Leyenda: ✅ Implementada y funcional · 🟡 Parcial · 🔴 Con errores · ⚪ Demostrativa / sin datos reales · ⛔ No implementada · ❔ No verificable

### A.1 Inventario técnico

| Elemento | Estado actual |
|---|---|
| Estructura | `data/` (10 JSON), `content/guia/` (6 fichas Markdown), `scripts/` (generador, validación, enlaces, informe, tiempos de cruce, servidor local), `src/assets/` (8 JS, 1 CSS), `docs/` |
| Tecnología | Generador estático propio en Node 22 (~3.900 líneas). Sin framework. Una dependencia (`marked`) y una opcional (tipografía Overpass) |
| Publicación | GitHub Actions → GitHub Pages en cada cambio en `main` y cada 3 horas. Pasos: `check` → `build` → `enlaces` → publicar |
| Integraciones externas | Formulario de Google (tiempos de cruce, **sin configurar**), enlaces `wa.me` para compartir. Sin mapas de terceros, sin analítica, sin cookies |
| Peso | 544 KB toda la web; CSS 62 KB; mayor JS 19 KB |
| Indexación | `noindex` y `robots.txt` con `Disallow: /` a propósito hasta el lanzamiento; `sitemap.xml` y `canonical` generados |

### A.2 Matriz de diagnóstico

Esfuerzo: S ≤ 4 h · M ≤ 2 días · L ≤ 1 semana · XL > 1 semana (trabajo de desarrollo; no incluye conseguir datos).

| # | Módulo | Funcionalidad | Estado | Problema detectado | Impacto para el usuario | Solución propuesta | Prioridad | Esfuerzo | Dependencias |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Datos geográficos | Coordenadas de nodos y pasos | 🔴 | Coordenadas **aproximadas sin fuente**, puestas a mano. Etiquetadas como «aproximadas», pero sin procedencia | Mapa y distancias estimadas se apoyan en un dato no verificado | Fuente por coordenada (IGN de cada país, OpenStreetMap con atribución) y validación de rango | **P0** | S | — |
| 2 | Datos geográficos | Nodos de la ruta | 🔴 | Nodos fusionados: «Salta / Jujuy», «San Pedro de Atacama / Calama», «Antofagasta / Mejillones / Iquique». Jama sale de Jujuy y Sico de Salta; Iquique está a ~400 km de Antofagasta | El planificador no distingue el origen real de cada variante; la estimación a Iquique es errónea | Separar localidades; rutas como grafo (no cadena lineal) | **P1** | L | Modelo de datos (D) |
| 3 | Validación | Festivos de Brasil 2027 marcados «verificado» | 🔴 | Su fuente es la portaria federal **de 2026**; la de 2027 no está publicada | Un dato pendiente se muestra como confirmado | Pasarlos a «sin verificar» hasta la portaria 2027 | **P0** | S | — |
| 4 | Validación | Quién verifica | 🟡 | Festivos y enlaces de organismos los marcó como verificados el asistente al contrastarlos con fuentes oficiales, no una persona del equipo. Varios enlaces se confirmaron por resultados de búsqueda, no abriendo la página | La etiqueta «Verificado» promete más de lo que hubo | Campo `verificadoPor` y verificación humana de esos registros | **P0** | S | Editor humano |
| 5 | Pasos | Estado operativo | 🟡 | Un único campo de estado + lista de restricciones. No distingue carretera, aduana, migraciones, sanitario ni servicios | No se puede expresar «abierto, pero sin control sanitario» | Estado por dimensión (7) con su propia fuente y caducidad | **P1** | M | D |
| 6 | Pasos | Fichas | 🟡 | 4 fichas. Faltan horarios de varios lados, operaciones de carga, contactos, servicios, infraestructura, nombres alternativos, próxima revisión | El transportista no puede preparar el cruce solo con la ficha | Completar con fuentes oficiales y entrevistas; mostrar «sin dato» (ya se hace) | P1 | M (+ datos) | Fuentes, entrevistas de diciembre |
| 7 | Pasos | Coherencia entre ficha, mapa, portada y planificador | ✅ | Desde PR #34 todo sale de `pasos.json` con una sola regla de validación | — | Mantener; añadir prueba automática en el repositorio | — | — | — |
| 8 | Planificador | Origen/destino, opciones Jama/Sico, itinerario, papeles por carga, compartir | ✅ | Funciona entre los 8 nodos | — | — | — | — | — |
| 9 | Planificador | Distancia | 🟡 | Solo 3 de 7 tramos tienen km con fuente; el resto es línea recta (etiquetada como estimación) | La distancia total no es utilizable para planificar | Distancias oficiales por tramo (Vialidad, DNIT, MOPC) | **P1** | S (+ datos) | Fuentes |
| 10 | Planificador | Distancia por país, tiempo de conducción, tiempo de espera | ⛔ | No existen | No se puede estimar la duración del viaje | Distancia por país desde tramos; tiempo de conducción calculado con velocidad de referencia declarada; espera solo desde tiempos de cruce reportados, separada | P2 | M | 2, 9, 22 |
| 11 | Planificador | Parámetros de vehículo (peso, dimensiones, ejes, peligrosas) | ⛔ | Solo tipo de carga (4 valores) | No avisa de restricciones de peso o gálibo | Preparar el modelo y el formulario; solo filtrar cuando haya restricciones con fuente | P3 | M | 5, 12 |
| 12 | Planificador | Servicios en ruta y zonas sin servicios | ⚪ | La estructura existe («Te ayudan aquí»), pero el directorio está vacío | Ningún valor hoy | Llenar el directorio con empresas verificadas; calcular tramos sin servicios | P1 | S (+ datos) | 18 |
| 13 | Planificador | Expediente de viaje imprimible / descargable | 🟡 | Hay ficha de resultados e impresión de la lista de papeles, pero no un expediente completo (mapa, contactos, fuentes, fecha de generación) | El transitario no puede entregar un documento al conductor | Vista «Expediente» con CSS de impresión y fecha de generación; el enlace compartible ya existe | **P1** | M | — |
| 14 | Calendario | Festivos nacionales 2026–2027 de los 4 países | ✅ | 71 registros con norma; 7 por confirmar | — | — | — | — | — |
| 15 | Calendario | Festivos regionales, cierres aduaneros, horarios por organismo, horario efectivo de carga | ⛔ | No hay datos; el modelo admite horarios especiales | No se sabe si la aduana atiende carga ese día | Registros con territorio, organismo, tipo de afectación; nunca deducir cierres de un feriado | P1 | M (+ datos) | Fuentes oficiales |
| 16 | Calendario | Filtro por paso fronterizo | ⛔ | Filtros por país, organismo, mes y fecha, pero no por paso | — | Añadir filtro por paso | P2 | S | — |
| 17 | Incidencias | Avisos con tramo y paso, visibles en fichas y planificador | ✅ | 4 incidencias con fuente | — | — | — | — | — |
| 18 | Incidencias | Campos y categorías | 🟡 | 6 tipos frente a 13 categorías pedidas; estados solo activa/resuelta; sin gravedad, región, carretera, coordenadas, fecha de resolución | No se pueden priorizar ni situar en el mapa | Ampliar el esquema; estados programada / activa / parcialmente resuelta / resuelta / caducada / pendiente | **P1** | M | D |
| 19 | Incidencias | Caducidad automática con histórico | 🟡 | La validación caduca, pero la incidencia sigue «activa» si nadie la cambia | Una obra terminada puede seguir avisándose | `vigenteHasta` y estado «caducada» automático; las resueltas pasan a un histórico visible | **P1** | S | 18 |
| 20 | Incidencias | Suscripción a rutas | ⛔ | — | — | Canal de WhatsApp manual primero; suscripción por ruta requiere un servicio de envío (coste) | P3 | L | Decisión de coste |
| 21 | Novedades | Noticias con fuente, filtros, histórico a 90 días, vínculo a fichas | ✅ | 5 noticias; la última del 5/11/2026 | — | Mantener cadencia semanal | — | — | — |
| 22 | Tiempos de cruce | Reportes de usuarios | ⚪ | Código y página listos; el formulario de Google no está configurado: no se recogen datos | Ningún valor hoy | Configurar los dos enlaces (5 min) | P1 | S | Ernesto |
| 23 | Directorio | Buscador, filtros, puntos de la ruta, ficha individual | ⚪ | Funciona, pero hay **0 empresas** (se quitaron las ficticias); la página muestra un aviso de alta | Ningún valor hoy | Publicar las primeras empresas verificadas (piloto: 2–3) | **P1** | S (+ datos) | 24 |
| 24 | Directorio | Alta, corrección y retirada de empresas | 🔴 | Solo `mailto`/WhatsApp, y **no hay contacto configurado**: el canal no funciona | Ninguna empresa puede darse de alta | Contacto del proyecto + formulario de solicitudes con revisión editorial | **P0** | S | Ernesto: email del proyecto |
| 25 | Directorio | Campos (razón social, coordenadas, horarios, sede frente a cobertura, categorías secundarias) | 🟡 | `ciudad` = sede y `puntos` = cobertura; faltan razón social, dirección, horarios, coordenadas, categorías secundarias | Aceptable para empezar | Ampliar el esquema | P2 | S | D |
| 26 | Directorio | Reputación pública | ⛔ (a propósito) | Se decidió no publicar notas ni reseñas de Google: sus condiciones lo impiden y un ranking implica recomendación | — | Mantener fuera; mostrar solo verificación comercial y presencia | — | — | — |
| 27 | Buscador | Índice global en el navegador | 🟡 | Cubre pasos, fichas, incidencias, festivos, novedades, organismos y empresas. Sin filtros, sin sinónimos, sin localidades ni carreteras como entidad, sin registro de búsquedas fallidas | Funciona para nombres exactos | Filtros por tipo y país, diccionario de sinónimos (p. ej. MIC ↔ manifiesto), registro anónimo de búsquedas sin resultado | P2 | M | 32 |
| 28 | Mapa | Mapa esquemático SVG con enlaces a fichas | 🟡 | Sin capas, sin incidencias situadas, coordenadas sin fuente (1), en móvil hay que desplazarse en horizontal | Útil como orientación, no como herramienta | Capas activables sobre el mismo SVG; mapa con teselas (OpenStreetMap/MapLibre) solo si aporta, con alternativa si falla | P2 | M–L | 1, 2, 18 |
| 29 | Arquitectura de datos | JSON por módulo con campos comunes de validación | 🟡 | Sin JSON Schema formal; países en una constante de código; sin entidades de localidad, carretera, fuente, documento ni ruta; fuentes repetidas dentro de cada registro; sin versión de esquema; historial solo en git | Riesgo de inconsistencias al crecer; la IA DEV no tiene contrato | Modelo normalizado (D) con esquemas validados en CI | **P0** | L | — |
| 30 | Calidad | Reglas automáticas | 🟡 | Existen: fuente, fechas, validación, referencias cruzadas, caducidad, enlaces internos, informe. Faltan: duplicados por nombre, rango de coordenadas, formato de teléfono, enlaces externos, estados incompatibles | Errores silenciosos posibles | Ampliar `check` y añadir comprobación semanal de enlaces externos | **P0** | M | 29 |
| 31 | IA DEV | Exportación y contrato de datos | ⛔ / ❔ | No hay exportación estable: los datos solo van incrustados en las páginas. La IA DEV no está en el repositorio | La IA puede mantener su propia copia y contradecir a la web | `api/v1/*.json` versionado, generado en cada publicación, con fuente, fechas y nivel de evidencia | **P0** | M | 29 |
| 32 | Analítica | Medición de uso | ⛔ | Ninguna | No sabemos qué se consulta; sin datos no se puede vender publicidad | GoatCounter (gratis, sin cookies) con eventos: rutas, búsquedas sin resultado, clics de contacto | P1 | S | — |
| 33 | Móvil | Diseño adaptable, barra inferior, contraste AA | ✅ | Comprobado a 390 px | — | — | — | — | — |
| 34 | Móvil | Consulta sin conexión (PWA) | ⛔ | — | En la cordillera y el Chaco no hay cobertura | Service worker: guardar una ruta y sus fichas con fecha de guardado visible | P2 | M | 13 |
| 35 | Móvil | Botones de llamada y «cómo llegar» | ⛔ | No hay contactos verificados que llamar; sin enlaces de navegación | — | `tel:` y enlace a mapas cuando haya teléfono y coordenada con fuente | P2 | S | 1, 6 |
| 36 | SEO | Metadatos, canonical, sitemap, robots | 🟡 | Correctos pero bloqueados a propósito (`noindex`); sin datos estructurados (JSON-LD) | Invisible en Google hasta el lanzamiento | JSON-LD (`Place`, `Organization`, `Event` para festivos); activar al lanzar | P2 | S | Dominio |
| 37 | Idiomas | ES / PT / EN | ⛔ | Solo español; textos de interfaz dentro del código | Brasil es la mitad del corredor | Separar textos de interfaz en archivos por idioma; empezar por portugués | P2 | L | — |
| 38 | Editorial | Flujo de publicación | 🟡 | Edición de JSON en GitHub; `check` bloquea errores; sin revisión obligatoria; los tiempos de cruce entran sin revisión (son reportes etiquetados) | Un error humano se publica al instante | Rama protegida + pull request revisado para datos críticos; plantilla de solicitud | P1 | S | GitHub (gratis) |
| 39 | Seguridad | Dependencias, claves, formularios | ✅ / 🟡 | Sin claves en el repo; 1 dependencia. La hoja de tiempos de cruce es pública (solo contiene datos no personales). Sin antispam en el formulario de Google. Sin página de privacidad propia | Bajo | Página de privacidad y aviso legal; Dependabot | P1 | S | — |
| 40 | Continuidad | Copias, recuperación, monitorización | 🟡 | Git es la copia y el historial. GitHub desactiva las tareas programadas tras 60 días sin actividad. Sin aviso si la publicación falla | Datos de cruce sin actualizar sin que nadie lo note | Notificación de fallos de Actions; comprobación de «última publicación» en la portada | P2 | S | — |
| 41 | Pruebas | Pruebas automatizadas en el repositorio | 🟡 | `check` y `enlaces` en CI. Las pruebas de navegador existen solo en local, fuera del repositorio | Las regresiones de interfaz no se detectan al publicar | Pruebas unitarias de `validacion.mjs` y del cálculo de rutas; Playwright en CI | P1 | M | — |

---

## Entregable B · Puntos ciegos priorizados

**Datos (el mayor riesgo):**
1. Coordenadas sin fuente (1) y nodos fusionados (2): la base geográfica de mapa, distancias y planificador no es fiable.
2. Ningún estado de paso verificado por una persona: hoy todo se muestra «Por verificar». Es honesto, pero la web aún no responde a «¿está abierto?».
3. Directorio vacío y sin canal de alta (23, 24): el modelo de ingresos depende de él.
4. Distancias oficiales por tramo (9): sin ellas no hay tiempo de viaje.
5. Horarios por organismo y del lado paraguayo y chileno (6, 15).

**Técnicos:**
6. Sin esquema de datos formal ni versión (29); sin exportación para la IA DEV (31).
7. Rutas como cadena lineal: no admite ramales ni otros orígenes y destinos.
8. Pruebas de interfaz fuera del repositorio (41).

**Editoriales:**
9. «Verificado» sin indicar quién verificó (4).
10. Las incidencias no caducan solas (19).
11. Sin cadencia de revisión asignada a una persona.

**Negocio y medición:**
12. Sin analítica (32): no hay forma de demostrar audiencia a un anunciante.
13. Solo en español (37).

---

## Entregable C · Arquitectura objetivo

**Mantener el modelo estático.** Ninguna necesidad actual justifica un backend: los datos cambian como mucho varias veces al día, se editan pocos registros y se publican cada 3 horas. Un backend añadiría coste, mantenimiento y una superficie de ataque, para un problema que no existe todavía.

```
fuentes oficiales / prensa / empresas
          │  (editor: alta → fuente → validación → PR revisado)
          ▼
  data/*.json  ── esquemas JSON (data/esquemas/) ── npm run check (CI)
          │
          ▼
  scripts/build.mjs ──► páginas HTML (GitHub Pages)
          │         └─► api/v1/*.json  (contrato para IA DEV y terceros)
          │         └─► indice de búsqueda, sitemap, JSON-LD
          ▼
  conectores futuros (scripts que ESCRIBEN JSON con estado "por-verificar";
  nunca publican como verificado)
```

| Necesidad | Solución sin backend | Cuándo haría falta un servicio |
|---|---|---|
| Alta y corrección de empresas | Formulario (Google Forms o Tally gratis) → revisión → PR | Si llegan más de ~20 solicitudes por semana |
| Tiempos de cruce | Formulario de Google + CSV (ya hecho) | Si hay abuso: servicio con antispam |
| Suscripción a avisos por ruta | Canal de WhatsApp manual | Envío automático por ruta (coste mensual) |
| Búsquedas sin resultado | Evento de GoatCounter | — |
| IA DEV | Archivos `api/v1/*.json` estáticos | Solo si necesita escribir o hacer consultas complejas en servidor |

---

## Entregable D · Modelo de datos

### D.1 Entidades e identificadores

| Entidad | Archivo | Identificador | Relaciones |
|---|---|---|---|
| País | `paises.json` | ISO 3166-1 (`BR`) | — |
| Región | `regiones.json` | ISO 3166-2 (`BR-MS`, `AR-A`) | país |
| Localidad | `localidades.json` | `pais-slug` (`ar-salta`) | región; coordenada con fuente |
| Carretera | `carreteras.json` | `pais-codigo` (`py-py15`) | países |
| Tramo | `tramos.json` | slug (`py15-me-ph`) | desde/hasta (localidad o paso), carretera |
| Ruta | `rutas.json` | slug (`principal-jama`) | lista ordenada de tramos |
| Paso fronterizo | `pasos.json` | slug (`jama`) | 2 localidades, organismos, tramos de acceso |
| Organismo | `organismos.json` | `pais-sigla` (`ar-dnm`) | país |
| Horario | `horarios.json` | `paso-organismo-lado` | paso, organismo |
| Festivo / afectación | `calendario.json` | `pais-fecha-slug` | país o región, organismos afectados (solo si consta) |
| Incidencia | `incidencias.json` | slug | tramos, paso, carretera, localidad |
| Empresa | `empresas.json` | slug | localidad sede, localidades de cobertura, categorías |
| Categoría de servicio | `categorias.json` | slug | — |
| Fuente | `fuentes.json` | slug (`ar-dnm-pasos`) | organismo (si es oficial) |
| Documento | `documentos.json` | slug (`mic-dta`) | países, tipos de carga |

**Fuentes como entidad propia:** hoy cada registro repite nombre y URL de su fuente. Pasarán a `fuentes.json` y los registros guardarán solo `fuente: "ar-dnm-pasos"` más la fecha de publicación de ese dato.

### D.2 Campos comunes de procedencia y temporalidad

| Campo | Uso |
|---|---|
| `fuente` | id de `fuentes.json` |
| `evidencia` | `oficial`, `declaracion-empresa`, `tercero`, `calculo`, `estimacion`, `historico` |
| `publicado` | fecha del dato en la fuente |
| `creado`, `actualizado` | fechas editoriales |
| `verificado`, `verificadoPor` | fecha y persona; nunca el asistente |
| `vigenteDesde`, `vigenteHasta` | validez del dato (incidencias, horarios especiales) |
| `validacion` | `verificado`, `por-verificar`, `borrador` |
| `proximaRevision` | calculada según el tipo de dato |

Historial: git es el historial completo. Se añade `cambios.json` generado en cada publicación con lo que cambió (para la IA DEV y para «Últimas actualizaciones»).

### D.3 Estados de paso por dimensión

```json
"estado": {
  "general":    { "valor": "abierto-restricciones", "fuente": "todojujuy-20261107", "publicado": "2026-11-07", "validacion": "por-verificar" },
  "carretera":  { "valor": "sin-informacion" },
  "aduana":     { "valor": "sin-informacion" },
  "migraciones":{ "valor": "abierto", "fuente": "ar-dnm-pasos", "publicado": "2025-12-10", "validacion": "por-verificar" },
  "sanitario":  { "valor": "sin-informacion" },
  "servicios":  { "valor": "sin-informacion" }
}
```

Valores: `abierto`, `cerrado`, `abierto-restricciones`, `operativa-parcial`, `sin-informacion`, `pendiente-verificacion`. Las restricciones temporales son incidencias vinculadas al paso, no un campo del estado. Regla de coherencia en `check`: `general = abierto` es incompatible con una incidencia activa de tipo cierre en ese paso.

### D.4 Esquemas y versionado

- Esquemas JSON (draft 2020-12) en `data/esquemas/`, uno por entidad, validados en CI con `ajv` (dependencia de desarrollo, sin coste).
- `"$schema"` y `"version"` en cada archivo. Cambio compatible (campo opcional nuevo) → versión menor; cambio incompatible → versión mayor y nueva carpeta `api/v2/`, manteniendo `v1` durante 6 meses.

Ejemplo (incidencia, resumido):

```json
{
  "$id": "https://guiacorredor/esquemas/incidencia-1.json",
  "type": "object",
  "required": ["id", "titulo", "categoria", "paises", "estado", "gravedad", "fuente", "publicado", "validacion"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9-]+$" },
    "categoria": { "enum": ["cierre-carretera", "restriccion", "obras", "accidente", "meteorologia", "inundacion", "nieve", "huelga", "frontera", "demora-aduanera", "restriccion-camiones", "infraestructura", "otro"] },
    "estado": { "enum": ["programada", "activa", "parcialmente-resuelta", "resuelta", "caducada", "pendiente-confirmacion"] },
    "gravedad": { "enum": ["informativa", "moderada", "grave", "bloqueante"] },
    "tramos": { "type": "array", "items": { "type": "string" } },
    "paso": { "type": "string" },
    "coordenadas": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
    "vigenteDesde": { "type": "string", "format": "date" },
    "vigenteHasta": { "type": "string", "format": "date" },
    "resuelta": { "type": "string", "format": "date" }
  }
}
```

### D.5 Reglas de calidad y caducidad

| Tipo de dato | Revisión | Al caducar |
|---|---|---|
| Estado de paso (operativo) | 30 días | «Por verificar» con último dato |
| Estado de obra o cierre | 120 días | «Por verificar» |
| Incidencia meteorológica | 3 días o `vigenteHasta` | Estado «caducada», pasa al histórico |
| Incidencia de obra | 60 días | Aviso al editor; sigue visible con fecha |
| Horario de organismo | 180 días | «Caducado» |
| Teléfono o email oficial | 365 días | «Sin verificar» |
| Empresa | 365 días | Se oculta del directorio hasta reconfirmar |
| Festivo | Su fecha | Pasa al histórico |
| Dato histórico | Nunca | — |

Reglas nuevas para `check`: duplicados por nombre normalizado y teléfono; coordenadas dentro de la caja del corredor (lat −17 a −27, lon −54 a −72); teléfonos en formato E.164 con prefijo del país; estados incompatibles; incidencias vencidas aún activas. Enlaces externos: tarea semanal en Actions que abre un aviso (issue) con los rotos, sin bloquear la publicación.

### D.6 Contrato para la IA DEV

- `api/v1/indice.json` (versión, fecha de generación, lista de recursos) y un archivo por entidad: `pasos.json`, `tramos.json`, `rutas.json`, `incidencias.json`, `calendario.json`, `empresas.json`, `fuentes.json`, `organismos.json`.
- Cada registro lleva `evidencia`, `validacion`, `publicado`, `verificado` y `fuente` resuelta (nombre, URL, tipo). El estado mostrable ya calculado (`estadoMostrable`) para que la IA no lo recalcule distinto que la web.
- Reglas para la IA (en `docs/ia-dev.md`): nunca confirmar un estado si `validacion != verificado` o si está caducado; citar siempre fuente y fecha; distinguir estimación, cálculo y dato oficial.
- Pruebas: 10 preguntas tipo con la respuesta esperada (p. ej. «¿Está abierto Jama?» → «No hay dato verificado. Último parte: operativo, 7/11/2026, TodoJujuy citando a Migraciones»).

---

## Entregable E · Propuesta de interfaz

Se mantiene la navegación actual (Rutas, Fronteras, Avisos, Calendario, Papeles, Servicios) y el sistema de diseño. Cambios:

| Pantalla | Cambio |
|---|---|
| Planificador | Selector por país → localidad. Bloque opcional «Mi vehículo» (peso, altura, ejes, peligrosas). Resultados: resumen, distancia por país, conducción frente a espera en frontera (separadas y etiquetadas), botón «Expediente de viaje» |
| Expediente de viaje | Página imprimible: resumen, mapa, itinerario, fronteras con sus 6 estados, documentos para revisar, alertas, servicios, contactos, fuentes y fecha de generación. Guardable sin conexión |
| Ficha de paso | Cabecera con las 6 dimensiones de estado (icono + texto + fecha). Horarios por organismo y lado. Botones de llamada y «cómo llegar» cuando haya datos con fuente |
| Avisos | Filtros por categoría, gravedad, estado y vigencia. Pestaña «Histórico» |
| Mapa | Capas activables: corredor, pasos, incidencias, servicios, zonas sin servicios. Funciona sin proveedor externo |
| Servicios | Ficha de empresa con sede y cobertura separadas; insignia «Datos confirmados por la empresa (fecha)». Formulario de alta, corrección y retirada |
| Buscador | Filtros por tipo y país, sinónimos, mensaje claro cuando no hay resultados |
| Global | Selector de idioma (ES/PT, EN después). Aviso «Datos guardados el …» en modo sin conexión |

---

## Entregable F · Plan de desarrollo

### P0 · Fiabilidad (antes de lanzar)

| Tarea | Esfuerzo | Depende de | Riesgo |
|---|---|---|---|
| Festivos de Brasil 2027 a «sin verificar» (3) y campo `verificadoPor` (4) | S | — | — |
| Fuente para cada coordenada o retirarla del mapa (1) | S | — | Quedarse sin mapa hasta tener fuente |
| Esquemas JSON + `ajv` en CI + versión de esquema (29) | L | — | Migrar datos sin romper páginas: se hace con pruebas antes y después |
| Reglas de calidad nuevas y comprobación semanal de enlaces externos (30) | M | Esquemas | Falsos positivos de enlaces (webs oficiales lentas) |
| Exportación `api/v1` + `docs/ia-dev.md` + preguntas de prueba (31) | M | Esquemas | Que la IA DEV no respete las reglas: se mitiga con las pruebas |
| Contacto del proyecto y formulario de solicitudes de empresas (24) | S | Email de Ernesto | — |

### P1 · Esencial

| Tarea | Esfuerzo | Depende de | Riesgo |
|---|---|---|---|
| Localidades separadas y rutas como grafo (2) | L | Esquemas | Cambia el formato de enlaces compartidos: se mantiene compatibilidad |
| Estado de paso por dimensión (5) | M | Esquemas | — |
| Incidencias: categorías, gravedad, estados, caducidad automática e histórico (18, 19) | M | Esquemas | — |
| Expediente de viaje imprimible (13) | M | — | — |
| Distancias oficiales por tramo (9) | S + datos | Fuentes | Fuentes con cifras distintas: se elige una y se cita |
| Primeras empresas verificadas (23) y tiempos de cruce activados (22) | S + gestiones | Ernesto | — |
| Analítica sin cookies (32), privacidad y aviso legal (39), flujo editorial con PR (38) | S | — | — |
| Pruebas automatizadas en el repositorio (41) | M | — | — |

### P2 · Mejoras operativas

Distancia por país y tiempo de conducción (10) · Filtro por paso en calendario (16) · Buscador con filtros y sinónimos (27) · Capas del mapa (28) · PWA sin conexión (34) · Llamada y «cómo llegar» (35) · JSON-LD (36) · Portugués (37) · Monitorización de publicación (40).

### P3 · Avanzado

Parámetros de vehículo con restricciones (11) · Suscripción automática por ruta (20) · Inglés · Conectores automáticos a fuentes oficiales (siempre entrando como «por verificar»).

### Costes recurrentes previstos

Ninguno obligatorio. GitHub Pages, Actions, GoatCounter, Google Forms y OpenStreetMap son gratuitos en este volumen. Únicos costes: el dominio (10–15 €/año) y, solo si se aprueba, un servicio de envío para suscripciones (P3).

---

## Para empezar la implementación (Entregable G) necesito

1. **Aprobación del plan**, o cambios de prioridad.
2. **Email de contacto del proyecto** (para el formulario de empresas).
3. **Qué es la IA DEV**: dónde corre y cómo lee datos (URL, archivo, otra herramienta), para ajustar el contrato `api/v1`.
4. **Quién figura como verificador** en `verificadoPor` (tú, tu contacto despachante, ambos).
