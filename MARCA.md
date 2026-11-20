# Marca: RadarCorredor by Vialta

Normas para aplicar la marca en la web y en los documentos. La propuesta completa, con lockups y aplicaciones, está en el lienzo «Vialta · RadarCorredor — arquitectura de marca».

## Arquitectura

- **RadarCorredor** es el producto y manda: cabecera, favicon, título de cada página.
- **Vialta** es la marca madre y respalda: pie de la web, informe PDF y documentos comerciales. Nunca en la cabecera de la app ni más grande que el producto.
- Fórmula: «RadarCorredor es un producto de Vialta» (texto) o «RadarCorredor by Vialta» (lockup).
- **Vialta está en validación legal y de dominios.** Se muestra con un solo interruptor: `data/site.json` → `marcaMadre.mostrar`. Con `false` desaparece de toda la web sin tocar código.

## Logotipos

| Archivo | Uso |
|---|---|
| `src/assets/marca/logo-horizontal.svg` | Cabecera (se incrusta en línea; el marino pasa a `currentColor` para el modo oscuro) |
| `src/assets/marca/simbolo.svg` | Avatar, mapa, espacios cuadrados |
| `src/assets/marca/favicon.svg` | Pestaña del navegador |
| `src/assets/marca/icono-app.svg` | Icono de app / acceso directo |

El símbolo de Vialta no se usa por debajo de 24 px: a ese tamaño su «V» se lee como el ✓ de «verificado». En el pie va solo el nombre.

## Color: tres capas que no se mezclan

| Capa | Colores | Regla |
|---|---|---|
| Corporativo | marino `#10243A`, azul `#247BA0`, neutros `#F3F4F6` `#E2E6EA` `#4A5A6B` | Texto, fondos, barra lateral, botones |
| Acento de producto | turquesa `#20C6B7` (`--producto`) | Solo el logotipo y lo nuevo o activo (elemento seleccionado del menú). ≤ 5 % de la superficie. **Nunca un estado.** No sirve para texto sobre blanco (2,1:1) |
| Operativo | abierto `#1F9D55`, con restricciones `#E07A10`, no habilitado `#D9432F`, sin confirmar `#5B646C` con borde discontinuo | Solo para el estado de un dato. Nunca en la marca |

- El negocio («Pedir cotización», fichas destacadas) va en azul (`--accent`, `#1D6A8C`, 6:1 sobre blanco).
- El amarillo ya no existe en la web: era marca, negocio y aviso a la vez.
- Todos los pares de texto cumplen 4,5:1 en claro y en oscuro.

## Tipografía

- **DM Sans** (400/500/600) para toda la interfaz. Se sirve desde la propia web (`@fontsource-variable/dm-sans`, copiada al publicar).
- **DM Mono** solo para datos que se comparan en columna: horarios del tablero y tablas de horarios.
- Si las fuentes no están instaladas, se usa la del sistema; nada se rompe.

## Submarcas

Un producto con mercado propio lleva su nombre + «by Vialta». Un servicio nuevo se llama «Vialta + descriptor» y solo cambia el color del nodo final del símbolo. Intelligence, Connect y Freight son propuestas conceptuales, no aprobadas.
