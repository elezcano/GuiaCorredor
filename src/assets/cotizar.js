// Pedir cotización en 3 pasos (V6, decisión 37). Sin servidor: envía a la hoja privada de Google Forms
// (data-accion + data-campos) o, si no está configurada o falla, prepara un email con la solicitud.
// Nada viene premarcado salvo «No lo sé» en el paso de frontera. Los errores no borran lo escrito.
// La URL puede rellenar campos: ?tipo=retorno · ?desde=…&hasta=… (índice del punto del corredor o nombre) · &carga=…
(() => {
  const f = document.getElementById('form-cotizar');
  if (!f) return;
  const $ = (s, el = f) => el.querySelector(s);
  const $$ = (s, el = f) => [...el.querySelectorAll(s)];
  const T = Object.fromEntries($$('[data-t]', document.getElementById('cot-textos')).map((el) => [el.dataset.t, el.textContent.trim()]));
  const q = new URLSearchParams(location.search);
  const modo = q.get('tipo') === 'retorno' ? 'retorno' : 'pedir';
  const ok = document.getElementById('cot-ok');
  const error = $('#cot-error');
  const fallo = $('#cot-fallo');
  const NOMBRES = [T.paso1, T.paso2, T.paso3];
  let paso = 1;
  let enviando = false;
  let prefijoTocado = false;
  const vistos = new Set();

  const contar = (path, title) => {
    if (vistos.has(path)) return;
    vistos.add(path);
    // Solo el nombre del paso o del envío: nunca lo que se escribe.
    try { window.goatcounter?.count?.({ path, title, event: true }); } catch (err) {}
  };
  const oculto = (el) => !!el.closest('[hidden]');
  const marcado = (name) => $$(`input[name="${name}"]:checked`).filter((el) => !el.disabled).map((el) => el.value);
  const valor = (name) => { const el = $$(`[name="${name}"]`).find((x) => !x.disabled && x.type !== 'radio' && x.type !== 'checkbox'); return el ? el.value.trim() : ''; };
  const uno = (name) => marcado(name)[0] || '';

  // Modo: pedir cotización o publicar la vuelta con el camión vacío.
  for (const el of $$('[data-modo]', document)) el.hidden = el.dataset.modo !== modo;

  // Variante del paso 2 según el servicio.
  const variante = () => {
    if (modo === 'retorno') return 'retorno';
    const s = uno('servicio');
    return s === 'Despacho de aduana' ? 'aduana' : s === 'Almacenamiento' ? 'almacen' : s === 'Otro servicio' ? 'otro' : 'carga';
  };
  const aplicarVariante = () => {
    const v = variante();
    for (const panel of $$('[data-variante]')) {
      const activo = panel.dataset.variante === v;
      panel.hidden = !activo;
      for (const el of $$('input, select, textarea', panel)) el.disabled = !activo;
    }
    aplicarPeso();
  };
  const aplicarPeso = () => {
    const nose = $$('input[name="peso_nose"]').find((x) => !x.disabled);
    const peso = $$('input[name="peso"]').find((x) => !x.disabled);
    if (nose && peso) { peso.required = !nose.checked; peso.disabled = nose.checked; if (nose.checked) peso.value = ''; }
  };
  const aplicarFecha = () => {
    const campo = $('#cot-fecha-campo');
    campo.hidden = uno('cuando') !== 'Fecha concreta';
    $('#cot-fecha').required = !campo.hidden;
  };
  const PREFIJO = { Paraguay: '+595', Argentina: '+54', Chile: '+56', Brasil: '+55' };
  const aplicarPrefijo = () => {
    const p = PREFIJO[uno('origen_pais')];
    if (p && !prefijoTocado) f.elements.prefijo.value = p;
  };

  // Validación de un paso: campos obligatorios visibles y grupos de opciones sin elegir.
  const limpiar = () => { for (const el of $$('[aria-invalid="true"], .cot-mal')) { el.removeAttribute('aria-invalid'); el.classList.remove('cot-mal'); } error.hidden = true; };
  const etiquetaDe = (el) => {
    const g = el.closest('.cot-grupo');
    const t = g?.querySelector(':scope > legend, :scope > .cot-lbl')?.firstChild?.textContent || el.getAttribute('aria-label') || el.name;
    return t.trim();
  };
  const validar = (n) => {
    limpiar();
    const caja = $(`.cot-paso[data-paso="${n}"]`);
    const faltan = [];
    let primero = null;
    for (const el of $$('input[required], textarea[required], select[required]', caja)) {
      if (el.disabled || oculto(el) || el.value.trim()) continue;
      el.setAttribute('aria-invalid', 'true');
      faltan.push(etiquetaDe(el));
      primero ||= el;
    }
    for (const g of $$('fieldset[data-clave]', caja)) {
      if (oculto(g)) continue;
      const opciones = $$('input[type="radio"]', g).filter((x) => !x.disabled);
      if (!opciones.length || opciones.some((x) => x.checked)) continue;
      g.classList.add('cot-mal');
      const nombre = g.querySelector(':scope > legend')?.firstChild?.textContent?.trim() || g.closest('.cot-lugar')?.querySelector('h3')?.textContent || '';
      faltan.push(g.dataset.clave.endsWith('_pais') ? `${g.closest('.cot-lugar').querySelector('h3').textContent}: país` : nombre);
      primero ||= opciones[0];
    }
    if (n === 3) {
      const num = f.elements.numero;
      if (num.value.trim() && num.value.replace(/\D/g, '').length < 6) { num.setAttribute('aria-invalid', 'true'); primero ||= num; mostrarError(T.tel); }
      const mail = f.elements.email;
      if (mail.value.trim() && !mail.checkValidity()) { mail.setAttribute('aria-invalid', 'true'); primero ||= mail; mostrarError(T.mail); }
    }
    if (faltan.length) mostrarError(`${T.falta}: ${[...new Set(faltan)].join(', ')}.`);
    if (primero) { primero.focus(); return false; }
    return true;
  };
  const mostrarError = (m) => { error.textContent = m; error.hidden = false; };

  // Navegación entre pasos.
  const mostrar = (n, mover = false) => {
    paso = n;
    for (const el of $$('.cot-paso[data-paso]')) el.hidden = Number(el.dataset.paso) !== n;
    $$('.cot-barra li').forEach((li, i) => {
      if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('hecho', i + 1 < n);
    });
    const txt = $('#cot-paso-txt');
    txt.textContent = `${T.paso} ${n} ${T.de} 3 · ${NOMBRES[n - 1]}`;
    $('#cot-atras').hidden = n === 1;
    $('#cot-seguir').hidden = n === 3;
    $('#cot-enviar').hidden = n !== 3;
    if (n === 2) $('#cot-contexto').textContent = lineaRuta();
    if (n === 3) pintarResumen();
    if (n > 1) contar(`cotizar-paso-${n}`, `Cotizar: paso ${n}`);
    if (mover) { f.scrollIntoView({ block: 'start' }); txt.setAttribute('tabindex', '-1'); txt.focus({ preventScroll: true }); }
  };
  $('#cot-seguir').addEventListener('click', () => { if (validar(paso)) mostrar(paso + 1, true); });
  $('#cot-atras').addEventListener('click', () => { limpiar(); mostrar(paso - 1, true); });

  // Resumen: lo que se ha elegido, en dos líneas, con «Cambiar».
  const PAIS_CORTO = { Brasil: 'BR', Paraguay: 'PY', Argentina: 'AR', Chile: 'CL' };
  const lugar = (ciudad, pais) => (ciudad ? `${ciudad}${PAIS_CORTO[pais] ? ` (${PAIS_CORTO[pais]})` : pais && pais !== 'Otro' ? ` (${pais})` : ''}` : '');
  const servicio = () => (modo === 'retorno' ? T.retorno : uno('servicio'));
  const cuando = () => (uno('cuando') === 'Fecha concreta' && valor('fecha') ? valor('fecha') : uno('cuando'));
  const lineaRuta = () => {
    const pasoF = uno('paso');
    return [servicio(), [lugar(valor('desde'), uno('origen_pais')), lugar(valor('hasta'), uno('destino_pais'))].filter(Boolean).join(' → '), pasoF === 'No lo sé' ? T.paso_no : pasoF, cuando().toLowerCase()].filter(Boolean).join(' · ');
  };
  const lineaDetalle = () => {
    const v = valores();
    return [v.mercancia, v.carga, v.peso, v.viajes, v.equipo, v.especial].filter(Boolean).join(' · ');
  };
  const pintarResumen = () => {
    const dl = $('#cot-resumen');
    dl.replaceChildren();
    for (const [titulo, texto, irA] of [[T.servicioRuta, lineaRuta(), 1], [T.detalle, lineaDetalle(), 2]]) {
      const div = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = titulo;
      const dd = document.createElement('dd');
      const span = document.createElement('span'); span.textContent = texto || '—';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-texto'; b.textContent = T.cambiar;
      b.addEventListener('click', () => mostrar(irA, true));
      dd.append(span, b);
      div.append(dt, dd);
      dl.append(div);
    }
  };
  const pintarLado = () => {
    const dd = $$('#cot-lado dd', document);
    if (dd.length < 3) return;
    dd[0].textContent = servicio() || '—';
    dd[1].textContent = [lugar(valor('desde'), uno('origen_pais')), lugar(valor('hasta'), uno('destino_pais'))].filter(Boolean).join(' → ') || '—';
    dd[2].textContent = cuando() || '—';
  };

  // Lo que se envía: las 22 claves del formulario de Google (CAMPOS_COTIZACION). Aduana y almacén guardan su detalle
  // en «Algo especial» y «Peso o volumen» para no mezclar columnas.
  const valores = () => {
    const v = variante();
    const notas = valor('especial');
    const junta = (pares) => pares.filter(([, x]) => x).map(([k, x]) => (k ? `${k}: ${x}` : x)).join(' · ');
    const base = {
      tipo: modo === 'retorno' ? 'Tengo el camión vacío' : 'Pido cotización',
      servicio: servicio(),
      origen_pais: uno('origen_pais'),
      desde: valor('desde'),
      destino_pais: uno('destino_pais'),
      hasta: valor('hasta'),
      paso: uno('paso'),
      cuando: uno('cuando'),
      fecha: uno('cuando') === 'Fecha concreta' ? valor('fecha') : '',
      mercancia: '', carga: '', peso: '', viajes: '', equipo: '', especial: '',
      nombre: valor('nombre'),
      empresa: valor('empresa'),
      telefono: `${f.elements.prefijo.value} ${valor('numero')}`.trim(),
      email: valor('email'),
      perfil: uno('perfil'),
      compartir: f.elements.compartir.checked ? 'Sí' : 'No',
    };
    if (v === 'carga') {
      const nose = $$('input[name="peso_nose"]').find((x) => !x.disabled)?.checked;
      Object.assign(base, { mercancia: valor('mercancia'), carga: uno('carga'), peso: [nose ? T.nose : valor('peso'), valor('volumen')].filter(Boolean).join(' · '), viajes: uno('viajes'), equipo: uno('equipo'), especial: notas });
    } else if (v === 'aduana') {
      Object.assign(base, { mercancia: valor('mercancia'), especial: junta([['Operación', uno('operacion')], ['Documentos', marcado('documentos').join(', ')], ['Transporte', uno('con_transporte')], ['', notas]]) });
    } else if (v === 'almacen') {
      Object.assign(base, { mercancia: valor('mercancia'), peso: [valor('cantidad'), valor('cantidad') && f.elements.unidad.value].filter(Boolean).join(' '), especial: junta([['Tiempo', uno('tiempo')], ['Condiciones', marcado('condiciones').join(', ')], ['', notas]]) });
    } else if (v === 'retorno') {
      Object.assign(base, { equipo: uno('equipo'), carga: uno('carga'), especial: notas });
    } else {
      base.especial = notas;
    }
    return base;
  };
  const nuevoId = () => {
    const d = new Date();
    const fecha = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const azar = crypto.getRandomValues(new Uint8Array(3));
    return `RC-${fecha}-${[...azar].map((n) => A[n % A.length]).join('')}`;
  };
  const textoCorreo = (v) => [`${T.servicioRuta}: ${lineaRuta()}`, `${T.detalle}: ${lineaDetalle()}`, `${v.nombre} · ${v.empresa} · ${v.telefono}${v.email ? ` · ${v.email}` : ''}`, `Nº ${v.id}`].join('\n');
  const enlaceCorreo = (v) => `mailto:${f.dataset.email}?subject=${encodeURIComponent(`[${f.dataset.asunto}] ${v.id} · ${servicio()}: ${v.desde} → ${v.hasta}`)}&body=${encodeURIComponent(textoCorreo(v))}`;

  // Envío: un solo intento a la vez; si falla, los datos siguen y se ofrece el email.
  let id = null;
  const botones = () => $$('button[type="submit"]');
  const terminar = (v) => {
    contar('envio-cotizacion', 'Envío: Cotización');
    f.hidden = true;
    document.getElementById('cot-id').textContent = v.id;
    ok.hidden = false;
    ok.focus();
    document.getElementById('cot-copiar').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(textoCorreo(v)); e.currentTarget.textContent = T.copiado; } catch (err) {}
    });
  };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando || paso !== 3 || !validar(3)) return;
    id ||= nuevoId();
    const v = { ...valores(), id };
    fallo.hidden = true;
    if (!f.dataset.accion) { location.href = enlaceCorreo(v); terminar(v); return; }
    enviando = true;
    const textos = botones().map((b) => [b, b.textContent]);
    for (const [b] of textos) { b.disabled = true; b.textContent = T.enviando; }
    const cuerpo = new URLSearchParams();
    for (const [clave, entry] of Object.entries(JSON.parse(f.dataset.campos))) cuerpo.append(entry, v[clave] || '');
    try {
      await fetch(f.dataset.accion, { method: 'POST', mode: 'no-cors', body: cuerpo });
      terminar(v);
    } catch (err) {
      $('#cot-por-email').href = enlaceCorreo(v);
      fallo.hidden = false;
    } finally {
      enviando = false;
      for (const [b, t] of textos) { b.disabled = false; b.textContent = t; }
    }
  });

  // Cambios: variante, fecha, prefijo, resumen lateral y limpieza del error en el campo tocado.
  f.addEventListener('change', (e) => {
    contar('cotizar-inicio', 'Cotizar: inicio');
    if (e.target.name === 'servicio') aplicarVariante();
    if (e.target.name === 'peso_nose') aplicarPeso();
    if (e.target.name === 'cuando') aplicarFecha();
    if (e.target.name === 'origen_pais') aplicarPrefijo();
    if (e.target.name === 'prefijo') prefijoTocado = true;
    e.target.removeAttribute('aria-invalid');
    e.target.closest('.cot-mal')?.classList.remove('cot-mal');
    pintarLado();
  });
  f.addEventListener('input', (e) => { e.target.removeAttribute('aria-invalid'); pintarLado(); });

  // Prellenado desde el planificador o un enlace: ?desde=0&hasta=8&carga=Granel
  const nodos = JSON.parse(f.dataset.nodos || '[]');
  const ponLugar = (lado, campo, x) => {
    if (!x) return;
    const n = /^\d+$/.test(x) ? nodos[Number(x)] : nodos.find(([nombre]) => nombre === x) || [x, ''];
    if (!n) return;
    f.elements[campo].value = n[0];
    const chip = $$(`input[name="${lado}_pais"]`).find((r) => r.value === n[1]);
    if (chip) chip.checked = true;
  };
  ponLugar('origen', 'desde', q.get('desde'));
  ponLugar('destino', 'hasta', q.get('hasta'));
  if ((q.get('desde') || q.get('hasta') || q.get('carga')) && modo === 'pedir') {
    const t = $$('input[name="servicio"]').find((r) => r.value === 'Transporte de carga');
    if (t) t.checked = true;
  }
  aplicarVariante();
  if (q.get('carga')) { const c = $$('input[name="carga"]').find((r) => !r.disabled && r.value === q.get('carga')); if (c) c.checked = true; }
  aplicarFecha();
  aplicarPrefijo();
  pintarLado();
  mostrar(1);
})();
