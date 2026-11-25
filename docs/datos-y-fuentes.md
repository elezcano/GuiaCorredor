# Datos y fuentes

> Qué datos tiene RadarCorredor, de dónde salen y cómo se validan. Vigente desde el 25/11/2026 · decisiones [7, 11, 20, 22, 25, 26](decisiones.md) · el estado de los pasos tiene su propia [regla](regla-estado-pasos.md).

**En una frase:** cada dato lleva su fuente, su fecha y quién lo comprobó; si no se puede justificar, no se publica.

## Tres reglas

1. **Sin fuente no hay dato.** No se inventan cifras: una distancia sin fuente sale «por verificar».
2. **Verificar es de una persona o de una web oficial.** Lo firma Ernesto o lo lee el vigilante de un organismo; nunca la IA.
3. **Lo oficial decide, lo demás informa.** La prensa da contexto, en gris y con el nombre del medio, y nunca cambia un estado.

## Qué lleva cada dato

Todos los datos están en `data/` y se validan con sus esquemas (`data/esquemas/`) en cada cambio. Cada registro lleva estos campos:

| Campo | Qué dice | Valores |
|---|---|---|
| `fuente` | De dónde sale (ficha en `data/fuentes.json`, con su URL) | id de fuente |
| `publicado` | Cuándo lo publicó la fuente | fecha |
| `actualizado` | Cuándo lo revisamos por última vez | fecha |
| `evidencia` | Qué tipo de fuente es | `oficial` · `declaracion-empresa` · `tercero` · `calculo` · `estimacion` · `historico` |
| `validacion` | En qué punto está | `borrador` · `por-verificar` · `verificado` |
| `verificacion` | Quién lo comprobó, cuándo y cómo | `verificadoPor`, `fecha`, `alcance` |
| `consultado` | Solo en el estado de un paso: cuándo consultó el vigilante la web oficial que produjo ese estado. No confundir con `publicado` (la fecha del organismo). La web y `api/v1` muestran además la **confianza** del dato, calculada aparte ([regla](regla-estado-pasos.md#confianza)) | fecha y hora ISO |

**Quién puede verificar** (`verificadoPor`, lista en `scripts/validacion.mjs`):

| Valor | Qué significa |
|---|---|
| `responsable-editorial` | Ernesto lo comprobó a mano en la fuente |
| `vigilante` | Leído de una web oficial y publicado al momento, con el sello «Web oficial» (decisión 22). Solo estados, partes e incidencias de fuente oficial; Ernesto revisa después |

Un `verificado` sin `verificacion` válida cuenta como `por-verificar`, y `npm run check` falla.

**Tipos de evidencia:** `oficial` (organismo o norma) es la única que decide un estado. `declaracion-empresa` nunca vale como verificada por sí sola. `tercero` es prensa o referencia. `calculo` se explica en una nota. `estimacion` nunca se presenta como dato actual. `historico` nunca describe el presente.

## Cuánto dura una verificación

| Dato | Caduca a los | Después se muestra |
|---|---|---|
| Estado operativo (abierto, con restricciones) | 30 días | «Verificación caducada» / Sin confirmar |
| Obra, cierre | 120 días | Ídem |
| Incidencia | 60 días | Ídem |
| Horario | 180 días | Ídem |
| Ficha, empresa, organismo | 365 días | Ídem |

Cada dato operativo (estado, horario, incidencia) tiene su **propia** verificación: que el texto de la guía esté en revisión se avisa aparte y no oculta un estado verificado.

## Reglas de publicación

1. Nada sale como verificado sin la firma del responsable editorial o la lectura del vigilante en una web oficial.
2. La IA investiga, compara y propone, pero **nunca** escribe `verificado` ni `verificacion`.
3. Un PR que añade verificaciones necesita la etiqueta `revision-editorial`. Sin ella, la comprobación falla. La pone Ernesto, o Claude por él cuando Ernesto escribe «confirmo» sobre ese PR; entonces Claude deja en el PR un comentario con la frase exacta, la fecha y la hora (decisión 36).
4. Lo que entra por otra automatización o por un formulario queda en `por-verificar`, y las empresas entran por PR tras revisarlas.
5. Un festivo no implica cierre de aduana: la afectación tiene que venir del organismo.
6. **Excepción provisional (15/11/2026):** donde no hay distancia oficial, se muestra una estimación en línea recta, marcada «Estimación provisional» y con el tramo exacto. Nunca se suma como dato oficial. Se apaga en `data/site.json` → `estimaciones.provisionales`.

## Los datos

| Archivo | Qué guarda |
|---|---|
| `pasos.json` | Pasos fronterizos: lados, estado, partes por organismo, horarios, contactos, controles |
| `rutas.json` | El corredor como una línea de nodos con un tramo entre cada par; un tramo puede tener `paso` y `alternativa`. Distancias sin fuente: `null` |
| `incidencias.json` | Obras, cortes y restricciones, con su gravedad (rojo, ámbar, informativa) |
| `directorio.json` | Empresas: sede (`pais`, `ciudad`) y dónde operan (`puntos`, `cobertura`), servicios, contacto, `destacada`. Solo empresas reales y revisadas |
| `festivos.json` | Calendario aduanero de los cuatro países |
| `organismos.json`, `fuentes.json` | Quién publica y dónde |
| `novedades.json`, `avisos.json` | Línea de tiempo de cada paso y avisos meteorológicos |
| `fuentes-vigilancia.csv` | Qué lee el vigilante (ver abajo) |
| `site.json` | Configuración: formularios, canales de cada país, estadísticas, marca |
| `content/guia/` | Fichas de la guía en Markdown, con `titulo`, `tipo`, `resumen`, `paises`, `estado` y `revisado`; terminan en «Fuentes». Aviso si llevan más de 90 días sin revisar |

## Fuentes que se leen solas

El vigilante lee cada hora, de 06 a 21 h de Argentina, las filas `activa` de [`fuentes-vigilancia.csv`](../data/fuentes-vigilancia.csv). Lo que lee se ve también en la web, en «Fuentes».

| Fuente | País | Qué lee | Cómo lo publica |
|---|---|---|---|
| **Gendarmería y Vialidad** (web del Ministerio de Seguridad) | 🇦🇷 | Estado, horario, «Atención» y hora de cada parte de Jama, Sico y Misión La Paz | Según la [regla de los pasos](regla-estado-pasos.md) |
| **Vialidad Nacional** (estado de rutas) | 🇦🇷 | La tabla oficial, por provincia, ruta y tramo | Corte total: rojo · restringida o corte parcial: ámbar · observaciones de una ruta habilitada: informativo |
| **Vialidad de Chile** (SIEMOP) | 🇨🇱 | Emergencias de Tarapacá y Antofagasta, con coordenadas; cuentan las rutas nacionales a menos de 3 km del tramo | Tránsito no operativo: rojo · solo livianos, peso o doble tracción: «No habilitado para carga» · resto: ámbar · sin novedades en 14 días: ámbar «confírmalo» |
| **MOPC** (informe diario en PDF) | 🇵🇾 | Puentes inhabilitados, rutas clausuradas y lista por localidad, de lunes a viernes | «Clausurada» para vehículos pesados: «No habilitado para carga» · «Clausurada» o «precaución»: ámbar (en pruebas, como mucho ámbar) |
| **DNIT** (alertas de servicios) | 🇧🇷 | Alertas de la BR-267 en Mato Grosso do Sul, hasta 30 días atrás | Interdicción total: rojo · peso o camiones: «No habilitado para carga» · parcial o desvío: ámbar · «liberação»: cierra lo anterior · lo que no encaja: aviso para revisar a mano |

**Lo que no se lee solo:** la Unidad de Pasos Fronterizos de Chile (se revisa su canal y se carga a mano), el Puente Bioceánico (noticias oficiales) y lo que no tiene fuente (BR-267 hasta Porto Murtinho, ruta provincial de Misión La Paz), que sale en gris, «sin vigilancia».

**Lo que protege la lectura:**
- Una copia más antigua de la fuente se descarta: nunca se va hacia atrás.
- Lo cargado a mano no se toca.
- Un aviso se retira solo si falta en dos lecturas seguidas (en el MOPC, en dos informes).
- Si una fuente falla 3 veces seguidas, llega un correo: el vigilante está ciego con ella. Si publica menos de lo habitual, sale «Fuente atrasada».
- Antes de subir nada se pasa `npm run check`; si falla, no se publica.

## Cambiar o añadir una fuente

| Quiero… | En `fuentes-vigilancia.csv` |
|---|---|
| Pausar una fuente | `estado` = `pausada` |
| Que una carretera cuente en otro tramo | Cambiar su `destino` (`paso:jama`, `tramo:pozo-hondo`…) |
| Añadir una ruta de Vialidad o un paso de Gendarmería | Una fila nueva con su `filtro` (p. ej. `provincia=Jujuy;ruta=9;tramos=A\|B`) |
| Cambiar los umbrales de Chile | `km`, `dias_sin_novedad` y `max_horas` en el `filtro` |

**Una fuente de un tipo nuevo:**
1. Filas con `estado` = `pendiente` y su `lector`.
2. Una copia real de la fuente en `pruebas/vigilante/` y el lector con su autoprueba.
3. El lector en `LECTORES_AUTOMATICOS` (`scripts/fuentes-vigilancia.mjs`) y la fuente en `data/fuentes.json`.
4. Las filas, a `activa`.

`npm run check` impide publicar una fila activa con un lector que no existe, una fuente que no es oficial, un destino que no existe o un filtro incompleto.

## Límites conocidos

| Límite | Qué lo mitiga |
|---|---|
| La IA trabaja con la cuenta de GitHub del propietario y puede poner la etiqueta `revision-editorial` | Solo con un «confirmo» explícito de Ernesto para ese PR, y con un comentario que lo deja escrito (decisión 36). Pasará a ser un control técnico al proteger `main` (#49) |
| Chile y el Puente Bioceánico dependen de una revisión a mano | Plazo de 15 días para Chile, con enlace al canal |
| El MOPC y el DNIT cambian de formato sin avisar | Autopruebas con copias reales y aviso a los 3 fallos |
