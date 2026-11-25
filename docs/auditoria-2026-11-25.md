# RadarCorredor · Auditoría de integridad del dato, trazabilidad, incertidumbre y directorio

**Fases A (diagnóstico) y B (propuesta).** 25/11/2026. Hecha sobre `main` tras #264, leyendo el código, los datos, las pruebas y la web generada.

## Seguimiento

| Hallazgo | Estado | Dónde |
|---|---|---|
| C1 · valor desconocido leído como abierto | **Corregido** (lote 1) | `vigilante.mjs` `ESTADOS_GENDARMERIA`; autoprueba |
| C2 · corte total como «Con restricciones» | **Se mantiene por decisión del fundador (D2)**; riesgo documentado | `regla-estado-pasos.md`, «Riesgos conocidos» |
| A1 · estados no habilitados sin caducidad por fuente | **Decisión D3:** se mantiene el último estado y se avisa de la fuente caída (lote 1) | `build.mjs` `fuenteCaidaDe` |
| A3 · aviso de cierre de Chile daba «Sin confirmar» | **Corregido** (lote 1) | `build.mjs` `avisoDeLado` |
| A4 · silencio de Chile | **Decisión D1:** se mantiene la 33, contrastando Argentina y las carreteras de ambos lados (lote 1) | `build.mjs` `accesoConAvisos` |
| M5 · fuente caída sin marcar en los pasos | **Corregido** (lote 1) | `build.mjs` |
| M1 · estado y confianza mezclados | **Corregido** (lote 2, decisión 38) | `build.mjs` `confianzaDe`; [regla](regla-estado-pasos.md#confianza) |
| M2 · la hora de consulta no estaba en el estado ni en la API | **Corregido** (lote 2) | `vigilante.mjs` `estado.consultado`; `build.mjs` `consultadoPaso`; `api/v1` 1.8.0 |
| A1 / M5 · caducidad y fuente caída a la vista | **Ampliado** (lote 2): variantes «Dato caducado» y «Fuente no disponible» y «último estado conocido», respetando D3 | `build.mjs`, `styles.css` |
| A2 · sin registro de cada lectura | **Corregido** (lote 3, decisión 39) | `vigilante.mjs` `guardarRegistro`; [regla, «Registro por ejecución»](regla-estado-pasos.md#registro-por-ejecución) |
| B2 · pasada perdida sin alerta | **Corregido** (lote 3) | `humo.mjs`: más de 2 h sin pasada dentro del horario |
| M3, M4, M6, B1, B3 | Pendientes (lotes 4–5 y siguiente ciclo) | §B.4 |
| D4 · verosimilitud | Siguiente ciclo | — |
| D5 · empresa «verificada» | **Decidido:** exige confirmación de la empresa (lote 5) | — |

---

## A. Diagnóstico

### A.1 Arquitectura actual (verificada en el código)

| Pieza | Qué hace | Dónde |
|---|---|---|
| Vigilante | Lee cada hora (de 06:17 a 21:17, hora de Argentina) la web del Ministerio de Seguridad de Jama, Sico y Misión La Paz; decide el estado del lado argentino; lleva el registro diario | `scripts/vigilante.mjs`, `vigilante.yml`; escribe en `main` (`data/pasos.json`) y en la rama `datos-vigilancia` (`vigilancia.json`) |
| Publicación | Combina estado, lados, canales y caducidad; genera la web estática y `api/v1` | `scripts/build.mjs`, `publicar.yml` (cada push y cada 3 h) |
| Vigía | Pruebas de humo sobre la web publicada; abre y cierra una incidencia | `scripts/humo.mjs`, `vigia.yml` |
| Datos manuales | Partes de Chile, horarios, incidencias, revisión de canales | PR a `main` |
| Formularios | Cotización, solicitudes y cruces → Google Forms/Sheets (privado) | `site.json` |

La arquitectura estática es suficiente para todo lo que pide el encargo. **No hace falta backend ni base de datos.**

### A.2 Esquema de datos del estado (lo que existe)

| Atributo pedido | Hoy | Valoración |
|---|---|---|
| estado_operativo | `estado.valor`: `operativo`, `restricciones`, `cerrado`, `pendiente`, `en-obras` | Existe, pero `pendiente` mezcla estado y confianza (A.4-M1) |
| fuente / url_fuente | `estado.fuente` → `data/fuentes.json` (con URL) | Existe |
| fecha_publicacion_fuente | `estado.publicado` (fecha) + `partes[].hora` | Existe; la hora solo está en los partes |
| fecha_consulta | `vigilancia.json → fuentes[id].ultimaLecturaBuena` (ISO); en `pasos.json` solo `verificacion.fecha` (día) y la hora dentro de un texto | Parcial: no está en el estado ni en la API (A.4-M2) |
| fecha_ultima_verificacion | `estado.verificacion.fecha` | Existe (día) |
| alcance_geografico / operativo | Lado (`partes[].lado`); `restricciones[]` en texto; «carga» en incidencias | Parcial |
| metodo_verificacion | `verificacion.verificadoPor` (`vigilante` / `responsable-editorial`) y `alcance` (texto) | Existe |
| nivel_confianza | `evidencia` (`oficial`, `tercero`…) + `validacion` (`verificado`, `por-verificar`, `caducado`) | Existe por piezas; no hay un campo único ni se publica como tal |
| fecha_caducidad | Calculada: `CADUCIDAD` (30 días abierto o con restricciones, 120 cerrado) | Existe, pero no usa la vida de la fuente (A.4-A1) |
| motivo_sin_confirmar | Texto en `estado.texto` y `sinLados` en la web | Existe como texto, sin código |
| Registro diario | `vigilancia.json → diario[paso][día]` (peor clase, lecturas, horas), 120 días | Existe |

### A.3 Regla de estados (resumen; detalle en `docs/regla-estado-pasos.md`)

Argentina decide a diario (vigilante); Chile por aviso con revisión cada 15 días; Paraguay sin canal; el cruce es el peor de los lados que cuentan. Hay 97 casos en la autoprueba del vigilante y 15 pruebas de navegador.

### A.4 Problemas encontrados

#### Críticos

| ID | Problema | Evidencia | Consecuencia |
|---|---|---|---|
| **C1** | **Cualquier valor de Gendarmería distinto de «CERRADO» se trata como abierto.** Si la web oficial publica un valor nuevo («CONDICIONADO», «SIN INFORMACIÓN», vacío con otro formato…), el vigilante publica «Habilitado». | `vigilante.mjs:183` `cerradoGendarmeria = lectura.estado === 'CERRADO'`; el resto de ramas usan `!cerradoGendarmeria` | Falso «Habilitado» por un cambio de formato: el peor error posible (incumple los puntos 6 y 7 del encargo) |
| **C2** | **«Corte total» de Vialidad se publica como «Habilitado con restricciones».** Con Gendarmería abierta y la ruta de acceso cortada, el paso sale en ámbar. | `vigilante.mjs:194` y `:259`: `RESTRINGIDA` y `CORTE TOTAL` → `restricciones` | Un camionero lee «se puede pasar con cuidado» cuando no se llega al paso (incumple el punto 9) |

#### Altos

| ID | Problema | Evidencia | Consecuencia |
|---|---|---|---|
| **A1** | **Solo caduca por fuente caída el estado «Habilitado».** Un «No habilitado» o «Con restricciones» del vigilante se sigue mostrando aunque la web oficial lleve días sin leerse (hasta 30/120 días de `CADUCIDAD`). | `build.mjs` `estadoPaso`: si el estado no es `operativo` se devuelve tal cual; la vida de la lectura (`LECTURA_LADO_H`) solo se aplica a los lados de un paso habilitado | La interfaz transmite más seguridad de la que tiene el dato |
| **A2** | **No hay registro estructurado de cada ejecución.** Se puede reconstruir a medias (logs de Actions, que caducan a los 90 días; commits de `main` solo cuando cambia algo; historia de `datos-vigilancia`), pero no hay un registro «consulté → recibí → calculé → publiqué» por paso y pasada | `vigilante.yml`, `vigilancia.json` (solo el último estado por fuente) | No se puede explicar con certeza por qué se mostró un estado hace 60 días (prioridad 2 del encargo) |
| **A3** | **Un aviso de cierre de Chile cargado como parte no da «No habilitado».** Si el editor carga el parte de cierre de la UPF pero no cambia el estado, el paso sale «Sin confirmar». La documentación dice «No habilitado» | `build.mjs` `ladoPorAviso`: un parte que no es `operativo` → lado sin confirmar; `docs/regla-estado-pasos.md` D5/§4 | Documentación y código no coinciden; un cierre oficial se muestra como duda |
| **A4** | **Decisión del fundador en conflicto con el encargo.** El encargo dice que la ausencia de aviso de Chile «no debe interpretarse automáticamente como confirmación de apertura»; la decisión 33 (24/11) la acepta como habilitado durante 15 días tras revisar el canal | `site.json` `canalesParte.CL`, decisión 33 | Hay que decidir (B.3-D1) |

#### Medios

| ID | Problema | Evidencia |
|---|---|---|
| **M1** | **Estado y confianza están mezclados.** «Sin confirmar» es a la vez un estado (`pendiente`) y un nivel de confianza; no hay forma de decir «último estado conocido: cerrado · confianza: fuente caída» | `estado.valor = pendiente`; semáforo único |
| **M2** | **La hora de consulta no está en el estado ni en `api/v1`.** La ficha la enseña (a partir de `vigilancia-estado.json`), pero el dato publicado solo lleva el día | `estado.verificacion.fecha`; `api-v1.schema.json` |
| **M3** | **Una sola lectura cambia el estado** (de abierto a cerrado y al revés) sin control de verosimilitud (p. ej. un «CERRADO» y un «ABIERTO» alternos cada hora) | `decidir` |
| **M4** | **No hay prueba automática de contraste ni accesibilidad.** Hay pruebas de diseño, pero no comprueban WCAG AA | `pruebas/diseno.cjs` |
| **M5** | **La fuente caída o atrasada solo se marca en las carreteras**, no en los pasos (sí existe `fuenteParada`/`fuenteAtrasada` a 12 h) | `build.mjs:292-319` |
| **M6** | **El directorio no tiene estados de verificación propios.** El esquema exige fuente y validación por empresa (bien), pero no distingue «identificada / con contacto / verificada / inactiva»; la base de prospección privada (272) sí lleva estados de contacto | `empresas.schema.json`, Apps Script de prospección; 0 empresas publicadas |

#### Bajos

| ID | Problema |
|---|---|
| **B1** | El vigilante no lee entre las 21:17 y las 06:17 (hora de Argentina). Los pasos están cerrados de noche, pero un cierre nocturno se ve con la primera pasada |
| **B2** | El cron de GitHub Actions puede llegar con retraso; el umbral de 6 h lo absorbe, pero no hay alerta por pasada perdida (solo por fallos de lectura) |
| **B3** | La lista de palabras `CAUSA` es cerrada: un cierre real con una causa no prevista, fuera de horario, se tomaría por rutinario |

### A.5 Lo que está bien y hay que conservar

- **Ninguna fuente no oficial decide un estado** (la prensa da «Sin confirmar»).
- **El parte de la noche no es un cierre** y el histórico exige parte del día. Está probado con los casos reales del 22–24/11.
- **Errores de lectura:** si la lectura no trae estado o es más antigua que la cargada, no se toca nada, y a los 3 fallos seguidos se abre una incidencia con correo.
- **El vigilante no pisa lo que cargó una persona** (INV-9).
- **Trazabilidad:** histórico en Git, correcciones del registro diario trazadas (`CORRECCIONES_DIARIO`), documento de regla con bitácora.
- **Directorio:** el esquema ya exige fuente y validación, y no hay ninguna empresa publicada sin revisar.

---

## B. Propuesta

### B.1 Cambios recomendados (por prioridad)

| # | Cambio | Resuelve | Ficheros | Riesgo de regresión | Arquitectura |
|---|---|---|---|---|---|
| 1 | **Lista blanca de valores oficiales:** solo «ABIERTO» y «CERRADO» deciden; cualquier otro valor → «Sin confirmar · valor no reconocido», incidencia y prueba | C1 | `vigilante.mjs` + autoprueba | Bajo | Sin cambio |
| 2 | **Corte total = No habilitado** (con motivo «ruta de acceso cortada según Vialidad»); «Restringida» sigue en «Con restricciones» | C2 | `vigilante.mjs`, `regla-estado-pasos.md`, autoprueba, `lados.cjs` | Bajo (depende de D2) | Sin cambio |
| 3 | **Caducidad por fuente para todos los estados del vigilante:** sin lectura buena en 6 h, cualquier estado leído automáticamente pasa a «Sin confirmar · último estado conocido: X a las HH:MM · fuente no disponible» | A1, M5 | `build.mjs` (`estadoPaso`), pruebas | Medio (cambia lo que se ve de noche y en caídas) | Sin cambio |
| 4 | **Aviso de cierre de un canal por aviso = No habilitado** (si es de hoy o está vigente), o corregir la documentación si se decide lo contrario | A3 | `build.mjs` `ladoPorAviso`, doc, `lados.cjs` | Bajo | Sin cambio |
| 5 | **Confianza como dimensión aparte**, sin renombrar el esquema: se calcula `confianza` = `oficial-automatica`, `verificacion-manual`, `pendiente-de-verificar`, `caducada`, `fuente-no-disponible`, `contradictoria`, y se publica junto al estado en la web y en `api/v1` (campo nuevo y opcional; la versión anterior se mantiene) | M1, M2 | `build.mjs`, `api-v1.schema.json`, `docs/api-cambios.md` | Medio (API) | Sin cambio |
| 6 | **Hora de consulta en el estado:** `estado.consultado` (ISO) escrito por el vigilante | M2 | `vigilante.mjs`, `pasos.schema.json` | Bajo | Sin cambio |
| 7 | **Registro por ejecución:** un JSONL por día en `datos-vigilancia` (`registro/AAAA-MM-DD.jsonl`), una línea por paso y pasada: `{ejecucion, paso, fuente, consultado, http, lectura: {gendarmeria, vialidad, parte}, calculado, publicado, cambio, error}`. Sin datos personales. Retención: 120 días | A2 | `vigilante.mjs`, `vigilante.yml`, `docs/regla-estado-pasos.md` (cómo consultarlo) | Bajo | Ficheros en Git, sin base de datos |
| 8 | **Alerta de pasada perdida:** el Vigía comprueba que la última pasada del vigilante no tenga más de 2 h dentro del horario | B2 | `humo.mjs` | Bajo | Sin cambio |
| 9 | **Lenguaje visual de la incertidumbre:** sobre el sistema actual (color + texto + icono + fecha + fuente), añadir dos variantes: «caducado» y «fuente no disponible», y la línea «Último estado conocido» | A1, M1 | `build.mjs`, `styles.css`, `pt-BR.json`, pruebas | Medio (visual) | Sin cambio |
| 10 | **Prueba de contraste WCAG AA** de los estados en claro y oscuro | M4 | `pruebas/diseno.cjs` | Nulo | Sin cambio |
| 11 | **Estados de empresa:** `identificada → contacto-localizado → verificada`; `pendiente-revision`; `inactiva`. Solo «verificada» se publica. Embudo medible: contactadas, interesadas, verificadas, destacadas, cobrado | M6 | `empresas.schema.json`, Apps Script de prospección, `docs/como-editar.md` | Bajo | Sheets + JSON estático |
| 12 | **Verosimilitud** (opcional): un cambio de abierto a cerrado se publica al instante (es la dirección prudente); un cerrado→abierto→cerrado en menos de 2 h genera aviso de «lectura inestable» | M3 | `vigilante.mjs` | Medio | Sin cambio |

### B.2 Sin cambio de arquitectura

Todo lo anterior. El registro y la confianza caben en los ficheros de Git, el directorio cabe en Sheets más JSON, y la publicación sigue en GitHub Pages.

### B.3 Decisiones del fundador

| ID | Decisión | Opciones | Recomendación |
|---|---|---|---|
| **D1** | **Silencio de Chile** (el encargo choca con la decisión 33) | a) Mantener la 33: sin avisos y canal revisado en 15 días = el lado vale (hoy). b) El encargo: sin aviso no confirma → con Chile casi mudo, Jama y Sico saldrían casi siempre «Sin confirmar». c) Intermedio: el lado vale solo si el canal se revisó **hoy** | **a**, con la confianza visible: la línea de Chile ya va en contorno («Sin avisos desde…»), no en verde sólido, y el paso solo sale «Habilitado» porque Argentina confirma en positivo. Con b el producto deja de servir para decidir |
| **D2** | **Corte total de Vialidad en la ruta de acceso** | a) No habilitado. b) Con restricciones (hoy) | **a**: no se llega al paso |
| **D3** | **Estado conocido con fuente caída** | a) «Sin confirmar» + «último estado conocido». b) Mantener el último estado con aviso | **a**: la interfaz nunca transmite más seguridad que el dato |
| **D4** | **Verosimilitud (cambio 12)** | Hacerlo ahora o en el siguiente ciclo | Siguiente ciclo, salvo que veamos lecturas inestables |
| **D5** | **Objetivo del directorio:** 10 verificadas (primer hito) y 30 en 90 días | Confirmar que «verificada» exige comprobación con la empresa (llamada o formulario «Anunciarme») | Sí |

### B.4 Orden de ejecución (fase C)

| Lote | Contenido | PR |
|---|---|---|
| 1 · Integridad (urgente) | Cambios 1, 2, 4 (C1, C2, A3) + pruebas + documento | 1 PR |
| 2 · Caducidad y confianza | Cambios 3, 5, 6, 9 (A1, M1, M2, M5) + pruebas de navegador | 1 PR, con capturas antes de publicar |
| 3 · Registro | Cambios 7 y 8 (A2, B2) + guía de consulta | 1 PR |
| 4 · Calidad visual | Cambio 10 (M4) | 1 PR |
| 5 · Directorio | Cambio 11 (M6) | 1 PR + script |

Cada lote pasa la autoprueba, las pruebas de navegador, la publicación y el Vigía, y se registra en `docs/registro.md`. Nada se publica sin «publica».

### B.5 Fuera de alcance de este ciclo

Pagos, suscripciones, backend, bases de datos externas, lectura automática de la cuenta en X de la UPF (no hay API gratuita estable) y rediseño general de la web.

## Trazabilidad del lote 1

PR #265 · commit [`849c1ee`](https://github.com/elezcano/GuiaCorredor/commit/849c1ee25dda28465f40a869d2b787dadd716f8a) · publicado el 25/11/2026.

Cadena completa de cada cambio: hallazgo de la auditoría → decisión → regla → código → prueba → documentación. Los enlaces apuntan al commit publicado, así que no cambian aunque el código evolucione.

| Hallazgo | Decisión | Regla (`regla-estado-pasos.md`) | Código | Prueba | Qué ve el usuario |
|---|---|---|---|---|---|
| **C1** · valor de Gendarmería desconocido leído como abierto | Decisión 34 (corrección técnica, sin opción del fundador) | INV-10; tabla D0 | [`vigilante.mjs` · `ESTADOS_GENDARMERIA`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/vigilante.mjs#L156), [rama en `decidir`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/vigilante.mjs#L186), [fallo de lectura en `revisar`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/vigilante.mjs#L631) | Autoprueba del vigilante: [«estado no reconocido (CONDICIONADO)» y «no repite el cambio»](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/vigilante.mjs#L406) | «Sin confirmar: la web oficial marca X, un estado que no sabemos interpretar» + incidencia a los 3 fallos |
| **A3** · aviso de cierre de Chile daba «Sin confirmar» | Decisión 34 (la regla documentada ya lo decía) | INV-11; D6, «aviso de cierre de un país por aviso» | [`build.mjs` · `avisoDeLado`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/build.mjs#L183) y [`estadoPaso`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/build.mjs#L211) | [`pruebas/integridad.cjs`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/pruebas/integridad.cjs), caso A3 (Jama) | «No habilitado · Chile: aviso oficial del …»; tablero «Aviso de Chile» |
| **A4** · silencio de Chile | **D1 del fundador:** se mantiene la decisión 33, contrastando Argentina y las carreteras de ambos lados | INV-11; D6, fila 5 | [`build.mjs` · `accesoConAvisos`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/build.mjs#L191) | `integridad.cjs`, caso D1 (Sico) | «Con restricciones · Hay un aviso oficial en la carretera de acceso»; tablero «Aviso en el acceso» |
| **C2** · corte total como «Con restricciones» | **D2 del fundador:** se mantiene | D4; «Riesgos conocidos» | Sin cambio | Autoprueba existente del corte total | Ámbar, con «corte total según Vialidad Nacional» |
| **A1 / M5** · estado sin caducidad con la fuente caída | **D3 del fundador:** se mantiene el último estado avisando | D6, «fuente caída»; «Si algo falla»; «Riesgos conocidos» | [`build.mjs` · `fuenteCaidaDe`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/build.mjs#L194) y [`notaIntegridad`](https://github.com/elezcano/GuiaCorredor/blob/849c1ee25dda28465f40a869d2b787dadd716f8a/scripts/build.mjs#L203) | `integridad.cjs`, caso D3 (Pozo Hondo) | «La web oficial no responde desde …: es el último estado leído»; tablero «Fuente no responde» |

### Qué mejora en la integridad del dato

El lote 1 quita casos en los que la web podía mostrar un estado distinto del que publicaba la fuente oficial. En tres de ellos, el estado mostrado era más tranquilizador que el real.

| Caso | Antes | Ahora |
|---|---|---|
| Gendarmería publica un valor nuevo o la web cambia de formato | Se mostraba «Habilitado» sin que nadie lo hubiera dicho | «Sin confirmar» con el valor publicado, e incidencia. Se cierra el único camino de un fallo técnico a un falso «Habilitado» |
| La UPF de Chile publica un cierre y se carga | «Sin confirmar»: un dato oficial y cierto presentado como duda | «No habilitado · Chile: aviso oficial del …», con fuente y hora |
| Aviso oficial en la carretera de acceso, de cualquier lado | El paso podía salir «Habilitado»: el dato existía pero no llegaba al estado | «Con restricciones · aviso en el acceso» (solo avisos leídos automáticamente de webs oficiales) |
| La web oficial deja de responder con el paso cerrado | Se mostraba «No habilitado» igual, sin decir de cuándo era | Se mantiene (decisión D3) con «La web oficial no responde desde …: es el último estado leído» |

**Lo que el lote 1 no arregla:**
- No hay un registro de cada lectura que permita demostrar qué leyó el vigilante en una pasada concreta (A2, lote 3).
- Las decisiones D2 y D3 mantienen dos riesgos documentados en `regla-estado-pasos.md`, «Riesgos conocidos»: el corte total en ámbar, y un «Cerrado» que puede seguir mostrándose con la fuente caída aunque el paso haya reabierto.

**Verificación del lote:** autoprueba del vigilante, 99 casos sin fallos; 16 pruebas de la web en verde (local y en CI: `construir`, `pruebas`, `vigilar`); publicación y Vigía en verde tras fusionar. Con los datos reales del 25/11 no cambió lo que se ve, porque no se daba ninguno de los casos.

**Cómo reconstruirlo:** `git show 849c1ee` (todo el cambio); `git log --follow docs/regla-estado-pasos.md` (historia de la regla); PR #265 en GitHub (descripción, comprobaciones de CI y fusión).

## Trazabilidad del lote 2

PR #289 · decisión 38 · capturas antes y después en el lienzo, versión 7.

| Hallazgo | Decisión | Regla (`regla-estado-pasos.md`) | Código | Prueba | Qué ve el usuario |
|---|---|---|---|---|---|
| **M1** · estado y confianza mezclados | Decisión 38 (cambio 5) | [Confianza](regla-estado-pasos.md#confianza); INV-12 | `build.mjs` · `confianzaDe`, `CONFIANZAS` | `integridad.cjs`: una variante por caso | Chip de confianza junto al estado, con icono y texto |
| **M2** · sin hora de consulta en el estado ni en la API | Decisión 38 (cambio 6) | INV-8 | `vigilante.mjs` · `estado.consultado`; `build.mjs` · `consultadoPaso`, `lineaConsulta`; `api.mjs` 1.8.0 | autoprueba del vigilante (ISO); `integridad.cjs` (API) | «Consultado a las 17:05 (hora de Argentina) · publicado el 24 nov» |
| **A1 / M5** · caducidad y fuente caída (cambio 3, adaptado a D3) | D3 del fundador: se mantiene el último estado | «Si algo falla» | `build.mjs` · `confianzaDe` (caducada, fuente no disponible) | `integridad.cjs` (Pozo Hondo, Jama) | «Fuente no disponible» o «Dato caducado», con borde discontinuo; «último estado conocido» |
| **Cambio 9** · lenguaje visual de la incertidumbre | Decisión 38 | Tabla «Confianza» | `build.mjs` · `confianzaHTML`, `estadoCorto`; `styles.css` | `integridad.cjs`; `diseno.cjs` (móvil, tablet, escritorio) | En la ficha, chip y fechas; en el tablero, solo si está degradada |

**Qué cambia frente a la propuesta original de la auditoría:** el cambio 3 proponía pasar a «Sin confirmar» cualquier estado con la fuente caída. La D3 del fundador lo descartó (lote 1), así que el estado se mantiene y lo que baja es la confianza, que ahora se ve con su propia variante.

**Lo que el lote 2 no arregla:** el registro de cada lectura (A2) y la alerta de pasada perdida (B2) son del lote 3; la prueba de contraste (M4), del lote 4.

## Trazabilidad del lote 3

PR del lote 3 (rama `fiabilidad-servicio`) · decisión 39.

| Hallazgo | Decisión | Regla | Código | Prueba | Qué cambia |
|---|---|---|---|---|---|
| **A2** · no se podía reconstruir qué leyó el vigilante | Decisión 39 (cambio 7) | [Registro por ejecución](regla-estado-pasos.md#registro-por-ejecución) | `vigilante.mjs` · `lineaRegistro`, `guardarRegistro`; `vigilante.yml` (rama `datos-vigilancia`) | autoprueba: campos, 120 días, sin datos personales | Un JSONL por día con una línea por paso y pasada |
| **B2** · pasada perdida sin alerta | Decisión 39 (cambio 8) | «Si algo falla» | `humo.mjs` · `enHorarioVigilante` | Vigía tras cada publicación | Aviso con más de 2 h sin pasada dentro del horario (12 h de noche) |
| **Volumen de fiabilidad** (auditoría anterior: «¿cómo me fío de tu web?») | Decisión 39 | — | `servicio.mjs`; página `/fiabilidad/` | `pruebas/servicio.cjs` | Objetivo público del 95 % y cobertura, retraso y correcciones medidos |

**Qué no mide todavía:** la exactitud frente a lo vivido en la frontera, que necesita cruces reales contados por transportistas.
