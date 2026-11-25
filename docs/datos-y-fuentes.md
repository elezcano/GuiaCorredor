# Datos y fuentes

> Qué datos tiene RadarCorredor, de dónde salen, cómo se validan y cómo los lee el vigilante. Principio rector (aprobado el 14/11/2026): **la fiabilidad tiene prioridad sobre la cantidad**. El estado de los pasos tiene su propia especificación: [`regla-estado-pasos.md`](regla-estado-pasos.md).

| Parte | Qué responde |
|---|---|
| [1 · Validación](#1--validación) | Quién verifica, estados, evidencia, semáforo y reglas de publicación |
| [2 · Modelo de datos](#2--modelo-de-datos) | Empresas, páginas de la guía y rutas |
| [3 · Vigilante y fuentes](#3--vigilante-y-fuentes) | Qué fuentes se leen solas, cada cuánto y con qué reglas |

## 1 · Validación

### Responsable

El responsable de verificación es **Ernesto**, responsable editorial del proyecto. En los datos figura con el identificador estable `responsable-editorial`, que siempre representa a quien ostente ese rol. `verificacion.verificadoPor` solo admite dos valores (`scripts/validacion.mjs` → `VERIFICADORES`):

| Valor | Qué significa |
|---|---|
| `responsable-editorial` | Comprobación manual en la fuente |
| `vigilante` | Leído automáticamente de una web oficial y publicado al momento (decisión 22). Solo en estados, partes e incidencias con fuente oficial; el responsable revisa después |

No se asigna la verificación al asistente de IA ni a terceros. Un despachante u otra persona puede **aportar** revisión; la firma la pone el responsable editorial.

### Estados

| `validacion` | Significa | Se muestra como |
|---|---|---|
| `borrador` | Información en preparación | Borrador |
| `por-verificar` | Hay dato y fuente, pero no lo ha revisado el responsable | «Por verificar», con el último dato, su fuente y su fecha |
| `verificado` | El responsable revisó el dato y su evidencia | El valor, con «Verificado el …» |

Un registro `verificado` necesita `verificacion`:

```json
"validacion": "verificado",
"verificacion": { "verificadoPor": "responsable-editorial", "rol": "responsable-editorial", "fecha": "2026-11-20", "alcance": "Horario comprobado en la web de Aduanas de Chile" }
```

Sin `verificacion` válida, el sistema trata el registro como `por-verificar` aunque diga `verificado`, y `npm run check` falla. La verificación caduca según el tipo de dato (30 días un estado operativo, 120 una obra, 60 una incidencia, 180 un horario, 365 una ficha, empresa u organismo); después se muestra «Verificación caducada».

**Foco en la operatividad (decisión del 15/11/2026).** Quien consulta la web quiere saber si puede transportar por ese paso o tramo, para cotizar, planificar o informar. Por eso cada dato operativo (estado, horarios, incidencias) se confirma con **su propia** verificación, y la situación operativa va lo primero en cada ficha. Que el texto explicativo de la guía siga en revisión se avisa aparte y no oculta un estado verificado.

### Semáforo operativo

Lo que ve el usuario en cada paso o tramo, siempre con icono y texto además del color:

| Semáforo | Cuándo |
|---|---|
| Abierto (verde) | Estado verificado `operativo` |
| Con restricciones (ámbar) | Verificado `restricciones`, `intermitente` o `cierre-programado`; en un tramo de carretera, también `en-obras` (se circula con obras) |
| No habilitado (rojo) | Verificado `cerrado`; en un paso, también `en-obras` (no se puede cruzar) |
| Sin confirmar (gris, trazo discontinuo) | Todo lo no verificado. Se muestra el último dato publicado con su fecha y cuánto hace; si tiene más de 30 días, se resalta |

La regla está en `scripts/lib.mjs` (`operativaDe`) y el planificador usa la misma.

### Tipos de evidencia (`evidencia`)

| Valor | Uso |
|---|---|
| `oficial` | Organismo público o norma |
| `declaracion-empresa` | Lo dice la propia empresa. Nunca se considera verificado por sí solo |
| `tercero` | Prensa, obras de referencia, cartografía de terceros |
| `calculo` | Cuenta hecha a partir de otros datos con fuente (se explica en una nota) |
| `estimacion` | Aproximación. No se puede marcar como verificada como dato actual |
| `historico` | Dato pasado (incidencia resuelta). Nunca describe la situación actual |

### Reglas de publicación

1. Nada se publica como verificado sin revisión del responsable editorial.
2. La IA puede investigar, comparar fuentes, proponer cambios y actualizar `actualizado`, pero **nunca** escribe `validacion: verificado` ni `verificacion`.
3. Un Pull Request que añade verificaciones necesita la etiqueta `revision-editorial`; la comprobación de CI (`scripts/verificaciones.mjs`) falla sin ella. La etiqueta la pone solo el responsable editorial.
4. Toda automatización que incorpore datos los deja en `por-verificar`.
5. Las solicitudes de empresas no se publican solas: se revisan y entran por Pull Request.
6. Un festivo no implica cierre de aduana; las afectaciones deben venir del organismo.
7. Sin fuente no hay dato. **Excepción provisional (15/11/2026):** mientras el corredor no esté terminado y no haya distancias oficiales (P1.7), los tramos sin distancia con fuente muestran una estimación en línea recta con `evidencia: "estimacion"`, la etiqueta «Estimación provisional», qué tramo exacto se estima y entre qué puntos. Nunca se suma como dato oficial. Se desactiva en `data/site.json` → `estimaciones.provisionales`.

### Estado del proyecto

La web está en **versión borrador (MVP)**. Por decisión del responsable, la rama `main` no se protege todavía; se protegerá más adelante (P1.11, #49).

### Límite conocido

El asistente trabaja con el acceso a GitHub de la cuenta del propietario, así que técnicamente podría poner la etiqueta. La regla 3 es un control de procedimiento: el asistente no pone esa etiqueta ni fusiona PR con verificaciones. Pasará a ser un control técnico cuando se proteja `main` con revisión obligatoria del propietario (P1.11, #49), aplazado mientras la web sea un borrador.

## 2 · Modelo de datos

Todos los datos están en `data/*.json`, validados con JSON Schema (`data/esquemas/`) en cada cambio (`npm run check`). Los campos comunes de un registro (`fuente`, `publicado`, `actualizado`, `evidencia`, `validacion`, `verificacion`) son los de la parte 1.

### Empresa (`data/directorio.json`, esquema `data/esquemas/empresas.schema.json`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | texto | Único, en minúsculas con guiones |
| `nombre` | texto | |
| `categoria` | texto | Uno de `data/categorias.json` |
| `pais` | `BR` · `PY` · `AR` · `CL` | |
| `ciudad` | texto | |
| `servicios` | lista de textos | Se muestran como etiquetas |
| `descripcion` | texto | Opcional |
| `destacada` | sí/no | Ficha de pago |
| `contacto` | `{ email, whatsapp, web }` | WhatsApp con prefijo de país, solo números |
| `ejemplo` | sí/no | Fichas de muestra; no se publican si `mostrarEjemplos` es `false` |
| `puntos`, `cobertura` | listas | Dónde opera (distinto de la sede: `pais`, `ciudad`) |
| campos de registro | — | `fuente`, `validacion` y `verificacion`, como cualquier dato: solo se publica una empresa revisada |

### Página de guía (`content/guia/<sección>/<slug>.md`)

Cabecera obligatoria: `titulo`, `tipo`, `resumen`, `paises` (separados por comas), `estado` (`operativo`, `en-obras`, `intermitente`, `pendiente`), `revisado` (AAAA-MM-DD). Opcional: `borrador: true`.

Cuerpo en Markdown. Toda página de pasos o tramos termina con `### Fuentes`. El `check` avisa cuando una página lleva más de 90 días sin revisar.

### Rutas (`data/rutas.json`)

El corredor se modela como una línea de **nodos** con un **tramo** entre cada par consecutivo. Un tramo puede tener `paso` (frontera) y `alternativa`. Las distancias sin fuente van como `null` y se muestran como "por verificar": **no se inventan cifras**.

## 3 · Vigilante y fuentes

El mapa de fuentes: [`data/fuentes-vigilancia.csv`](../data/fuentes-vigilancia.csv) (HU-136). Un CSV plano, una fila por carretera o paso y fuente. **Es la configuración del vigilante**: lee solo las filas con `estado` = `activa`. Se consulta también en la web, en la página «Fuentes» (`/fuentes/`).

| Columna | Para qué | Valores |
|---|---|---|
| `estado` | Si el vigilante la lee | `activa`, `pausada`, `pendiente`, `manual`, `sin-fuente` |
| `lector` | Cómo se lee | `gendarmeria-paso`, `vialidad-ar`, `siemop-cl`, `mopc-pdf`, `dnit-alertas` (los cinco que existen hoy); `siemop-pasos` (pendiente); `whatsapp`, `manual`, `ninguno` |
| `fuente_id` | Fuente de `data/fuentes.json` (de ahí sale la dirección; tiene que ser oficial) | p. ej. `ar-vialidad-estado-rutas` |
| `destino` | Dónde cuenta en la Guía | `paso:jama`, `tramo:pozo-hondo`… |
| `filtro` | Qué parte de la fuente | Vialidad: `provincia=Jujuy;ruta=9;tramos=A|B` (`tramos=*`, todos). Chile: `regiones=01|02;km=3;dias_sin_novedad=14;max_horas=192`. Brasil (DNIT, pendiente): `rodovias=BR-267;uf=MS` |
| resto | Para leer (fuente, organismo, frecuencia, cómo se lee, regla, notas) | texto |

`npm run check` valida el CSV: una fila activa con un lector que no existe, una fuente que no es oficial, un paso o tramo que no existe o un filtro incompleto impiden publicar.

### Cada hora

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

### Lo que no hace solo

- **`whatsapp`** (Unidad de Pasos Fronterizos de Chile): se revisa el canal y se carga a mano.
- **`manual`** (puente de la Bioceánica): se carga a partir de noticias oficiales.
- **`sin-fuente`** (BR-267, ruta provincial de Misión La Paz): el mapa lo muestra en gris, «sin vigilancia».

### Cambios que se hacen solo en el CSV

- **Pausar una fuente:** `estado` = `pausada`.
- **Mover una carretera a otro tramo:** cambiar su `destino`.
- **Añadir una ruta de Vialidad Nacional o un paso de Gendarmería:** una fila nueva con su `filtro` (y la fuente en `data/fuentes.json` si es nueva).
- **Cambiar los umbrales de Chile:** `km`, `dias_sin_novedad`, `max_horas` en el `filtro` (iguales en todas sus filas).

### Para añadir una fuente de un tipo nuevo (p. ej. el PDF del MOPC)

1. Añadir las filas con `estado` = `pendiente` y su `lector` nuevo.
2. Guardar una copia real de la fuente en `pruebas/vigilante/` y escribir el lector con su autoprueba.
3. Añadir el lector a `LECTORES_AUTOMATICOS` en `scripts/fuentes-vigilancia.mjs` y la fuente en `data/fuentes.json`.
4. Cambiar las filas a `activa`.

### Informe diario del MOPC (Paraguay) · HU-134

- **Fuente:** https://mopc.gov.py/servicios/estado-de-las-rutas/ incrusta una carpeta pública de Google Drive con una subcarpeta por mes («NOVIEMBRE 2026»). El vigilante la lista sin credenciales (`embeddedfolderview`), baja los PDF del último día (`uc?export=download`) y los pasa a texto con `pdftotext -layout` (poppler-utils, se instala en el flujo).
- **Cuándo publica:** de lunes a viernes, a las 07:00 y hacia las 13:00 (hora de Paraguay). Nada los fines de semana. La numeración del archivo («(1)», «(2)») no dice el orden: manda la hora escrita dentro del PDF y, a igual hora, el número más alto (una corrección).
- **Qué se lee:** las tres partes (puentes inhabilitados, rutas y tramos clausurados con sus notas «.:», y la lista por localidad). Si falta una, la lectura falla y no se publica nada (aviso de vigilancia ciega a los 3 fallos).
- **Qué cuenta para cada tramo:** `filtro` `localidades=…|…` de la fila (`mopc-pdf`). Se compara sin tildes y por palabras enteras; «Ruta 15», «PY 15» y «PY15» son lo mismo.
- **Reglas:** «Clausurada» + «P/V/P» (Para Vehículos Pesados) o «vehículos pesados» → no habilitado para carga; «Clausurada» → corte; «precaución» → ámbar; «Habilitada» o sin mención → nada.
- **Un informe solo se aplica una vez** (`ultimoInforme` en el estado de la vigilancia): un aviso se retira cuando falta en dos informes seguidos, no en dos pasadas del vigilante.
- **Antigüedad:** «parada» si a partir de las 10:00 de un día laborable no hay informe de ese día. No cuentan los fines de semana ni los feriados nacionales de Paraguay de `data/festivos.json` (Ley 7544/2025): cuando se cargue el año siguiente, el vigilante los tiene en cuenta solo.

### Alertas DNIT (Brasil) · HU-138

- **Fuente:** https://www.gov.br/dnit/pt-br/central-de-conteudos/noticias-alerta-de-servicos. Lista de alertas de todo Brasil, de la más nueva a la más vieja, 30 por página (`?b_start:int=30`, `60`…). Cada una: título con la rodovía y el estado («… na BR-471/RS …»), etiqueta del estado y «publicado DD/MM/AAAA HHhMM».
- **Qué se lee:** las páginas de la lista hasta 30 días atrás (como mucho 8) y, de ellas, solo se abren las alertas de las rodovías y el estado del filtro (`rodovias=BR-267;uf=MS`). La misma rodovía en otro estado (la BR-267 también pasa por MG y SP) no cuenta.
- **Reglas:** «liberação» → cierra lo anterior de esa rodovía; «interdição/bloqueio total» → rojo; restricción por peso o a camiones → no habilitado para carga; parcial, «pare e siga», desvío, bloqueo, «alterações no trânsito» → ámbar. Lo que no encaja en ninguna no se publica: llega un aviso «Revisa» para mirarlo a mano (semiautomático).
- **Vigencia:** las alertas anuncian casi siempre algo programado (una madrugada, un lunes). Cuentan 3 días desde su publicación; si dicen «a partir de», «por tempo indeterminado», «até nova ordem» o «sem previsão», hasta 30 días o hasta una «liberação» posterior.
- **En la web:** «Obra» (o «Desvío» / «Límite de peso») con la gravedad que toque, una frase en castellano y la primera frase del texto oficial en portugués, marcada como portugués (no se traduce).
- **Antigüedad:** el DNIT publica alertas de todo Brasil casi a diario; si la más nueva de la lista tiene más de 7 días, la fuente se da por parada.

### Fase experimental (20/11/2026)

- **MOPC: como mucho ámbar.** Un «Clausurado» del informe sale en ámbar. Regla guardada, apagada: rojo solo si el informe nombra la PY15 (`MOPC_ROJO_SI_PY15` en `scripts/mopc.mjs`).
- **Historial:** los avisos resueltos se guardan 90 días (antes 15). La web solo enseña los de los últimos 15.
- **Avisos cortos:** cada aviso enseña una línea (`resumen` o la primera frase). El texto completo va en «Más información».

### Motivo del cierre (20/11/2026)

La página oficial de cada paso (Ministerio de Seguridad) trae a veces, en el recuadro «Atención», la línea **«Motivo del cierre:»** con el parte de Gendarmería. El vigilante lee todas las etiquetas en negrita del recuadro (no solo «… informa:»). Si el paso se cierra con motivo, el estado lo cita; si el motivo llega después, se añade al cierre sin abrir otra entrada en el historial. Sin motivo publicado, el texto lo dice.

**Ojo (23/11/2026):** la web oficial también pone en «Motivo del cierre» el parte rutinario de Chile al cerrar la jornada. Solo cuenta como motivo un texto que nombra una causa, o uno sin causa emitido dentro del horario. Regla completa en [`regla-estado-pasos.md`](regla-estado-pasos.md).
