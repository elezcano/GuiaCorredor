# Cómo editar la web (sin programar)

Todo se edita desde GitHub en el navegador: abre el archivo, pulsa el lápiz, cambia y guarda ("Commit changes"). La web se regenera sola.

## Añadir una empresa al directorio

Solo se publican empresas que han confirmado sus datos (por WhatsApp, email o llamada). Nunca empresas de ejemplo ni datos sin confirmar.

1. Abre `data/directorio.json` (es una lista `[ ]`).
2. Añade un bloque por empresa. El `id` no puede repetirse.
3. Para hacerla destacada (ha pagado): `"destacada": true`.

```json
{
  "id": "nombre-empresa-ciudad",
  "nombre": "Nombre de la empresa",
  "categoria": "transitario",
  "pais": "PY",
  "ciudad": "Loma Plata",
  "servicios": ["Granos"],
  "descripcion": "Lo que la empresa ha confirmado.",
  "destacada": false,
  "puntos": ["mariscal-estigarribia"],
  "contacto": { "email": "", "whatsapp": "", "web": "" },
  "fuente": { "nombre": "Confirmado por la empresa", "url": "https://web-de-la-empresa", "tipo": "otra" },
  "publicado": null,
  "verificado": "AAAA-MM-DD",
  "validacion": "verificado"
}
```

`puntos`: `campo-grande`, `porto-murtinho`, `carmelo-peralta`, `mariscal-estigarribia`, `pozo-hondo`, `salta-jujuy`, `norte-chile`, `puertos-chile`. Categorías: ver `data/categorias.json`. La confirmación caduca al año: vuelve a escribirles.

## Añadir o actualizar una página de la guía

1. En `content/guia/pasos/` (o `tramos/`, `documentos/`) crea `nombre-del-paso.md`.
2. Copia la cabecera de otra página. No pongas `estado:`: sale de los datos.
3. Escribe el contenido. Termina con `## Fuentes` y los enlaces (mejor si hay alguno oficial).
4. Al revisar una página, actualiza `revisado:` con la fecha del día.
5. Mientras no esté revisada: `validacion: borrador`. Cuando el despachante la haya validado: `validacion: verificado` y `verificado: AAAA-MM-DD`.

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
  "fuente": { "nombre": "Vialidad Chile", "url": "https://...", "tipo": "oficial" },
  "verificado": null,
  "validacion": "por-verificar"
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

Todo dato operativo lleva estos cuatro campos:

| Campo | Qué es |
|---|---|
| `fuente` | `{ "nombre", "url", "tipo" }`; tipo: `oficial`, `prensa` u `otra` |
| `publicado` | Fecha (AAAA-MM-DD) en que la fuente publicó el dato. `null` si es una norma o no consta |
| `verificado` | Fecha en que alguien del equipo lo comprobó contra la fuente. `null` si nadie |
| `validacion` | `verificado`, `por-verificar` o `borrador` |

**Regla:** un estado (operativo, en obras…) solo se muestra como confirmado si el dato está `verificado` **y** su ficha también. Si no, la web muestra «Por verificar» con el último dato, su fuente y su fecha. Una verificación caduca sola:

| Tipo de dato | Caduca a los |
|---|---|
| Estado operativo de paso o tramo | 30 días |
| Estado de obra o cierre | 120 días |
| Incidencia | 60 días |
| Horario | 180 días |
| Ficha, empresa, enlace de organismo | 365 días |

**Para marcar algo como verificado:** comprueba el dato en la fuente (mejor oficial), pon `"validacion": "verificado"` y `"verificado": "AAAA-MM-DD"` con la fecha de hoy. En una ficha Markdown, en la cabecera: `validacion: verificado` y `verificado: AAAA-MM-DD`.

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

Las fichas Markdown **no** llevan estado ni una sección «## Estado»: el estado se genera desde los datos.

- **Incidencia:** `tramos` = ids de `data/rutas.json` (`cg-pm`, `puente`, `cp-me`, `me-ph`, `pozo-hondo`, `andes`, `calama-puertos`). Si además lleva `paso`, solo se muestra en la variante de ruta que pasa por ese paso. Tipos: `obra`, `restriccion`, `corte`, `pendiente`, `peso`, `desvio`. Pon `"estado": "resuelta"` cuando termine.
- **Distancia de un tramo:** `kmTipo: "fuente"` con `kmFuente`, o `kmTipo: "calculado"` con `kmNota` explicando la cuenta. Sin km, el planificador estima la línea recta y lo marca como «Estimado».
- **Horario especial:** en `horariosEspeciales` con `desde`, `hasta`, `organismo` (`aduana`, `migraciones`, `sanitario`, `complejo`), `lado`, `texto` y los cuatro campos comunes.
- **Avisos meteorológicos:** `data/avisos.json` con `titulo`, `zona`, `vigenteHasta` y los campos comunes. Desaparecen solos al vencer.
- **Festivos:** añade el año siguiente cada noviembre; los traslados por decreto van con `validacion: por-verificar` hasta que se publiquen.

## Comprobaciones

- `npm run check`: no deja publicar si falta fuente, fecha o validación, o si un dato apunta a algo que no existe.
- `npm run enlaces`: tras `npm run build`, comprueba que ningún enlace interno esté roto (también se ejecuta al publicar).
- `npm run informe`: regenera `docs/informe-contenidos.md` con lo que falta, lo que está sin verificar y el tipo de fuentes de cada ficha.

## Si algo falla

Si después de guardar sale una cruz roja en GitHub (pestaña *Actions*), ábrela: el mensaje `ERROR` dice qué archivo y qué campo está mal. Lo más habitual es una coma de más o de menos en un JSON.
