# Cómo trabaja el vigilante

Mapa de fuentes: [`data/fuentes-vigilancia.csv`](../data/fuentes-vigilancia.csv) (HU-136). Un CSV plano, una fila por carretera o paso y fuente. **Es la configuración del vigilante**: lee solo las filas con `estado` = `activa`. Se consulta también en la web, en la página «Fuentes» (`/fuentes/`).

| Columna | Para qué | Valores |
|---|---|---|
| `estado` | Si el vigilante la lee | `activa`, `pausada`, `pendiente`, `manual`, `sin-fuente` |
| `lector` | Cómo se lee | `gendarmeria-paso`, `vialidad-ar`, `siemop-cl`, `mopc-pdf`, `dnit-alertas` (los cinco que existen hoy); `siemop-pasos` (pendiente); `whatsapp`, `manual`, `ninguno` |
| `fuente_id` | Fuente de `data/fuentes.json` (de ahí sale la dirección; tiene que ser oficial) | p. ej. `ar-vialidad-estado-rutas` |
| `destino` | Dónde cuenta en la Guía | `paso:jama`, `tramo:pozo-hondo`… |
| `filtro` | Qué parte de la fuente | Vialidad: `provincia=Jujuy;ruta=9;tramos=A|B` (`tramos=*`, todos). Chile: `regiones=01|02;km=3;dias_sin_novedad=14;max_horas=192`. Brasil (DNIT, pendiente): `rodovias=BR-267;uf=MS` |
| resto | Para leer (fuente, organismo, frecuencia, cómo se lee, regla, notas) | texto |

`npm run check` valida el CSV: una fila activa con un lector que no existe, una fuente que no es oficial, un paso o tramo que no existe o un filtro incompleto impiden publicar.

## Cada hora

1. **Arranque.** cron-job.org lanza el flujo «Vigilante» en GitHub, cada hora de 06:00 a 21:00, hora de Argentina; la programación de GitHub queda de respaldo.
2. **Lectura de las filas activas del CSV:**
   - **Pasos argentinos** (Gendarmería, web del Ministerio de Seguridad): estado que pone Gendarmería, horario, recuadro «Atención» y hora de cada parte.
   - **Vialidad Nacional:** la tabla oficial de estado de rutas, por provincia, ruta y tramo.
   - **Vialidad de Chile:** las emergencias de Tarapacá y Antofagasta, con coordenadas.
   - **MOPC** (pendiente, HU-134): el PDF del informe diario.
3. **Asignación a los tramos de la Guía:**
   - Argentina, por ruta y tramo oficial, según el `destino` y el `filtro` de cada fila.
   - Chile, por posición: rutas nacionales a menos de `km` (3) del trazado del tramo.
4. **Aplicación de la regla de publicación de su fila** (rojo, ámbar, «No habilitado para carga» o informativo).
5. **Comprobación de seguridad:**
   - nunca marcha atrás (una copia más antigua se descarta);
   - lo cargado a mano no se toca;
   - un aviso solo se retira si falta en dos pasadas seguidas;
   - un registro chileno sin novedades en más de 14 días sale en ámbar «confírmalo».
6. **Publicación:** escribe `data/pasos.json` y `data/incidencias.json` con el sello «Web oficial», pasa `npm run check`, sube a `main` y publica la web. Si la comprobación falla, no publica nada.
7. **Aviso:** abre o completa una incidencia «Vigilante · …» en GitHub (llega por correo) con lo publicado.
8. **Registro:** guarda en la rama `datos-vigilancia` cuándo leyó bien cada fuente. Si una falla 3 pasadas seguidas, avisa: el vigilante está ciego con ella.

## Lo que no hace solo

- **`whatsapp`** (Unidad de Pasos Fronterizos de Chile): se revisa el canal y se carga a mano.
- **`manual`** (puente de la Bioceánica): se carga a partir de noticias oficiales.
- **`sin-fuente`** (BR-267, ruta provincial de Misión La Paz): el mapa lo muestra en gris, «sin vigilancia».

## Cambios que se hacen solo en el CSV

- **Pausar una fuente:** `estado` = `pausada`.
- **Mover una carretera a otro tramo:** cambiar su `destino`.
- **Añadir una ruta de Vialidad Nacional o un paso de Gendarmería:** una fila nueva con su `filtro` (y la fuente en `data/fuentes.json` si es nueva).
- **Cambiar los umbrales de Chile:** `km`, `dias_sin_novedad`, `max_horas` en el `filtro` (iguales en todas sus filas).

## Para añadir una fuente de un tipo nuevo (p. ej. el PDF del MOPC)

1. Añadir las filas con `estado` = `pendiente` y su `lector` nuevo.
2. Guardar una copia real de la fuente en `pruebas/vigilante/` y escribir el lector con su autoprueba.
3. Añadir el lector a `LECTORES_AUTOMATICOS` en `scripts/fuentes-vigilancia.mjs` y la fuente en `data/fuentes.json`.
4. Cambiar las filas a `activa`.

## Informe diario del MOPC (Paraguay) · HU-134

- **Fuente:** https://mopc.gov.py/servicios/estado-de-las-rutas/ incrusta una carpeta pública de Google Drive con una subcarpeta por mes («NOVIEMBRE 2026»). El vigilante la lista sin credenciales (`embeddedfolderview`), baja los PDF del último día (`uc?export=download`) y los pasa a texto con `pdftotext -layout` (poppler-utils, se instala en el flujo).
- **Cuándo publica:** de lunes a viernes, a las 07:00 y hacia las 13:00 (hora de Paraguay). Nada los fines de semana. La numeración del archivo («(1)», «(2)») no dice el orden: manda la hora escrita dentro del PDF y, a igual hora, el número más alto (una corrección).
- **Qué se lee:** las tres partes (puentes inhabilitados, rutas y tramos clausurados con sus notas «.:», y la lista por localidad). Si falta una, la lectura falla y no se publica nada (aviso de vigilancia ciega a los 3 fallos).
- **Qué cuenta para cada tramo:** `filtro` `localidades=…|…` de la fila (`mopc-pdf`). Se compara sin tildes y por palabras enteras; «Ruta 15», «PY 15» y «PY15» son lo mismo.
- **Reglas:** «Clausurada» + «P/V/P» (Para Vehículos Pesados) o «vehículos pesados» → no habilitado para carga; «Clausurada» → corte; «precaución» → ámbar; «Habilitada» o sin mención → nada.
- **Un informe solo se aplica una vez** (`ultimoInforme` en el estado de la vigilancia): un aviso se retira cuando falta en dos informes seguidos, no en dos pasadas del vigilante.
- **Antigüedad:** «parada» si a partir de las 10:00 de un día laborable no hay informe de ese día. No cuentan los fines de semana ni los feriados nacionales de Paraguay de `data/festivos.json` (Ley 7544/2025): cuando se cargue el año siguiente, el vigilante los tiene en cuenta solo.

## Alertas DNIT (Brasil) · HU-138

- **Fuente:** https://www.gov.br/dnit/pt-br/central-de-conteudos/noticias-alerta-de-servicos. Lista de alertas de todo Brasil, de la más nueva a la más vieja, 30 por página (`?b_start:int=30`, `60`…). Cada una: título con la rodovía y el estado («… na BR-471/RS …»), etiqueta del estado y «publicado DD/MM/AAAA HHhMM».
- **Qué se lee:** las páginas de la lista hasta 30 días atrás (como mucho 8) y, de ellas, solo se abren las alertas de las rodovías y el estado del filtro (`rodovias=BR-267;uf=MS`). La misma rodovía en otro estado (la BR-267 también pasa por MG y SP) no cuenta.
- **Reglas:** «liberação» → cierra lo anterior de esa rodovía; «interdição/bloqueio total» → rojo; restricción por peso o a camiones → no habilitado para carga; parcial, «pare e siga», desvío, bloqueo, «alterações no trânsito» → ámbar. Lo que no encaja en ninguna no se publica: llega un aviso «Revisa» para mirarlo a mano (semiautomático).
- **Vigencia:** las alertas anuncian casi siempre algo programado (una madrugada, un lunes). Cuentan 3 días desde su publicación; si dicen «a partir de», «por tempo indeterminado», «até nova ordem» o «sem previsão», hasta 30 días o hasta una «liberação» posterior.
- **En la web:** «Obra» (o «Desvío» / «Límite de peso») con la gravedad que toque, una frase en castellano y la primera frase del texto oficial en portugués, marcada como portugués (no se traduce).
- **Antigüedad:** el DNIT publica alertas de todo Brasil casi a diario; si la más nueva de la lista tiene más de 7 días, la fuente se da por parada.

## Fase experimental (20/11/2026)

- **MOPC: como mucho ámbar.** Un «Clausurado» del informe sale en ámbar. Regla guardada, apagada: rojo solo si el informe nombra la PY15 (`MOPC_ROJO_SI_PY15` en `scripts/mopc.mjs`).
- **Historial:** los avisos resueltos se guardan 90 días (antes 15). La web solo enseña los de los últimos 15.
- **Avisos cortos:** cada aviso enseña una línea (`resumen` o la primera frase). El texto completo va en «Más información».

## Motivo del cierre (20/11/2026)

La página oficial de cada paso (Ministerio de Seguridad) trae a veces, en el recuadro «Atención», la línea **«Motivo del cierre:»** con el parte de Gendarmería. El vigilante lee todas las etiquetas en negrita del recuadro (no solo «… informa:»). Si el paso se cierra con motivo, el estado lo cita; si el motivo llega después, se añade al cierre sin abrir otra entrada en el historial. Sin motivo publicado, el texto lo dice.

**Ojo (23/11/2026):** la web oficial también pone en «Motivo del cierre» el parte rutinario de Chile al cerrar la jornada. Solo cuenta como motivo un texto que nombra una causa, o uno sin causa emitido dentro del horario. Regla completa en [`regla-estado-pasos.md`](regla-estado-pasos.md).
