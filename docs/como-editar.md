# Cómo editar la web (sin programar)

Todo se edita desde GitHub en el navegador: abre el archivo, pulsa el lápiz, cambia y guarda ("Commit changes"). La web se regenera sola.

## Solicitudes de empresas

Las empresas piden el alta, una corrección o la retirada desde `/anunciate/`. El formulario no guarda nada: abre un email dirigido al contacto del proyecto (`contacto.email` en `data/site.json`) con asunto `[Solicitud de empresa] Alta: Nombre` y los datos en líneas `Campo: valor`.

1. Al llegar el email, crea una tarjeta en Trello (tablero *Guía del Corredor Bioceánico*, lista de solicitudes) y pega el texto. **No** la subas al repositorio: es público y la solicitud aún no está revisada.
2. Revisa la empresa: existe, opera en el corredor, la sede y la cobertura cuadran, las referencias responden.
3. Si se publica, añádela a `data/directorio.json` en una rama y abre un Pull Request con la etiqueta `revision-editorial`.
4. Una retirada se atiende siempre: borra el registro y avisa a la empresa.

## Añadir una empresa al directorio

Solo empresas reales que el responsable editorial ha revisado. Nunca empresas de ejemplo, valoraciones ni reseñas externas. La **sede** (`pais`, `ciudad`) es distinta de la **cobertura** (`puntos`, `cobertura`).

1. Si la fuente no existe, añádela a `data/fuentes.json` (`tipo: "empresa"` si es la propia empresa).
2. Añade el bloque en `data/directorio.json` → `empresas`. El `id` no se repite. Teléfonos en formato internacional sin espacios (`+595211234567`).

```json
{
  "id": "nombre-empresa-ciudad",
  "nombre": "Nombre comercial",
  "razonSocial": "Razón social S.A.",
  "categoria": "transitario",
  "pais": "PY",
  "ciudad": "Loma Plata",
  "puntos": ["mariscal-estigarribia"],
  "cobertura": "Chaco central y Pozo Hondo",
  "servicios": ["Granos"],
  "destacada": false,
  "contacto": { "email": "info@empresa.com", "telefono": "+595211234567", "web": "https://empresa.com" },
  "fuente": "empresa-nombre",
  "evidencia": "declaracion-empresa",
  "publicado": null,
  "actualizado": "AAAA-MM-DD",
  "validacion": "verificado",
  "verificacion": { "verificadoPor": "responsable-editorial", "rol": "responsable-editorial", "fecha": "AAAA-MM-DD", "alcance": "Existencia de la empresa, contacto y cobertura comprobados" }
}
```

`puntos`: `campo-grande`, `porto-murtinho`, `carmelo-peralta`, `mariscal-estigarribia`, `pozo-hondo`, `salta-jujuy`, `norte-chile`, `puertos-chile`. Categorías: `data/categorias.json`. La verificación caduca al año.

## Añadir o actualizar una página de la guía

1. En `content/guia/pasos/` (o `tramos/`, `documentos/`) crea `nombre-del-paso.md`.
2. Copia la cabecera de otra página. No pongas `estado:`: sale de los datos.
3. Escribe el contenido. Termina con `## Fuentes` y los enlaces (mejor si hay alguno oficial).
4. Al revisar una página, actualiza `revisado:` con la fecha del día.
5. Mientras no esté revisada: `validacion: borrador`. Cuando el responsable editorial la haya revisado (con el despachante si hace falta): `validacion: verificado`, `verificado: AAAA-MM-DD` y `verificadoPor: responsable-editorial`.

## Añadir una novedad

Abre `data/novedades.json` y añade un bloque al principio:

```json
{
  "publicado": "2026-12-02",
  "tema": "Paso fronterizo",
  "titulo": "Paso de Jama cerrado por nieve",
  "detalle": "Reapertura prevista cuando mejore el tiempo del lado chileno.",
  "guia": "pasos/jama",
  "paises": ["AR", "CL"],
  "fuente": "vialidad-chile",
  "evidencia": "oficial",
  "actualizado": null,
  "validacion": "por-verificar",
  "verificacion": null
}
```

- Las novedades **no** llevan estado. Si la noticia cambia el estado de un paso o un tramo, actualízalo en `data/pasos.json` o `data/rutas.json`, y si es una obra o un corte, añade la incidencia en `data/incidencias.json`.
- `guia` la muestra en «Últimos cambios» de esa ficha.
- A los 90 días pasa a «Histórico» y deja de salir en la portada.

## Cobrar la ficha destacada con PayPal

1. En PayPal Business: *Pagar y recibir pagos* → *Suscripciones* → crea el producto "Ficha destacada" con un plan de 45 €/mes.
2. Copia el enlace para compartir del plan.
3. En `data/site.json`, dentro de `planes`, pégalo en `"enlacePago"` del plan `destacada`. El botón "Contratar con PayPal" aparece solo.
4. Cuando entre un pago: pon `"destacada": true` en la empresa y emite la factura como autónomo.

## Activar los tiempos de cruce

Quien cruza una frontera cuenta cuánto tardó (de la fila a la salida de la aduana) desde la página del paso. La web muestra la mediana de los últimos 7 días por sentido, con un mínimo de 3 reportes. Los reportes se guardan en un formulario de Google tuyo; la web se vuelve a publicar sola cada 3 horas con los datos nuevos.

Se hace una vez y lleva unos 5 minutos:

1. En [forms.google.com](https://forms.google.com) crea un formulario en blanco. Título: "Tiempos de cruce – Guía del Corredor".
2. Añade 5 preguntas de tipo **Respuesta corta** con estos títulos exactos, en minúscula: `paso`, `sentido`, `tiempo`, `fecha`, `dispositivo`. Ninguna obligatoria.
3. En **Configuración → Respuestas**: no recoger correos y **no** activar "Limitar a 1 respuesta" (obliga a iniciar sesión).
4. Menú ⋮ → **Obtener enlace prellenado**. Escribe en cada pregunta, en mayúsculas: `PASO`, `SENTIDO`, `TIEMPO`, `FECHA`, `DISPOSITIVO`. Pulsa **Obtener enlace** y cópialo.
5. Pestaña **Respuestas → Vincular con Hojas de cálculo** → crear hoja nueva. En la hoja: **Archivo → Compartir → Publicar en la Web**, elige la hoja de respuestas y **Valores separados por comas (.csv)**, publica y copia el enlace.
6. Pega los dos enlaces en `data/site.json`:

```json
"cruces": {
  "enlacePrellenado": "https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.…=PASO&…",
  "csv": "https://docs.google.com/spreadsheets/d/e/…/pub?gid=…&single=true&output=csv"
}
```

`npm run check` te avisa si falta algo. Hasta que pegues el primer enlace, el botón "Contar mi tiempo" no aparece.

- La hoja publicada es pública: solo contiene el paso, el sentido, el tiempo, el día y un número al azar por navegador. Nada personal.
- Para borrar un reporte falso, borra su fila en la hoja; desaparece en la siguiente publicación.
- Cada navegador cuenta una vez por paso y día. No es a prueba de alguien empeñado en falsear, pero la mediana aguanta reportes sueltos extremos.
- GitHub desactiva las tareas programadas si el repositorio pasa 60 días sin cambios. Si los tiempos dejan de actualizarse, haz cualquier cambio (una novedad) o pulsa **Actions → Publicar web → Enable workflow**.

## Validación: un solo sistema para todo el portal

La política completa está en [`politica-validacion.md`](politica-validacion.md). Todo dato operativo lleva:

| Campo | Qué es |
|---|---|
| `fuente` | id de `data/fuentes.json` (nombre, url y tipo están allí, una sola vez) |
| `evidencia` | `oficial`, `declaracion-empresa`, `tercero`, `calculo`, `estimacion` o `historico` |
| `publicado` | Fecha (AAAA-MM-DD) en que la fuente publicó el dato. `null` si es una norma o no consta |
| `actualizado` | Última vez que se comprobó contra la fuente (lo puede hacer el asistente) |
| `validacion` | `verificado`, `por-verificar` o `borrador` |
| `verificacion` | `null`, o `{ verificadoPor, rol, fecha, alcance }` cuando lo verifica el responsable editorial |

**Regla:** un estado (operativo, en obras…) solo se muestra como confirmado si el dato está `verificado` **y** su ficha también. Si no, la web muestra «Por verificar» con el último dato, su fuente y su fecha. Una verificación caduca sola:

| Tipo de dato | Caduca a los |
|---|---|
| Estado operativo de paso o tramo | 30 días |
| Estado de obra o cierre | 120 días |
| Incidencia | 60 días |
| Horario | 180 días |
| Ficha, empresa, enlace de organismo | 365 días |

**Para marcar algo como verificado (solo el responsable editorial):** comprueba el dato y su evidencia, pon `"validacion": "verificado"` y `"verificacion": { "verificadoPor": "responsable-editorial", "rol": "responsable-editorial", "fecha": "AAAA-MM-DD", "alcance": "qué comprobaste" }`. Hazlo en un Pull Request y ponle la etiqueta `revision-editorial`: sin ella, la comprobación del PR falla. El asistente de IA nunca escribe `verificado` ni `verificacion`.

## Dónde está cada dato (sin duplicados)

| Dato | Archivo | Aparece en |
|---|---|---|
| Estado de un paso | `data/pasos.json` → `estado` | Portada, mapa, Fronteras, ficha, planificador |
| Horarios y horarios especiales | `data/pasos.json` → `horarios`, `horariosEspeciales` | Ficha del paso y calendario aduanero |
| Estado y distancia de un tramo | `data/rutas.json` → `reporte`, `km`, `kmTipo` | Ficha del tramo y planificador |
| Obras, cortes, restricciones | `data/incidencias.json` (con `tramos` y/o `paso`) | Avisos, ficha del tramo o paso, planificador, portada |
| Noticias | `data/novedades.json` (con `guia`) | Novedades, portada (90 días) y ficha vinculada |
| Festivos | `data/festivos.json` | Calendario, portada, planificador |
| Organismos | `data/organismos.json` | Fichas, avisos, papeles |
| Empresas | `data/directorio.json` (solo `validacion: verificado`) | Servicios, fichas, planificador |
| Fuentes | `data/fuentes.json` | Todos los datos las citan por id |
| Coordenadas | `data/rutas.json` → `nodos[].coordenadas`, `data/pasos.json` → `ubicacion.coordenadas` (con fuente y precisión) | Mapa y fichas |

Las fichas Markdown **no** llevan estado ni una sección «## Estado»: el estado se genera desde los datos.

- **Incidencia:** `tramos` = ids de `data/rutas.json` (`cg-pm`, `puente`, `cp-me`, `me-ph`, `pozo-hondo`, `andes`, `calama-puertos`). Si además lleva `paso`, solo se muestra en la variante de ruta que pasa por ese paso. Tipos: `obra`, `restriccion`, `corte`, `pendiente`, `peso`, `desvio`. Pon `"estado": "resuelta"` cuando termine.
- **Distancia de un tramo:** `kmTipo: "fuente"` con `kmFuente`, o `kmTipo: "calculado"` con `kmNota` explicando la cuenta. Sin km, el planificador muestra «Distancia sin fuente»: no se estima.
- **Horario especial:** en `horariosEspeciales` con `desde`, `hasta`, `organismo` (`aduana`, `migraciones`, `sanitario`, `complejo`), `lado`, `texto` y los cuatro campos comunes.
- **Avisos meteorológicos:** `data/avisos.json` con `titulo`, `zona`, `vigenteHasta` y los campos comunes. Desaparecen solos al vencer.
- **Festivos:** añade el año siguiente cada noviembre; los traslados por decreto van con `validacion: por-verificar` hasta que se publiquen.

## Comprobaciones

- `npm run check`: esquemas JSON (`data/esquemas/`, con ajv) y reglas de contenido: fuentes y referencias existentes, estados compatibles, verificaciones solo del responsable editorial, incidencias vencidas que siguen activas, fechas futuras o incoherentes, duplicados de empresas por nombre y teléfono, teléfonos internacionales, coordenadas dentro del corredor.
- `npm run prueba`: genera la web y comprueba que la web y `api/v1` muestran el mismo estado, y que no hay enlaces internos rotos.
- `npm run verificaciones`: lista los registros que pasan a `verificado` respecto a `main` (en los PR se exige la etiqueta `revision-editorial`).
- `npm run enlaces-externos`: comprueba las URL de fuentes, organismos y guía. Se ejecuta cada lunes y deja el resultado en un issue; no bloquea la publicación.
- `npm run informe`: regenera `docs/informe-contenidos.md`.

## Si algo falla

Si después de guardar sale una cruz roja en GitHub (pestaña *Actions*), ábrela: el mensaje `ERROR` dice qué archivo y qué campo está mal. Lo más habitual es una coma de más o de menos en un JSON.
