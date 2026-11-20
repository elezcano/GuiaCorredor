// Formularios sin servidor (cotización, camión vacío). Uno solo para todos:
// - con data-accion + data-campos (Google Forms): se envía a su hoja privada;
// - si no, prepara un email a data-email con los mismos datos.
// La URL puede rellenar campos: ?tipo=retorno&desde=…&hasta=…&carga=…
(() => {
  const f = document.querySelector('form.form-app');
  if (!f) return;
  const error = f.querySelector('.form-error');
  const ok = f.querySelector('.form-ok');
  const q = new URLSearchParams(location.search);
  if (q.get('tipo') === 'retorno') f.elements.tipo.value = 'Tengo el camión vacío';
  for (const k of ['desde', 'hasta', 'carga']) if (q.get(k) && f.elements[k]) f.elements[k].value = q.get(k);

  const etiqueta = (el) => el.closest('[data-etiqueta]')?.dataset.etiqueta || el.closest('fieldset')?.querySelector('legend')?.textContent || el.name;
  const valores = () => Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
  const texto = (v) => Object.entries(v).map(([k, x]) => `${etiqueta(f.elements[k][0] || f.elements[k])}: ${x || '—'}`).join('\n');
  const aviso = (el, m) => ((el.textContent = m), (el.hidden = !m));

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mal = [...f.elements].find((el) => el.willValidate && !el.checkValidity());
    const tel = f.elements.telefono?.value.trim();
    if (mal) return (mal.focus(), aviso(error, `Revisa «${etiqueta(mal).replace(' (opcional)', '')}».`));
    if (tel && !/^\+\d[\d\s-]{6,18}$/.test(tel)) return aviso(error, 'Escribe el teléfono con el prefijo de país, por ejemplo +595 21 123 456.');
    aviso(error, '');
    const v = valores();
    const asunto = `[${f.dataset.asunto}] ${v.tipo || ''}: ${v.desde} → ${v.hasta}`;
    const porEmail = () => (location.href = `mailto:${f.dataset.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto(v))}`);
    if (!f.dataset.accion) return porEmail();
    const cuerpo = new URLSearchParams();
    for (const [clave, entry] of Object.entries(JSON.parse(f.dataset.campos))) cuerpo.append(entry, v[clave] || '');
    const boton = f.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      await fetch(f.dataset.accion, { method: 'POST', mode: 'no-cors', body: cuerpo });
      aviso(ok, 'Solicitud enviada. Te contestamos por WhatsApp o email.');
      f.reset();
    } catch {
      aviso(error, 'No se pudo enviar. Te abrimos el email con la solicitud.');
      porEmail();
    } finally {
      boton.disabled = false;
    }
  });
})();
