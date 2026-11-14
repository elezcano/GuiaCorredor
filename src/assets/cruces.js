// Formulario "Contar mi tiempo" en la página de un paso. Envía al formulario de Google configurado.
(function () {
  const panel = document.querySelector('[data-cruce][data-accion]');
  if (!panel) return;
  const paso = panel.dataset.cruce;
  const campos = JSON.parse(panel.dataset.campos);
  const abrir = panel.querySelector('[data-abrir]');
  const form = panel.querySelector('[data-form]');
  const error = panel.querySelector('[data-error]');
  const gracias = panel.querySelector('[data-gracias]');
  const leer = (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const guardar = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };

  // Número al azar por navegador: evita contar dos veces el mismo cruce. No identifica a nadie.
  let dispositivo = leer('guia-corredor:dispositivo');
  if (!dispositivo) {
    dispositivo = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    guardar('guia-corredor:dispositivo', dispositivo);
  }
  const dia = (atras) => {
    const d = new Date();
    d.setDate(d.getDate() - atras);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const mostrarGracias = (texto) => {
    abrir.hidden = true;
    form.hidden = true;
    gracias.textContent = texto;
    gracias.hidden = false;
  };
  if (leer(`guia-corredor:cruce:${paso}:${dia(0)}`)) mostrarGracias('Ya contaste tu cruce de hoy. Gracias.');

  abrir.addEventListener('click', () => {
    abrir.hidden = true;
    form.hidden = false;
    form.querySelector('input').focus();
  });
  panel.querySelector('[data-cancelar]').addEventListener('click', () => {
    form.hidden = true;
    error.hidden = true;
    abrir.hidden = false;
    abrir.focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const fecha = dia(Number(f.get('cuando')));
    const cuerpo = new URLSearchParams({
      [campos.paso]: paso,
      [campos.sentido]: f.get('sentido'),
      [campos.tiempo]: f.get('tiempo'),
      [campos.fecha]: fecha,
      [campos.dispositivo]: dispositivo,
    });
    const boton = form.querySelector('[type="submit"]');
    boton.disabled = true;
    error.hidden = true;
    try {
      // Google no permite leer la respuesta desde otra web (no-cors): si la petición sale, se da por enviada.
      await fetch(panel.dataset.accion, { method: 'POST', mode: 'no-cors', body: cuerpo });
      guardar(`guia-corredor:cruce:${paso}:${fecha}`, '1');
      mostrarGracias('Gracias. Tu tiempo se suma en la próxima actualización, en unas horas.');
      gracias.focus?.();
    } catch {
      error.textContent = 'No se pudo enviar. Revisa tu conexión y vuelve a intentarlo.';
      error.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });
})();
