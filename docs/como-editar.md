# Cómo editar la web (sin programar)

Todo se edita desde GitHub en el navegador: abre el archivo, pulsa el lápiz, cambia y guarda ("Commit changes"). La web se regenera sola.

## Añadir una empresa al directorio

1. Abre `data/directorio.json`.
2. Copia un bloque `{ ... }` entero, pégalo antes del último `]` y separa con una coma.
3. Cambia los datos. El `id` no puede repetirse.
4. Para hacerla destacada (ha pagado): `"destacada": true`.

```json
{
  "id": "transportes-ejemplo-loma-plata",
  "nombre": "Transportes Ejemplo",
  "categoria": "transportista",
  "pais": "PY",
  "ciudad": "Loma Plata",
  "servicios": ["Granos", "Ganado"],
  "descripcion": "Flota de 20 camiones, rutas Chaco – Salta.",
  "destacada": false,
  "puntos": ["carmelo-peralta", "mariscal-estigarribia"],
  "contacto": { "email": "info@ejemplo.com", "whatsapp": "595981000000", "web": "" }
}
```

`puntos` son los lugares de la ruta donde da servicio. Es lo que hace que la empresa aparezca en el planificador, en las páginas de la guía y en la portada. Valores válidos: `campo-grande`, `porto-murtinho`, `carmelo-peralta`, `mariscal-estigarribia`, `pozo-hondo`, `salta-jujuy`, `norte-chile`, `puertos-chile`.

Tipos válidos (`categoria`): `transitario`, `transportista`, `despachante`, `deposito`, `taller`, `seguro`, `servicios`.

## Añadir o actualizar una página de la guía

1. En `content/guia/pasos/` (o `tramos/`, `documentos/`) crea `nombre-del-paso.md`.
2. Copia la cabecera de otra página y cámbiala.
3. Escribe el contenido. Termina siempre con `## Fuentes` y los enlaces.
4. Al revisar una página, actualiza `revisado:` con la fecha del día.
5. Cuando el despachante la haya validado, borra la línea `borrador: true`.

## Añadir una novedad

Lo que hace que la web parezca viva. Abre `data/novedades.json` y añade un bloque al principio:

```json
{
  "fecha": "2026-12-02",
  "tema": "Paso fronterizo",
  "estado": "intermitente",
  "titulo": "Paso de Jama cerrado por nieve",
  "detalle": "Reapertura prevista cuando mejore el tiempo del lado chileno.",
  "guia": "pasos/jama",
  "paises": ["AR", "CL"],
  "fuente": { "nombre": "Vialidad Chile", "url": "https://..." }
}
```

- `tema`: Obras, Paso fronterizo, Acuerdos, Aviso…
- `estado` (opcional) colorea el punto de la línea de tiempo: `operativo`, `en-obras`, `intermitente`, `pendiente`.
- `paises`: países afectados (`BR`, `PY`, `AR`, `CL`); sirven para el filtro por país de la página de novedades.
- `guia` (opcional) la enlaza con su página y la muestra allí en "Últimos cambios".
- **Sin fuente no se publica:** la revisión automática lo rechaza.
- Si el cambio afecta al estado de un tramo, cambia también `data/rutas.json` (siguiente apartado).

La revisión avisa si la última novedad tiene más de 30 días: una portada parada da mala imagen.

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

## Datos operativos (sin tocar código)

Cada archivo de `data/` alimenta una sección. Todo registro lleva **fuente** (nombre y url) y **fecha**; `npm run check` no deja publicar sin ellas.

| Archivo | Qué cambias | Cuándo |
|---|---|---|
| `pasos.json` | `estado.valor` (operativo, restricciones, cierre-programado, cerrado, en-obras, pendiente), `estado.texto`, `estado.fecha`, `estado.fuente`; horarios, restricciones, acceso | Cuando salga un parte oficial |
| `incidencias.json` | Añade una entrada por obra, corte o restricción; pon `"estado": "resuelta"` cuando termine | Al conocer la novedad |
| `festivos.json` | Añade el año siguiente y cambia `"por-confirmar"` a `"confirmado"` cuando se publique el decreto | Noviembre–diciembre |
| `avisos.json` | Copia un aviso meteorológico oficial con `titulo`, `zona`, `vigenteHasta` (AAAA-MM-DD) y `fuente`. Desaparece solo al vencer | Solo si afecta a la ruta |
| `organismos.json` | Corrige un enlace roto y actualiza `verificado` | Al detectarlo |

Reglas que aplica la web sola:

- Un estado «operativo» o «con restricciones» con más de **30 días** se muestra como «Por verificar» con su último dato. Uno de obra o cierre, a los **120 días**.
- Lo que dejes vacío o en `null` se muestra como «Sin verificar». No pongas datos que no tengan fuente.

Ejemplo de incidencia:

```json
{
  "id": "rn52-corte-nieve",
  "paises": ["AR"],
  "ubicacion": "Purmamarca – Jama",
  "tramo": "Ruta Nacional 52",
  "tipo": "corte",
  "estado": "activa",
  "descripcion": "Cortada por nieve entre Susques y Jama.",
  "inicio": "2027-06-10",
  "finPrevista": null,
  "impacto": "Sin paso para camiones hasta nuevo aviso.",
  "paso": "jama",
  "fuente": { "nombre": "Vialidad Nacional", "url": "https://…", "fecha": "2027-06-10" },
  "actualizado": "2027-06-10"
}
```

Tipos de incidencia: `obra`, `restriccion`, `corte`, `pendiente` (infraestructura sin habilitar), `peso`, `desvio`.

## Cambiar el estado de un tramo o paso

- **Pasos fronterizos**: solo en `data/pasos.json` (ver arriba). La ficha, el mapa, la portada y el planificador lo toman de ahí.
- **Tramos de carretera**: en `data/rutas.json`, `"estado"` del tramo (`operativo`, `en-obras`, `intermitente` o `pendiente`), y el `estado:` de su página de guía si la tiene.

## Si algo falla

Si después de guardar sale una cruz roja en GitHub (pestaña *Actions*), ábrela: el mensaje `ERROR` dice qué archivo y qué campo está mal. Lo más habitual es una coma de más o de menos en un JSON.
