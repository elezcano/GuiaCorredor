# Política de validación de datos

Aprobada el 14/11/2026. Principio rector: **la fiabilidad tiene prioridad sobre la cantidad**. Ningún dato se muestra como confirmado si no lo ha revisado una persona responsable.

## Responsable

El responsable de verificación es **Ernesto**, responsable editorial del proyecto. En los datos figura con el identificador estable `responsable-editorial`, que siempre representa a quien ostente ese rol. Es el único valor admitido en `verificacion.verificadoPor` (lista en `scripts/validacion.mjs` → `VERIFICADORES` y en el esquema `data/esquemas/comun.schema.json`).

No se asigna la verificación al asistente de IA ni a terceros. Un despachante u otra persona puede **aportar** revisión; la firma la pone el responsable editorial.

## Estados

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

## Semáforo operativo

Lo que ve el usuario en cada paso o tramo, siempre con icono y texto además del color:

| Semáforo | Cuándo |
|---|---|
| Abierto (verde) | Estado verificado `operativo` |
| Con restricciones (ámbar) | Verificado `restricciones`, `intermitente` o `cierre-programado`; en un tramo de carretera, también `en-obras` (se circula con obras) |
| No habilitado (rojo) | Verificado `cerrado`; en un paso, también `en-obras` (no se puede cruzar) |
| Sin confirmar (gris, trazo discontinuo) | Todo lo no verificado. Se muestra el último dato publicado con su fecha y cuánto hace; si tiene más de 30 días, se resalta |

La regla está en `scripts/lib.mjs` (`operativaDe`) y el planificador usa la misma.

## Tipos de evidencia (`evidencia`)

| Valor | Uso |
|---|---|
| `oficial` | Organismo público o norma |
| `declaracion-empresa` | Lo dice la propia empresa. Nunca se considera verificado por sí solo |
| `tercero` | Prensa, obras de referencia, cartografía de terceros |
| `calculo` | Cuenta hecha a partir de otros datos con fuente (se explica en una nota) |
| `estimacion` | Aproximación. No se puede marcar como verificada como dato actual |
| `historico` | Dato pasado (incidencia resuelta). Nunca describe la situación actual |

## Reglas de publicación

1. Nada se publica como verificado sin revisión del responsable editorial.
2. La IA puede investigar, comparar fuentes, proponer cambios y actualizar `actualizado`, pero **nunca** escribe `validacion: verificado` ni `verificacion`.
3. Un Pull Request que añade verificaciones necesita la etiqueta `revision-editorial`; la comprobación de CI (`scripts/verificaciones.mjs`) falla sin ella. La etiqueta la pone solo el responsable editorial.
4. Toda automatización que incorpore datos los deja en `por-verificar`.
5. Las solicitudes de empresas no se publican solas: se revisan y entran por Pull Request.
6. Un festivo no implica cierre de aduana; las afectaciones deben venir del organismo.
7. Sin fuente no hay dato. **Excepción provisional (15/11/2026):** mientras el corredor no esté terminado y no haya distancias oficiales (P1.7), los tramos sin distancia con fuente muestran una estimación en línea recta con `evidencia: "estimacion"`, la etiqueta «Estimación provisional», qué tramo exacto se estima y entre qué puntos. Nunca se suma como dato oficial. Se desactiva en `data/site.json` → `estimaciones.provisionales`.

## Estado del proyecto

La web está en **versión borrador (MVP)**. Por decisión del responsable, la rama `main` no se protege todavía; se protegerá más adelante (P1.11, #49).

## Límite conocido

El asistente trabaja con el acceso a GitHub de la cuenta del propietario, así que técnicamente podría poner la etiqueta. La regla 3 es un control de procedimiento: el asistente no pone esa etiqueta ni fusiona PR con verificaciones. Pasará a ser un control técnico cuando se proteja `main` con revisión obligatoria del propietario (P1.11, #49), aplazado mientras la web sea un borrador.
