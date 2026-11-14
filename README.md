# ◆ Guía del Corredor Bioceánico

Plataforma de información e inteligencia logística del **Corredor Bioceánico de Capricornio** (Brasil – Paraguay – Argentina – Chile), para transportistas, operadores logísticos, transitarios, importadores, exportadores y empresas de servicios.

Responde a preguntas operativas: qué pasos fronterizos usar y cómo están, qué organismos atienden y en qué horario, qué obras o restricciones afectan a la ruta, qué distancia hay entre localidades, qué empresas dan servicio en cada zona y qué papeles hacen falta.

> **Estado: versión borrador (MVP).** Los datos se muestran «Por verificar» hasta que el responsable editorial los revise.

> **Principio rector:** la fiabilidad tiene prioridad sobre la cantidad. Ningún dato se muestra como confirmado si no lo ha verificado una persona responsable.

- Web: **https://elezcano.github.io/GuiaCorredor/**
- Datos abiertos: [`/api/v1/indice.json`](https://elezcano.github.io/GuiaCorredor/api/v1/indice.json)
- Contacto del proyecto: elezcanofm@gmail.com
- Responsable editorial y de verificación: Ernesto

> Este repositorio sustituye al antiguo proyecto *Red de Cargas*; su estado anterior está en la rama [`legacy-red-de-cargas`](../../tree/legacy-red-de-cargas).

## Decisiones aprobadas (14/11/2026)

| # | Decisión |
|---|---|
| 1 | Plan de la [auditoría](docs/auditoria-2026-11.md) aprobado, por fases P0 → P1 → P2 → P3 |
| 2 | Arquitectura **estática** en GitHub Pages. Sin backend ni base de datos externa en esta fase |
| 3 | Primero, modelo de datos normalizado y exportación JSON estable (`api/v1`) |
| 4 | Claude, con conectores, es el entorno de trabajo asistido del equipo de desarrollo ([`docs/ia-dev.md`](docs/ia-dev.md)) |
| 5 | GitHub es la fuente de verdad del código y de los datos publicados |
| 6 | Issues de GitHub y Trello (tablero *Guía del Corredor Bioceánico*) para tareas; Atlassian cuando esté conectado |
| 7 | La verificación humana corresponde a Ernesto (`responsable-editorial`). Nunca a la IA ni a terceros por defecto |
| 8 | Contacto del proyecto: elezcanofm@gmail.com |
| 9 | Prioridad: datos fronterizos, información aduanera y primeras empresas verificadas |
| 10 | *(15/11)* Distancias: estimación provisional en línea recta donde no hay dato con fuente, indicando qué tramo exacto se estima, hasta tener distancias oficiales |
| 11 | *(15/11)* Lo que no se pueda justificar con fuente se retira provisionalmente (Mejillones e Iquique del mapa) |
| 12 | *(15/11)* Solicitudes de empresas a un formulario de Google con hoja privada (email mientras no esté configurado) |
| 13 | *(15/11)* Cambios de formato de la API avisados (`indice.json`, [`docs/api-cambios.md`](docs/api-cambios.md)) y gestionados con registro de versiones y contrato; la versión anterior se mantiene 6 meses |
| 14 | *(15/11)* `main` sin proteger mientras la web sea un borrador; se protegerá más adelante (#49) |

## Qué es y qué no es

| Es | No es |
|---|---|
| Una guía gratuita de pasos, tramos y papeles, con fuente, fecha y estado de verificación en cada dato | Un marketplace donde se negocian cargas |
| Un directorio de empresas reales revisadas, con ficha básica gratis y ficha destacada de pago | Un intermediario: no movemos dinero entre empresas |
| Un planificador de ruta: tramos, fronteras, estado, incidencias, festivos y documentos | Un sitio de reseñas o rankings |
| Una exportación de datos abierta (`api/v1`) que leen la web, Claude y otros sistemas | Una web con cuentas de usuario (fase posterior) |

## Arquitectura

```
Fuentes oficiales / empresas / investigación
        │
        ▼
Investigación asistida (Claude) ──► propuesta en una rama, datos «por verificar»
        │
        ▼
Revisión y verificación de Ernesto (Pull Request, etiqueta revision-editorial)
        │
        ▼
data/*.json ──► esquemas JSON + npm run check ──► GitHub Actions
                                                    ├──► web HTML ──► GitHub Pages
                                                    └──► api/v1 JSON ──► Claude y otros
```

```
data/                Datos (fuente de verdad)
  esquemas/          Esquemas JSON Schema Draft 2020-12 (validación con ajv)
  fuentes.json       Registro único de fuentes; los datos las citan por id
  pasos.json         Fichas operativas de pasos (estado, horarios por organismo, coordenadas)
  rutas.json         Nodos (con coordenadas y fuente) y tramos (estado, distancia)
  incidencias.json   Obras, restricciones, cortes
  festivos.json      Calendario de festivos con su norma
  organismos.json    Enlaces oficiales
  directorio.json    Empresas revisadas (sede y cobertura separadas)
  novedades.json, avisos.json, categorias.json, site.json
content/guia/        Fichas de la guía en Markdown
scripts/
  validacion.mjs     Sistema único de validación (web, API y comprobaciones)
  estimaciones.mjs   Estimaciones provisionales de distancia (web y API)
  datos.mjs          Carga única de datos: resuelve fuentes y coordenadas
  build.mjs          Genera la web y api/v1 en dist/
  api.mjs            Contrato de la exportación api/v1
  check.mjs          Esquemas + reglas de contenido y calidad
  esquemas.mjs       Validación ajv
  prueba-api.mjs     Coherencia web / API
  verificaciones.mjs Exige revisión editorial a las verificaciones nuevas de un PR
  enlaces.mjs        Enlaces internos · enlaces-externos.mjs: revisión semanal de URL
  migraciones/       Migraciones de datos ejecutadas (registro)
src/assets/          CSS y JavaScript del navegador
docs/                Auditoría, política de validación, integración con Claude, cómo editar
```

## Política de validación (resumen)

Detalle en [`docs/politica-validacion.md`](docs/politica-validacion.md).

- Estados: `borrador`, `por-verificar`, `verificado`. **Solo Ernesto verifica**; el registro lleva `verificacion { verificadoPor: "responsable-editorial", rol, fecha, alcance }`.
- La IA nunca marca un dato como verificado. Toda automatización deja los datos en `por-verificar`.
- Evidencia: `oficial`, `declaracion-empresa`, `tercero`, `calculo`, `estimacion`, `historico`. Una estimación no es un dato oficial; un dato histórico no es la situación actual.
- La interfaz distingue verificado, por verificar, caducado, borrador, estimación provisional y sin dato. Las distancias sin fuente se estiman provisionalmente en línea recta, siempre marcadas como tal.
- Un festivo no implica cierre de aduana.

## Datos abiertos: api/v1

`indice.json`, `pasos.json`, `tramos.json`, `rutas.json`, `incidencias.json`, `calendario.json`, `empresas.json`, `fuentes.json`, `organismos.json`. Cada registro trae la fuente resuelta, la evidencia, las fechas, la validación y el estado ya calculado con el mismo código que la web. Contrato, versionado y reglas de interpretación en [`docs/ia-dev.md`](docs/ia-dev.md); cambios de formato en [`docs/api-cambios.md`](docs/api-cambios.md).

## Uso

Requisito: Node 20 o superior.

```bash
npm install              # una vez
npm run check            # esquemas JSON + reglas de contenido y calidad
npm run prueba           # genera la web y la API y comprueba coherencia y enlaces internos
npm run dev              # genera y abre http://localhost:4321
npm run verificaciones   # verificaciones nuevas respecto a main
npm run enlaces-externos # comprueba las URL externas (informe, no bloquea)
```

Cómo editar datos, añadir fuentes, verificar y tramitar solicitudes de empresas: [`docs/como-editar.md`](docs/como-editar.md).

## Publicación

Cada cambio en `main` pasa por `check` → `build` → coherencia web/API → enlaces internos → despliegue en GitHub Pages (`.github/workflows/publicar.yml`; también cada 3 horas para recoger tiempos de cruce). En los Pull Requests se exige la etiqueta `revision-editorial` si hay verificaciones nuevas. Los lunes, `enlaces-externos.yml` revisa las URL externas y deja el resultado en un issue.

- Con dominio propio: poner el dominio en `url`, dejar `basePath` vacío y configurarlo en Settings → Pages → *Custom domain*. Coste: solo el dominio.
- Para pausar la publicación: variable de repositorio `PUBLICAR` = `false`.

## Estado del plan

| Fase | Qué | Estado |
|---|---|---|
| **P0** Fiabilidad | Verificación humana (#36), coordenadas con fuente (#37), modelo y esquemas (#38), calidad automática (#39), api/v1 y Claude (#40), contacto y solicitudes de empresas (#18) | Implementado; pendiente de revisión de Ernesto ([informe](docs/informe-p0.md)) |
| **P1** Logística esencial | Localidades separadas y rutas como grafo (#41), estado por dimensión (#42), fichas fronterizas (#43), incidencias completas y caducidad (#44), expediente de viaje (#45), distancias oficiales (#23), piloto de 2–3 empresas (#46), tiempos de cruce (#47), legal y privacidad (#48), analítica sin cookies (#19), flujo editorial por PR (#49), pruebas en el repositorio (#50) | Pendiente |
| **P2** Mejoras operativas | Tiempos de conducción, filtros, capas del mapa, PWA, portugués (#20), avisos de estado (#25), SEO | Pendiente |
| **P3** Avanzadas | Parámetros de vehículo, suscripciones, inglés, conectores a fuentes oficiales, CRT y MIC/DTA (#24), autoservicio (#26) | Cuando haya datos y uso real |

Issues por fase: etiquetas [`P0`](../../issues?q=label%3AP0), [`P1`](../../issues?q=label%3AP1), [`P2`](../../issues?q=label%3AP2), [`P3`](../../issues?q=label%3AP3).

## Antes del lanzamiento

- [x] Email de contacto del proyecto
- [ ] Formulario de Google de solicitudes de empresas (enlace prellenado en `data/site.json`)
- [x] Ninguna empresa ficticia en el directorio
- [ ] Primeras empresas reales verificadas (#46)
- [ ] Revisión de las fichas de la guía y verificación por el responsable editorial (#22)
- [ ] Enlace de suscripción de PayPal de la ficha destacada (#17)
- [ ] Aviso legal y privacidad (#48)
- [ ] Dominio (#16) e `"indexable": true` en `data/site.json`
