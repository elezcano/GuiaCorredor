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

Una ficha de la guía en `borrador` arrastra a sus datos: el estado de un paso solo se confirma si el dato **y** su ficha están verificados.

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
7. Sin fuente no hay dato: una distancia sin fuente se muestra como «sin dato», no se estima.

## Límite conocido

El asistente trabaja con el acceso a GitHub de la cuenta del propietario, así que técnicamente podría poner la etiqueta. La regla 3 es un control de procedimiento: el asistente no pone esa etiqueta ni fusiona PR con verificaciones. Para que sea un control técnico hace falta proteger `main` y exigir la revisión del propietario (tarea P1.11, #49).
