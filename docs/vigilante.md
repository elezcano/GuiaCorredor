# Cómo trabaja el vigilante

Mapa de fuentes: [`data/fuentes-vigilancia.csv`](../data/fuentes-vigilancia.csv) (HU-136). Un CSV plano, una fila por carretera o paso y fuente. **Es la configuración del vigilante**: lee solo las filas con `estado` = `activa`. Se consulta también en la web, en la página «Fuentes» (`/fuentes/`).

| Columna | Para qué | Valores |
|---|---|---|
| `estado` | Si el vigilante la lee | `activa`, `pausada`, `pendiente`, `manual`, `sin-fuente` |
| `lector` | Cómo se lee | `gendarmeria-paso`, `vialidad-ar`, `siemop-cl` (los tres que existen hoy); `mopc-pdf`, `siemop-pasos` (pendientes); `whatsapp`, `manual`, `ninguno` |
| `fuente_id` | Fuente de `data/fuentes.json` (de ahí sale la dirección; tiene que ser oficial) | p. ej. `ar-vialidad-estado-rutas` |
| `destino` | Dónde cuenta en la Guía | `paso:jama`, `tramo:pozo-hondo`… |
| `filtro` | Qué parte de la fuente | Vialidad: `provincia=Jujuy;ruta=9;tramos=A|B` (`tramos=*`, todos). Chile: `regiones=01|02;km=3;dias_sin_novedad=14;max_horas=192` |
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
