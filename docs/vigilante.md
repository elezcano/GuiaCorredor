# Cómo trabaja el vigilante

Referencia de fuentes: [`fuentes-corredor-bioceanico.xlsx`](fuentes-corredor-bioceanico.xlsx), con una fila por tramo y país (fuente, formato, frecuencia, tipo, estado y regla de publicación).

**El Excel es el mapa de referencia, no la configuración.** El vigilante no lo lee: sus fuentes están en el código (`PAGINAS` en `scripts/vigilante.mjs` y `CORRESPONDENCIAS` en `scripts/carreteras.mjs`). Si cambia una fuente, se cambian las dos cosas en el mismo PR.

## Cada hora

1. **Arranque.** cron-job.org lanza el flujo «Vigilante» en GitHub, cada hora de 06:00 a 21:00, hora de Argentina; la programación de GitHub queda de respaldo.
2. **Lectura de las fuentes «Automático» y «Semiautomático» del Excel:**
   - **Pasos argentinos** (Gendarmería, web del Ministerio de Seguridad): estado que pone Gendarmería, horario, recuadro «Atención» y hora de cada parte.
   - **Vialidad Nacional:** la tabla oficial de estado de rutas, por provincia, ruta y tramo.
   - **Vialidad de Chile:** las emergencias de Tarapacá y Antofagasta, con coordenadas.
   - **MOPC** (pendiente, HU-134): el PDF del informe diario.
3. **Asignación a los tramos de la Guía:**
   - Argentina, por ruta y tramo oficial.
   - Chile, por posición: rutas nacionales a menos de 3 km del trazado del tramo.
4. **Aplicación de la regla de publicación de esa fila del Excel** (rojo, ámbar, «No habilitado para carga» o informativo).
5. **Comprobación de seguridad:**
   - nunca marcha atrás (una copia más antigua se descarta);
   - lo cargado a mano no se toca;
   - un aviso solo se retira si falta en dos pasadas seguidas;
   - un registro chileno sin novedades en más de 14 días sale en ámbar «confírmalo».
6. **Publicación:** escribe `data/pasos.json` y `data/incidencias.json` con el sello «Web oficial», pasa `npm run check`, sube a `main` y publica la web. Si la comprobación falla, no publica nada.
7. **Aviso:** abre o completa una incidencia «Vigilante · …» en GitHub (llega por correo) con lo publicado.
8. **Registro:** guarda en la rama `datos-vigilancia` cuándo leyó bien cada fuente. Si una falla 3 pasadas seguidas, avisa: el vigilante está ciego con ella.

## Lo que no hace solo

- **«WhatsApp»** (Unidad de Pasos Fronterizos de Chile): lo ve el responsable y se carga a mano.
- **«Manual»** (puente de la Bioceánica): se carga a partir de noticias oficiales.
- **«Sin fuente»** (BR-267, ruta provincial de Misión La Paz): el mapa lo muestra en gris, «sin vigilancia».

## Para añadir una fuente

1. Añadir la fila en el Excel con tipo «Semiautomático» o «Automático» y estado «Pendiente (HU-…)».
2. Guardar una copia real de la fuente en `pruebas/vigilante/` y escribir el lector con su autoprueba.
3. Añadir la correspondencia en el código y la fuente en `data/fuentes.json`.
4. Cambiar el estado de la fila a «Activo (cada hora)».
