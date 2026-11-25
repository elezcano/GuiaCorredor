# Regla de negocio: estado de un paso fronterizo

Una sola página con la regla vigente (decisiones 31, 32 y 33 del README). Si el código y este documento no coinciden, es un fallo: se corrige uno de los dos en el mismo PR.

## Los tres estados

| Estado | Qué significa | Cuándo |
|---|---|---|
| **Habilitado** | Se puede cruzar en su horario | Todos los lados que cuentan lo confirman |
| **Habilitado con restricciones** | Se cruza, con limitaciones | Un lado lo confirma y su ruta está restringida (Vialidad) |
| **No habilitado** | No se puede cruzar | Un organismo oficial lo cierra, o es un puente en obras |
| **Sin confirmar** | No lo sabemos hoy | Falta la confirmación de un lado que cuenta |

Principios:

1. Un cierre solo es un cierre si lo dice un organismo oficial, dentro del horario o con una causa.
2. El silencio de un país que avisa a diario no vale como «Habilitado». El de un país que solo avisa cuando cierra, sí.
3. La duda sale como «Sin confirmar», nunca como «Cerrado» ni como «Abierto».

## Regla en tres líneas

1. **Cada lado lo decide su país**, con su fuente oficial.
2. **Según cómo informa su país:** si avisa cada día de que abre, su silencio no vale; si solo avisa cuando cierra, su silencio significa abierto; si no tiene canal oficial, ese lado no cuenta.
3. **El cruce es el peor de los lados que cuentan.** Un cierre o una restricción oficial se muestra tal cual; un «Habilitado» solo se da si todos los lados que cuentan lo confirman.

## Por país

| País | Fuente oficial | Modo (`site.canalesParte`) | Su lado vale si… |
|---|---|---|---|
| Argentina | Gendarmería Nacional y Vialidad Nacional, web del Ministerio de Seguridad (lectura automática cada hora) | `diario` (por defecto) | el vigilante leyó su web hace menos de 6 h, o hay parte oficial de hoy |
| Chile | Unidad de Pasos Fronterizos (cuenta oficial en X) | `por-aviso`, plazo 15 días | no hay aviso de cierre y el canal se revisó en los últimos 15 días («Sin avisos desde…») |
| Paraguay | Ninguna (revisado el 25/11/2026: ni Migraciones, ni DNIT, ni MOPC publican el estado de los pasos) | `sin-canal` | no cuenta: decide el otro lado; la ficha dice «Sin canal oficial» |
| Brasil | — | — | Puente Bioceánico en obras: «No habilitado» hasta su apertura |

Cruces: **Jama** y **Sico** (Argentina–Chile), **Misión La Paz–Pozo Hondo** (Argentina–Paraguay) y **Puente Bioceánico** Carmelo Peralta–Porto Murtinho (Paraguay–Brasil, en obras).

## Lado argentino: cómo decide el vigilante

`scripts/vigilante.mjs`, función `decidir`, cada hora:

```text
si Gendarmería = "CERRADO":
    motivoReal ← el texto de «Motivo del cierre» nombra una causa (nieve, viento, paro, avería…)
                 o, sin causa, se emitió DENTRO del horario (grupo fecha-hora DDHHMM MES AA del parte
                 o, si no lo trae, la hora de Gendarmería)
    esCierre ← sin horario publicado o motivoReal o el parte de Gendarmería es de DENTRO del horario
    si esCierre: No habilitado
    si no (cierre de cada noche):
        exigible ← hoy a la apertura + 60 min (si aún no llegó esa hora: la de ayer)
        si el último parte de Gendarmería es anterior a exigible: Sin confirmar
        si no: Habilitado (de noche, «Cierre de la jornada»)
si Gendarmería = "ABIERTO":
    Vialidad RESTRINGIDA o CORTE TOTAL → Con restricciones; si no → Habilitado
```

Si el vigilante dio por cierre algo que con esta regla es el cierre de la noche, lo corrige solo en la siguiente pasada (estado y parte).

## Lo que la web muestra

`scripts/build.mjs`, `estadoPaso` y `ladosHTML`:

- Estado sin verificar o caducado (30 días abierto, 120 cerrado) → «Sin confirmar».
- Estado de prensa, no oficial → «Sin confirmar».
- No habilitado o con restricciones → tal cual.
- Habilitado → se comprueban los lados que cuentan. Si a alguno le falta → «Sin confirmar · falta confirmación de …».
- La ficha enseña una línea por país: confirmado (sólido), «Sin avisos desde…» (contorno), «Sin confirmar» (contorno discontinuo, con enlace al canal) o «Sin canal oficial» (gris).
- El horario va aparte del estado: «Fuera de horario · abre en…» no es un cierre.

## Histórico 30/90 días

Decisión 32. Un registro por día y paso (`diario`, 120 días):

- Solo cuentan lecturas dentro del horario, con evidencia oficial y **con parte de Gendarmería de ese mismo día**.
- El día guarda su peor estado.
- Un día sin lecturas válidas es «sin datos»: nunca hereda el anterior.
- Las correcciones de días ya registrados van en `CORRECCIONES_DIARIO` (se aplican una vez y quedan anotadas).

## Casos reales que fijaron la regla

| Fecha | Qué pasó | Qué se decidió |
|---|---|---|
| 17–19/11 | Cierres de cada noche contados como cierres | Un «Cerrado» fuera de horario y sin motivo no es un cierre (#244) |
| 22/11 | Chile publica el parte de las 20:00 («222000NOV26 … permanece cerrado») y la web oficial lo pone en «Motivo del cierre» | Sin causa y fuera de horario no es motivo (#248) |
| 23/11 | Gendarmería no publicó en todo el día en Jama ni en Sico | Ese día queda «sin datos»; el histórico exige parte del día (#248) |
| 24/11 | A las 08:30 Jama salía «Abierto» con el último parte del 22/11 | «Sin confirmar» hasta que se publique la apertura, también antes de abrir (#257) |
| 25/11 | Paraguay no tiene canal oficial | Su lado no cuenta y se dice (#257) |

## Dónde se cambia

| Qué | Dónde |
|---|---|
| Modo y plazo de cada país | `data/site.json` → `canalesParte` |
| Margen de apertura (60 min) | `scripts/vigilante.mjs` → `MARGEN_APERTURA_MIN` |
| Palabras que cuentan como causa | `scripts/vigilante.mjs` → `CAUSA` |
| Antigüedad de la lectura automática (6 h) | `scripts/build.mjs` → `LECTURA_LADO_H` |
| Pruebas | `node scripts/vigilante.mjs --autoprueba` y `pruebas/lados.cjs` |
