# Informe de cierre de P0 (fiabilidad y preparación del lanzamiento)

Fecha: 15/11/2026. Rama `p0-fiabilidad`. Pendiente de revisión de Ernesto antes de integrar en `main`.

## Comprobaciones al empezar (línea base)

Se repitieron las de la auditoría del 14/11/2026 sobre `main` (tras fusionar #35): 19 páginas, `check` sin errores, 0 enlaces internos rotos, 21 comprobaciones funcionales locales sin fallos. Sin diferencias con la auditoría.

## Tareas completadas

| Tarea | Qué se hizo |
|---|---|
| **P0.1** Verificación (#36) | Ningún registro queda `verificado`: los 64 festivos y 20 organismos que marcó la IA pasan a `por-verificar` (incluidos los festivos de Brasil 2027). La fecha de esas comprobaciones se conserva en `actualizado`. Nuevo campo `verificacion { verificadoPor, rol, fecha, alcance }` con el identificador `responsable-editorial`. El esquema y `check` rechazan `verificado` sin verificación válida. La CI exige la etiqueta `revision-editorial` en un PR que añade verificaciones (`scripts/verificaciones.mjs`). Las fichas Markdown necesitan además `verificadoPor` |
| **P0.2** Coordenadas (#37) | Cada coordenada lleva fuente, evidencia, precisión y fecha de consulta (Wikipedia, Geodatos, Terralocate; todas `tercero`). Retiradas por no tener fuente: Puente de la Bioceánica (se dibuja entre sus dos localidades), Mejillones e Iquique (fuera del mapa hasta P1.1). Los nodos fusionados usan un punto de referencia declarado (Salta, San Pedro de Atacama, Antofagasta). El planificador deja de estimar distancias en línea recta: muestra «Distancia sin fuente» |
| **P0.3** Modelo (#38) | `data/fuentes.json` con 35 fuentes; los datos las citan por id. Campos comunes: `evidencia`, `actualizado`, `verificacion`, `vigencia`. 11 esquemas Draft 2020-12 en `data/esquemas/` validados con ajv en `check`. Cada archivo lleva `$schema` y `version`. Migración en `scripts/migraciones/001-p0-modelo.mjs`. Carga única en `scripts/datos.mjs`. Las páginas siguen igual salvo lo indicado |
| **P0.4** Calidad (#39) | `check` añade: duplicados por nombre normalizado y teléfono, coordenadas dentro del corredor, teléfonos E.164, estados incompatibles, incidencias vencidas activas, referencias inexistentes (fuentes, tramos, pasos, organismos, puntos), fechas futuras e incoherentes, fuentes repetidas o sin uso. Revisión semanal de enlaces externos que abre o actualiza un issue sin bloquear |
| **P0.5** API (#40) | `api/v1` con índice y 8 recursos, fuente resuelta y estado calculado por el mismo código que la web. Esquemas publicados en `/esquemas/`. `robots.txt` permite `/api/`. Contrato, versionado, reglas, conectores y preguntas de prueba en `docs/ia-dev.md`. Prueba de coherencia web/API en CI |
| **P0.6** Contacto y empresas (#18) | Contacto `elezcanofm@gmail.com` en `site.json` (pie, «Cómo trabajamos», formulario). Formulario en `/anunciate/` de alta, corrección y retirada: prepara un email al contacto, sin servidor ni coste. Las solicitudes no se publican: se revisan y entran por PR (`docs/como-editar.md`) |
| Documentación | `README.md`, `docs/politica-validacion.md`, `docs/ia-dev.md`, `docs/como-editar.md`, página «Cómo trabajamos la información» |

## Pruebas realizadas

| Prueba | Resultado |
|---|---|
| `npm run check` (esquemas + reglas) | 0 errores, 21 avisos (todos conocidos: borradores, tramos sin dato, PayPal, indexable, tiempos de cruce, directorio vacío) |
| Pruebas negativas de `check` (empresa duplicada, teléfono local, incidencia vencida activa, tramo inexistente, coordenada fuera de rango, `verificado` sin verificación) | Todas detectadas |
| `build` | 19 páginas + 9 archivos de `api/v1` |
| `prueba-api.mjs` (estado web = estado API en pasos y tramos; nada verificado sin verificación) | 0 fallos |
| `enlaces.mjs` | 0 enlaces internos rotos |
| `verificaciones.mjs` frente a `main` | Ninguna verificación nueva |
| 21 comprobaciones funcionales con navegador (portada, planificador, avisos, fichas, calendario, buscador) | Sin fallos (umbral del mapa ajustado de 10 a 9 enlaces al retirar Mejillones e Iquique) |
| Formulario de empresas (validación, teléfono internacional, campos por tipo, texto de la solicitud, móvil sin desbordes) | Correcto |

## Limitaciones detectadas

- **Web publicada y enlaces externos:** desde la sesión no hay acceso a `elezcano.github.io` ni salida a internet desde el terminal. La revisión de enlaces externos corre en GitHub Actions.
- **Control de verificación:** es de procedimiento mientras el asistente use la cuenta del propietario. Para que sea técnico: proteger `main` y exigir su revisión (P1.11, #49).
- **Atlassian:** no conectado en la sesión; Trello y GitHub sí.
- **Coordenadas:** fuentes de referencia (no oficiales); Pozo Hondo procede de un agregador. Quedan `por-verificar`.
- **Formulario por email:** depende de que el usuario tenga un programa de correo; hay botón de copiar como alternativa. Un servicio de formularios (Formspree, Google Forms) evitaría ese paso; Google Forms es gratis, Formspree tiene plan gratuito limitado.
- **Pruebas de navegador:** siguen en local; pasan al repositorio en P1.12 (#50).

## Pendiente (fuera de P0)

- Verificación por Ernesto de los datos prioritarios: estado de los cuatro pasos, horarios, festivos de 2027.
- P1: ver issues con la etiqueta `P1`.

## Decisiones técnicas pendientes de aprobación

1. **Distancias:** se retiró la estimación en línea recta del planificador. ¿Se acepta mostrar solo distancias con fuente hasta P1.7?
2. **Mapa:** Mejillones e Iquique salen del mapa hasta separar localidades (P1.1).
3. **Canal de solicitudes:** email prellenado (sin coste) frente a un formulario de Google (gratis, con hoja de cálculo). Se recomienda empezar por email.
4. **Periodo de transición de la API:** 6 meses para una versión incompatible.
5. **Protección de `main`** con revisión obligatoria del propietario (P1.11).
