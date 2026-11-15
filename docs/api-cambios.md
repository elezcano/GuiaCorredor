# Cambios de la exportación de datos (api)

Registro para quien consume los datos (Claude incluido). La misma lista sale en `api/v1/indice.json` → `avisos`.

**Cómo se gestiona el formato** (detalle en [`ia-dev.md`](ia-dev.md#versionado)):

- Registro de versiones en `scripts/api.mjs` → `API_VERSIONES` (estado `estable` u `obsoleta`, `obsoletaDesde`, `retiradaPrevista`).
- Contrato de `v1` en `data/esquemas/api-v1.schema.json`. Si la salida deja de cumplirlo, la CI falla: el cambio es incompatible y necesita `v2`.
- Un cambio incompatible crea `api/v2`; `v1` se marca `obsoleta` y se sigue publicando **6 meses**. `npm run check` avisa 30 días antes de la retirada y falla si se pasa la fecha.
- Cada cambio se anota aquí y en `AVISOS_API`.

| Fecha | Versión | Tipo | Cambio |
|---|---|---|---|
| 15/11/2026 | 1.5.0 | Compatible | `pasos[]`: `partes` (lado, emisor, organismo, valor, texto, `publicado` y `hora` local del país) |
| 15/11/2026 | 1.4.0 | Compatible | `pasos[]`: `historial` (novedades del paso con fecha y fuente), `controles` (en orden), horarios con `apertura`/`cierre`/`zona`, contactos con `telefono` E.164 |
| 15/11/2026 | 1.3.0 | Compatible | Campo opcional `otrasFuentes`: fuentes adicionales que respaldan el dato, resueltas |
| 15/11/2026 | 1.2.0 | Compatible | `mostrar.nivelMostrado` deja de rebajarse por el borrador del texto de la guía: un estado operativo verificado se muestra como confirmado |
| 15/11/2026 | 1.1.0 | Compatible | Nuevo `tramos[].estimacion` y `tramos[].alternativa.estimacion`: estimación provisional en línea recta para tramos sin distancia con fuente (`evidencia: "estimacion"`). `indice.json` añade `estado`, `versionesDisponibles` y `avisos` |
| 15/11/2026 | 1.0.0 | Inicial | Primera versión: índice, pasos, tramos, rutas, incidencias, calendario, empresas, fuentes y organismos |
