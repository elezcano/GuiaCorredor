/**
 * Guía del Corredor – crea el formulario de solicitudes de empresas y su hoja de cálculo.
 *
 * Cómo usarlo (una sola vez):
 * 1. Abre https://script.google.com con tu cuenta de Google → «Nuevo proyecto».
 * 2. Borra lo que haya, pega este archivo entero y guarda (icono del disquete).
 * 3. Arriba, elige la función «crearFormulario» y pulsa «Ejecutar».
 * 4. Google pedirá permisos (crear formularios y hojas en TU Drive): acepta.
 *    Si sale «Google no ha verificado esta aplicación»: «Configuración avanzada» → «Ir a … (no seguro)».
 *    Es tu propio script; nadie más tiene acceso.
 * 5. Abre «Registro de ejecución» (abajo) y copia el ENLACE PRELLENADO. Pásaselo a Claude.
 *
 * Resultado en tu Drive: el formulario «Solicitudes de empresas – Guía del Corredor» y la hoja
 * «Solicitudes de empresas – respuestas» (privada). Cada solicitud de la web llega como una fila.
 */
function crearFormulario() {
  // [pregunta, clave]. El orden y las claves deben coincidir con la web (scripts/cruces.mjs → CAMPOS_SOLICITUD).
  var preguntas = [
    ['Tipo de solicitud', 'tipo'],
    ['Nombre comercial', 'nombre'],
    ['Razón social', 'razonsocial'],
    ['País de la sede', 'pais'],
    ['Localidad de la sede', 'localidad'],
    ['Tipo de empresa', 'categoria'],
    ['Servicios', 'servicios'],
    ['Puntos de la ruta (cobertura)', 'puntos'],
    ['Cobertura (detalle)', 'cobertura'],
    ['Persona de contacto', 'persona'],
    ['Email', 'email'],
    ['Teléfono / WhatsApp', 'telefono'],
    ['Web', 'web'],
    ['Documentación o referencias', 'referencias'],
    ['Cambio solicitado', 'cambio'],
  ];

  var form = FormApp.create('Solicitudes de empresas – Guía del Corredor');
  form.setDescription('Lo rellena la web de la Guía del Corredor (/anunciate/). Las solicitudes se revisan antes de publicar nada.');
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setShowLinkToRespondAgain(false);

  var items = preguntas.map(function (p) {
    return form.addTextItem().setTitle(p[0]).setRequired(false);
  });

  // Hoja de respuestas privada en tu Drive.
  var hoja = SpreadsheetApp.create('Solicitudes de empresas – respuestas');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, hoja.getId());

  // Enlace prellenado: cada pregunta lleva su clave como respuesta.
  var respuesta = form.createResponse();
  items.forEach(function (item, i) {
    respuesta.withItemResponse(item.createResponse(preguntas[i][1]));
  });
  var enlace = respuesta.toPrefilledUrl();

  Logger.log('ENLACE PRELLENADO (pásaselo a Claude):\n' + enlace);
  Logger.log('Formulario (editar): ' + form.getEditUrl());
  Logger.log('Hoja de respuestas: ' + hoja.getUrl());
}
