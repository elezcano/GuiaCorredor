# Integración con Claude (IA DEV)

La «IA DEV» no es una aplicación aparte: es **Claude trabajando con conectores** (GitHub, Trello y, cuando esté conectado, Atlassian). No mantiene una base de conocimiento propia. La única fuente de verdad son los datos del repositorio (`data/*.json`), y el contrato común para la web, Claude y cualquier otro consumidor es la exportación **`api/v1`**.

```
data/*.json ──► npm run check (esquemas + reglas) ──► build ──► web HTML
                                                       └────► api/v1/*.json ──► Claude y otros
```

La web y la API salen del mismo proceso (`scripts/build.mjs` → `scripts/api.mjs`) con las mismas funciones de estado (`scripts/validacion.mjs`). La prueba `scripts/prueba-api.mjs` falla en CI si la web y la API muestran estados distintos.

## Dónde leer los datos

| Mecanismo | Cómo | Cuándo usarlo |
|---|---|---|
| Web publicada | `https://elezcano.github.io/GuiaCorredor/api/v1/indice.json` | Consultas: es lo que ve el usuario. `robots.txt` permite `/api/` |
| Repositorio (GitHub) | Clonar `elezcano/GuiaCorredor` y ejecutar `npm install && npm run build`; la API queda en `dist/api/v1/` | Desarrollo, o cuando la web no es accesible |
| Datos en bruto | `data/*.json` | Solo para editar. Sin resolver fuentes ni calcular estados: **no** usarlos para responder |

Esquemas públicos: `https://elezcano.github.io/GuiaCorredor/esquemas/` (copia de `data/esquemas/`).

## Contrato api/v1

`indice.json` da la versión, la fecha de generación, las reglas de interpretación y la lista de recursos:

| Recurso | Contenido |
|---|---|
| `pasos.json` | Fichas de paso: ubicación con coordenadas y fuente, estado (con `mostrar`), horarios por organismo, horarios especiales, restricciones, acceso, organismos |
| `tramos.json` | Tramos con origen y destino, distancia (con evidencia y fuente, o `km: null`), paso y alternativa, estado (con `mostrar`), ids de incidencias |
| `rutas.json` | Rutas (principal y alternativa por Sico) como secuencias de nodos, tramos y pasos; `nodos` con coordenadas y fuente |
| `incidencias.json` | Obras, restricciones y cortes con tramos/paso, vigencia y validación |
| `calendario.json` | Festivos desde hoy, horarios por paso y la regla de interpretación |
| `empresas.json` | Empresas publicadas (solo revisadas por el responsable editorial), con sede y cobertura separadas |
| `fuentes.json` | Registro de fuentes (id, nombre, url, tipo) |
| `organismos.json` | Enlaces oficiales por país y tipo |

Cada archivo: `{ api: "v1", version, generado, recurso, registros: [...] }`.

Cada registro conserva: identificador, `fuente` **resuelta** (`{ id, nombre, url, tipo }`), `evidencia`, `publicado`, `actualizado`, `validacion`, `verificacion` (responsable y fecha, si existe), `vigencia` cuando corresponde, y además el `nivel` calculado (`verificado`, `por-verificar`, `caducado`, `borrador`) y `caducaEl`. Los estados llevan `mostrar`:

```json
"mostrar": { "valor": "pendiente", "ultimoReportado": "operativo", "confirmado": false, "nivelMostrado": "borrador", "texto": "Habilitado para todo tipo de vehículos…" }
```

### Versionado

- Campos nuevos o recursos nuevos: versión menor (`1.1.0`) en `api/v1`. Los consumidores deben ignorar campos que no conozcan.
- Cambio incompatible (renombrar o quitar campos, cambiar significados): nueva ruta `api/v2`. `api/v1` se sigue publicando **6 meses** con aviso en `indice.json`.
- Cada archivo de `data/` lleva `version` de su esquema; `indice.json` → `versionesDatos` las lista.

## Reglas de interpretación (obligatorias para Claude)

1. **Solo `nivel: "verificado"` es dato verificado.** Significa que el responsable editorial revisó el dato y su evidencia. Decirlo así: «verificado el AAAA-MM-DD».
2. Si `mostrar.confirmado` es `false`, la respuesta es **«por verificar»**. Se puede dar `ultimoReportado` y `texto` como «último dato publicado por <fuente> el <publicado>», nunca como estado confirmado.
3. Distinguir siempre la evidencia: `oficial` (organismo o norma), `tercero` (prensa, referencia), `declaracion-empresa`, `calculo`, `estimacion`, `historico`. Una estimación o un cálculo no es un dato oficial; un dato histórico no es la situación actual.
4. `distancia.km: null` = no hay distancia con fuente. **No estimar ni sumar** tramos sin dato; decir cuántos faltan.
5. Coordenadas con `precision: "referencia"` son puntos de referencia de nodos que agrupan varias localidades. No sirven para medir distancias operativas.
6. Un festivo no implica que la aduana cierre. Solo cuentan horarios u horarios especiales del organismo.
7. Directorio vacío = no hay empresas publicadas. No sugerir empresas de fuera de la API como si fueran del directorio.
8. Citar siempre la fuente (nombre y URL) y la fecha de publicación.
9. Claude **nunca** marca un dato como verificado ni escribe `verificacion`. Puede proponer cambios por Pull Request con los datos en `por-verificar`.

## Preguntas de prueba y respuestas esperadas (datos del 15/11/2026)

| Pregunta | Respuesta esperada |
|---|---|
| ¿Está abierto el Paso de Jama? | Por verificar. El último dato publicado (TodoJujuy, parte de Migraciones, 07/11/2026, fuente de terceros) lo daba habilitado para todo tipo de vehículos con precaución por clima. Hay incidencias de cierres preventivos por clima en el tramo. No está confirmado por el responsable editorial. |
| ¿Puedo cruzar ya por el Puente de la Bioceánica? | Según el último dato publicado (Revista Plus, 14/10/2026) no está habilitado al tránsito; accesos previstos para febrero de 2027. Por verificar. |
| ¿Cuántos km hay de Campo Grande a Antofagasta? | No hay distancia total con fuente. Documentados: Puente 1,3 km (prensa), Carmelo Peralta–Mariscal Estigarribia 307 km (cálculo), Mariscal Estigarribia–Pozo Hondo 224 km (prensa). Cuatro tramos sin dato. No se estima. |
| ¿Cierra la aduana chilena el 1 de enero de 2027? | El 1 de enero es feriado nacional en Chile (por verificar), pero eso no implica cierre de la aduana. No hay horario especial publicado para esa fecha; confirmar con el organismo. |
| ¿Qué transportistas hay en Pozo Hondo? | El directorio no tiene empresas publicadas todavía. |
| ¿Dónde está exactamente «Salta / Jujuy»? | Es un nodo que agrupa dos ciudades; la coordenada es un punto de referencia en la ciudad de Salta (Wikipedia), no una ubicación operativa. |

Cuando cambien los datos, actualizar esta tabla en el mismo Pull Request.

## Conectores: qué permite cada uno (comprobado el 14–15/11/2026)

| Conector | Operaciones comprobadas | Limitaciones |
|---|---|---|
| **GitHub** (CLI `gh` y git en sesiones de Claude con el repositorio añadido) | Leer y clonar el repositorio, crear ramas, commits, Pull Requests e issues, etiquetas y fusionar PR mediante la API | Actúa con la cuenta del propietario: la regla de no verificar es de procedimiento hasta proteger `main` (P1.11, #49). No hay salida a internet desde el terminal salvo GitHub |
| **Trello** | Leer y escribir tableros, listas, tarjetas y checklists del tablero *Guía del Corredor Bioceánico* | Solo se trabaja en ese tablero; los demás del usuario no se tocan |
| **Atlassian** | No conectado en las sesiones de trabajo hasta la fecha | Pendiente de conectar para documentación y coordinación |
| **Lectura web** (WebFetch) | Páginas públicas permitidas | `elezcano.github.io` y Wikipedia no estaban en la lista permitida de la sesión: la API publicada no se pudo leer desde Claude; se usa el repositorio (fila 2 de «Dónde leer los datos») |

## Flujo de trabajo con Claude

1. Claude investiga y prepara la propuesta en una rama: datos en `por-verificar`, fuente en `data/fuentes.json`, evidencia correcta.
2. `npm run check` y `npm run prueba` sin errores.
3. Pull Request; Claude registra el avance en el issue y en Trello.
4. Ernesto revisa y, si procede, verifica (escribe `verificacion`), pone la etiqueta `revision-editorial` y fusiona. Claude no pone esa etiqueta.
