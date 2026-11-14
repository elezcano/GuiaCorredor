// Formulario de solicitud de empresa (alta, corrección, retirada). Sin servidor:
// compone un email al contacto del proyecto. La solicitud queda pendiente de revisión.
(() => {
  const f = document.getElementById('solicitud');
  if (!f) return;
  const error = f.querySelector('.sol-error');
  const tipo = () => f.elements.tipo.value;
  const TITULO = { alta: 'Alta', correccion: 'Corrección', retirada: 'Retirada' };
  const ETIQ = {
    nombre: 'Nombre comercial', razonSocial: 'Razón social', pais: 'País de la sede', localidad: 'Localidad de la sede',
    categoria: 'Tipo de empresa', servicios: 'Servicios', puntos: 'Cobertura (puntos de la ruta)', cobertura: 'Cobertura (detalle)',
    persona: 'Persona de contacto', email: 'Email', telefono: 'Teléfono / WhatsApp', web: 'Web', referencias: 'Documentación o referencias', cambio: 'Cambio solicitado',
  };
  // Campos visibles según el tipo de solicitud.
  const visibles = () => {
    f.querySelectorAll('[data-solo]').forEach((el) => {
      const ver = el.dataset.solo.split(' ').includes(tipo());
      el.hidden = !ver;
      el.querySelectorAll('input,select,textarea').forEach((i) => (i.disabled = !ver));
    });
    f.elements.cambio.required = tipo() !== 'alta';
  };
  f.addEventListener('change', (e) => e.target.name === 'tipo' && visibles());
  visibles();

  const texto = () => {
    const d = new FormData(f);
    const lineas = [`Tipo de solicitud: ${TITULO[tipo()]}`, `Fecha: ${new Date().toISOString().slice(0, 10)}`, ''];
    for (const k of Object.keys(ETIQ)) {
      const el = f.elements[k];
      if (!el || (el.disabled ?? el[0]?.disabled)) continue;
      const v = k === 'puntos' ? d.getAll('puntos').map((id) => f.querySelector(`input[name=puntos][value="${id}"]`).parentNode.textContent.trim()).join(', ') : el.tagName === 'SELECT' ? (el.value ? el.selectedOptions[0].text : '') : (d.get(k) || '').trim();
      lineas.push(`${ETIQ[k]}: ${v || '—'}`);
    }
    lineas.push('', 'Estado: pendiente de revisión. Los datos son declaración de la empresa hasta que se verifiquen.');
    return lineas.join('\n');
  };
  const valida = () => {
    const tel = f.elements.telefono.value.trim();
    if (tel && !/^\+\d[\d\s-]{6,18}$/.test(tel)) return 'Escribe el teléfono con el prefijo de país, por ejemplo +595 21 123 456.';
    const mal = [...f.elements].find((el) => !el.disabled && el.willValidate && !el.checkValidity());
    if (mal) {
      mal.focus();
      return mal.type === 'checkbox' ? 'Marca la casilla de revisión para continuar.' : `Revisa el campo «${mal.closest('label,fieldset')?.querySelector('span,legend')?.textContent.replace(' *', '') || mal.name}».`;
    }
    return '';
  };
  const mostrar = (m) => {
    error.textContent = m;
    error.hidden = !m;
  };
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const m = valida();
    mostrar(m);
    if (m) return;
    const asunto = `[Solicitud de empresa] ${TITULO[tipo()]}: ${f.elements.nombre.value.trim()}`;
    location.href = `mailto:${f.dataset.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto())}`;
  });
  f.querySelector('[data-copiar]').addEventListener('click', async (e) => {
    const m = valida();
    mostrar(m);
    if (m) return;
    try {
      await navigator.clipboard.writeText(texto());
      e.target.textContent = 'Solicitud copiada';
    } catch {
      mostrar('No se pudo copiar. Selecciona el texto del email manualmente.');
    }
  });
})();
