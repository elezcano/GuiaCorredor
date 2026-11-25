# ◆ RadarCorredor · Corredor Bioceánico

*Antes «Guía del Corredor». RadarCorredor es un producto de Vialta (nombre en validación). Normas de marca: [MARCA.md](MARCA.md).*

**Para qué sirve:** que un transportista, un despachante o una empresa que cotiza sepa en un minuto si puede cruzar el Corredor Bioceánico (Brasil – Paraguay – Argentina – Chile), por dónde, y con qué datos confirmados.

- 🌐 Web: **https://elezcano.github.io/GuiaCorredor/**
- 📦 Datos abiertos: [`/api/v1/indice.json`](https://elezcano.github.io/GuiaCorredor/api/v1/indice.json)
- ✉️ Contacto: radarcorredor@gmail.com · Responsable editorial y de verificación: **Ernesto**

> **Estado: borrador (MVP)**, en el [plan de 90 días](docs/plan.md) hasta la decisión del 18/02/2027.

## Tres reglas

1. **Solo las fuentes oficiales deciden un estado.** La prensa da contexto, nunca decide.
2. **Todo dato lleva su fuente y su fecha.** Si no se puede justificar, no se publica.
3. **La duda se dice.** Lo que no está confirmado sale «Sin confirmar», nunca como abierto ni como cerrado.

## Qué puedes hacer hoy en la web

| Necesito… | Dónde |
|

## Documentación

| Quiero saber… | Documento |
|---|---|
| Cómo se decide si un paso está habilitado | [Regla del estado de los pasos](docs/regla-estado-pasos.md) |
| Qué datos hay, cómo se validan y qué fuentes se leen solas | [Datos y fuentes](docs/datos-y-fuentes.md) |
| Cómo está montado y cómo se trabaja con el código | [Arquitectura](docs/arquitectura.md) |
| Qué se ha decidido y por qué | [Decisiones](docs/decisiones.md) |
| Qué se ha publicado, cuándo y en qué PR | [Registro de avances](docs/registro.md) |
| Qué toca ahora | [Plan de 90 días](docs/plan.md) |
| Cómo editar datos sin programar | [Cómo editar](docs/como-editar.md) |
| Qué se auditó y qué falta | [Auditoría de integridad (25/11/2026)](docs/auditoria-2026-11-25.md) |
| Cómo usar los datos abiertos | [Contrato de la API](docs/ia-dev.md) · [cambios](docs/api-cambios.md) |
| Cómo se prueba | [Pruebas](pruebas/LEEME.md) |
| Marca | [MARCA.md](MARCA.md) |

Informes antiguos, sin vigencia: [`docs/archivo/`](docs/archivo/).

## Cómo trabajamos

1. **Cada mejora es una historia** (issue en GitHub y tarjeta en Trello) y se desarrolla en una rama con su PR.
2. **Nada llega a la web sin pasar las comprobaciones** (datos, esquemas, enlaces, pruebas de navegador) **y sin el «publica» de Ernesto.**
3. **Cada cambio deja rastro:** su decisión en [Decisiones](docs/decisiones.md) si la hay, su fila en el [Registro](docs/registro.md) y, si toca la regla de los pasos, su prueba y su línea en la [bitácora](docs/regla-estado-pasos.md#13-bitácora-de-casos-que-fijaron-la-regla).
4. **La IA investiga y propone; verificar es de Ernesto.** El vigilante publica lo que lee de las webs oficiales con su propio sello, y Ernesto lo revisa después.

