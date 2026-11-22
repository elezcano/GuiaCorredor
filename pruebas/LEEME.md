# Pruebas de navegador

Abren la web en Chromium, como lo haría un usuario, y comprueban que lo que ya funcionaba sigue funcionando. GitHub las ejecuta en cada cambio (trabajo `pruebas` de `.github/workflows/publicar.yml`). **Si alguna falla, la web no se publica.**

| Archivo | Qué comprueba |
|---|---|
| `funcional.cjs` | Portada, mapa, planificador, fichas de paso y de tramo, sin errores de JavaScript ni recursos rotos |
| `informe.cjs` | Informe de viaje (HU-45): puente no habilitado, festivos, alternativa por Sico, resumen de WhatsApp, PDF, móvil claro y oscuro |
| `informe-resumen.cjs` | Informe resumido (HU-80): el PDF ocupa una sola hoja A4 por Jama y por Sico, bloques, enlace al completo, móvil claro y oscuro |
| `fiabilidad.cjs` | Fiabilidad (HU-97): cálculo de días (cierre, solo carga, sin datos, pendientes) y bloque en la ficha y el informe |
| `sentido.cjs` | Sentido del cruce (HU-105): botón «⇄», orden de controles y partes, sentido en la URL y enlaces del planificador |
| `fichas-paso.cjs` | Fichas de paso (HU-65 a HU-68): hora local, «abierto ahora», controles, botón Llamar y novedades |
| `partes.cjs` | Partes por organismo (HU-73): fecha, hora, antigüedad, «sin parte cargado» y aviso a partir de 48 h |

## Por qué no fallan solas con el paso del tiempo

- **Datos fijos:** se construye una copia de la web con `pruebas/datos/` en lugar de `data/`. Editar los datos reales no rompe las pruebas; los datos reales los revisa `npm run check`.
- **Fecha y reloj fijos:** la web de pruebas se construye con `FECHA_HOY=2026-11-15` y el navegador ve siempre el 15/11/2026 a las 20:30 (Madrid).

## Ejecutarlas en local

```bash
npm install
npm install --no-save playwright@1.63.0 && npx playwright install chromium
npm run pruebas
```

El resultado es una línea por prueba (✓ o ✗ con los fallos). Las capturas quedan en la carpeta temporal (`SALIDA` para cambiarla). En GitHub, si algo falla, las capturas se guardan 7 días como artefacto `capturas-pruebas`.

## Al añadir una historia

1. Escribe `pruebas/<nombre>.cjs` con `require('./comun.cjs')` (`B`, `lanzar`, `captura`, `fin`).
2. Si la historia añade campos a los datos, actualiza `pruebas/datos/` con un ejemplo de esos campos.
3. `npm run pruebas` debe terminar con «Las N pruebas pasan».


## Solo algunas pruebas

`npm run pruebas -- diseno portugues` ejecuta solo las que empiezan por esos nombres.

## diseno.cjs (V2)

En móvil (390), tablet (820) y escritorio (1440): sin scroll lateral, filas de botones en una línea, menú lateral (escritorio y tablet) o inferior (móvil), iconos de Tabler (24, trazo 2, `currentColor`), botones de al menos 44 px, señal de carril en cada paso del tablero, modo noche y vistas de consulta en una pantalla. Deja capturas `diseno-*.png` en la carpeta de capturas.

## lados.cjs (decisión 31)

Estado por lado del paso: Sico abierto con parte argentino y Chile «sin avisos» (Chile informa por aviso); Jama, con estado de prensa, sigue «Sin confirmar». Horario aparte del estado («cierra en…», «Fuera de horario · abre…»). Cotizar envía a su formulario de Google (se intercepta el envío: no llega nada a la hoja real), confirma «Solicitud enviada» y cuenta el evento en GoatCounter sin nada de lo escrito. Anunciarme también envía a su formulario. Sin script de estadísticas fuera de la web publicada.

## Tres niveles de comprobación

| Nivel | Qué | Cuándo |
|---|---|---|
| `npm run check` | Datos reales: esquemas, fuentes, fechas, enlaces internos | En cada PR y publicación |
| `npm run pruebas` | Código, en navegador, con datos fijos (estas pruebas) | En cada PR y publicación: si fallan, no se publica |
| `scripts/humo.mjs` (Vigía) | La web publicada de verdad: páginas, tablero, formularios de Google que aceptan respuestas, GoatCounter, vigilante y publicación al día | Tras cada publicación y cada 6 h. Si falla, abre el issue «Vigía: la web publicada tiene fallos»; si se arregla, lo cierra |

En local: `HUMO_URL=http://localhost:4321 node scripts/humo.mjs --sin-externos` (sin Google ni GitHub).
