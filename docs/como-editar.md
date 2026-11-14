# Cómo editar la web (sin programar)

Todo se edita desde GitHub en el navegador: abre el archivo, pulsa el lápiz, cambia y guarda ("Commit changes"). La web se regenera sola.

## Añadir una empresa al directorio

1. Abre `data/directorio.json`.
2. Copia un bloque `{ ... }` entero, pégalo antes del último `]` y separa con una coma.
3. Cambia los datos. El `id` no puede repetirse.
4. Para hacerla destacada (ha pagado): `"destacada": true`.

```json
{
  "id": "transportes-ejemplo-loma-plata",
  "nombre": "Transportes Ejemplo",
  "categoria": "transportista",
  "pais": "PY",
  "ciudad": "Loma Plata",
  "servicios": ["Granos", "Ganado"],
  "descripcion": "Flota de 20 camiones, rutas Chaco – Salta.",
  "destacada": false,
  "puntos": ["carmelo-peralta", "mariscal-estigarribia"],
  "contacto": { "email": "info@ejemplo.com", "whatsapp": "595981000000", "web": "" }
}
```

`puntos` son los lugares de la ruta donde da servicio. Es lo que hace que la empresa aparezca en el planificador, en las páginas de la guía y en la portada. Valores válidos: `campo-grande`, `porto-murtinho`, `carmelo-peralta`, `mariscal-estigarribia`, `pozo-hondo`, `salta-jujuy`, `norte-chile`, `puertos-chile`.

Tipos válidos (`categoria`): `transitario`, `transportista`, `despachante`, `deposito`, `taller`, `seguro`, `servicios`.

## Añadir o actualizar una página de la guía

1. En `content/guia/pasos/` (o `tramos/`, `documentos/`) crea `nombre-del-paso.md`.
2. Copia la cabecera de otra página y cámbiala.
3. Escribe el contenido. Termina siempre con `## Fuentes` y los enlaces.
4. Al revisar una página, actualiza `revisado:` con la fecha del día.
5. Cuando el despachante la haya validado, borra la línea `borrador: true`.

## Añadir una novedad

Lo que hace que la web parezca viva. Abre `data/novedades.json` y añade un bloque al principio:

```json
{
  "fecha": "2026-12-02",
  "tema": "Paso fronterizo",
  "estado": "intermitente",
  "titulo": "Paso de Jama cerrado por nieve",
  "detalle": "Reapertura prevista cuando mejore el tiempo del lado chileno.",
  "guia": "pasos/jama",
  "fuente": { "nombre": "Vialidad Chile", "url": "https://..." }
}
```

- `tema`: Obras, Paso fronterizo, Acuerdos, Aviso…
- `estado` (opcional) colorea el punto de la línea de tiempo: `operativo`, `en-obras`, `intermitente`, `pendiente`.
- `guia` (opcional) la enlaza con su página y la muestra allí en "Últimos cambios".
- **Sin fuente no se publica:** la revisión automática lo rechaza.
- Si el cambio afecta al estado de un tramo, cambia también `data/rutas.json` (siguiente apartado).

La revisión avisa si la última novedad tiene más de 30 días: una portada parada da mala imagen.

## Cobrar la ficha destacada con PayPal

1. En PayPal Business: *Pagar y recibir pagos* → *Suscripciones* → crea el producto "Ficha destacada" con un plan de 45 €/mes.
2. Copia el enlace para compartir del plan.
3. En `data/site.json`, dentro de `planes`, pégalo en `"enlacePago"` del plan `destacada`. El botón "Contratar con PayPal" aparece solo.
4. Cuando entre un pago: pon `"destacada": true` en la empresa y emite la factura como autónomo.

## Cambiar el estado de un tramo o paso

En `data/rutas.json`, cambia `"estado"` del tramo: `operativo`, `en-obras`, `intermitente` o `pendiente`. Cambia también el `estado:` de su página de guía.

## Si algo falla

Si después de guardar sale una cruz roja en GitHub (pestaña *Actions*), ábrela: el mensaje `ERROR` dice qué archivo y qué campo está mal. Lo más habitual es una coma de más o de menos en un JSON.
