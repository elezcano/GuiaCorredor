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
  "contacto": { "email": "info@ejemplo.com", "whatsapp": "595981000000", "web": "" }
}
```

Tipos válidos (`categoria`): `transitario`, `transportista`, `despachante`, `deposito`, `taller`, `seguro`, `servicios`.

## Añadir o actualizar una página de la guía

1. En `content/guia/pasos/` (o `tramos/`, `documentos/`) crea `nombre-del-paso.md`.
2. Copia la cabecera de otra página y cámbiala.
3. Escribe el contenido. Termina siempre con `## Fuentes` y los enlaces.
4. Al revisar una página, actualiza `revisado:` con la fecha del día.
5. Cuando el despachante la haya validado, borra la línea `borrador: true`.

## Cambiar el estado de un tramo o paso

En `data/rutas.json`, cambia `"estado"` del tramo: `operativo`, `en-obras`, `intermitente` o `pendiente`. Cambia también el `estado:` de su página de guía.

## Si algo falla

Si después de guardar sale una cruz roja en GitHub (pestaña *Actions*), ábrela: el mensaje `ERROR` dice qué archivo y qué campo está mal. Lo más habitual es una coma de más o de menos en un JSON.
