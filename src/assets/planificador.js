// HU-116: planificador de ruta. Responde primero a «¿se puede hacer esta ruta hoy con mi carga, y por dónde?»
// y deja el detalle plegado. Funciona entre cualquier par de puntos de la red (ruta principal y ramales),
// en los dos sentidos. La búsqueda queda en la URL (?desde=&hasta=&carga=) y en este dispositivo.
(function () {
  const GC = window.GC;
  const esc = GC.esc;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const form = document.querySelector('.buscador');
  const origen = document.getElementById('origen');
  const destino = document.getElementById('destino');
  const salida = document.getElementById('resultado');
  const max = datos.nodos.length - 1;
  let elegida = null; // id de la opción que se está viendo


  // --- Búsqueda inicial: URL, si no la última guardada, si no la ruta completa ---
  const params = new URLSearchParams(location.search);
  const guardada = GC.leerRuta();
  const entero = (k) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
  };
  origen.value = String(entero('desde') ?? (guardada?.desde <= max ? guardada.desde : null) ?? 0);
  destino.value = String(entero('hasta') ?? (guardada?.hasta <= max ? guardada.hasta : null) ?? datos.tramos.filter((t) => !t.ramal).length);
  // El tipo de carga solo cambia los papeles: se elige dentro de «Papeles para cruzar», no en la búsqueda.
  const cargaValida = (c) => (datos.tiposCarga.some((t) => t.id === c) ? c : null);
  let cargaActual = cargaValida(params.get('carga')) || cargaValida(guardada?.carga) || 'general';
  const carga = () => cargaActual;
  const nombreCarga = () => (datos.tiposCarga.find((c) => c.id === carga())?.nombre || 'carga').toLowerCase();

  // --- Utilidades ---
  const nodo = (id) => datos.nodos.find((n) => n.id === id);
  const nombre = (id) => nodo(id)?.nombre || id;
  const sinParentesis = (s) => String(s || '').replace(/\s*\(.*\)$/, '');
  const anioActual = new Date().toISOString().slice(0, 4);
  const fechaCorta = (iso) =>
    new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(iso.slice(0, 4) !== anioActual ? { year: 'numeric' } : {}), timeZone: 'UTC' }).replace('.', '');
  const fechaDia = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const km = (n) => GC.km(Math.round(n * 10) / 10);
  // HU-133: diagnóstico y veredicto compartidos con la portada (comun.js).
  const DG = GC.diag(datos);
  const { opDe, textoEstado, bloquea, motivoBloqueo, diagnostico, ORDEN } = DG;
  const punto = (op) => datos.operativa[op].icono;
  const enlaceGuia = (g, txt, q = '') => (g ? `<a href="${datos.base}/guia/${g}/${q}">${esc(txt)}</a>` : esc(txt));
  // HU-105: la ficha del paso se abre en el sentido del viaje.
  const qSentido = (t) => {
    const l = datos.ladosPaso?.[t.paso?.id];
    if (!l) return '';
    const sale = nodo(t.de)?.pais;
    return `?sentido=${l[0] === sale ? l.join('-') : [...l].reverse().join('-')}`;
  };
  const tramoNombre = (t) => `${nombre(t.de)} → ${nombre(t.a)}`;
  const TIPO_KM = { fuente: 'con fuente', calculado: 'calculado', osm: 'calculado con OpenStreetMap', estimado: 'estimado en línea recta' };

  // --- Bloques del resultado ---
  // HU-133 (R6): el veredicto en una frase (GC.diag.frase), el porqué en otra y el detalle en «Por qué lo decimos».
  function veredicto(op, dg, ops, dgs) {
    const { titulo, porque } = DG.frase(op, dg, ops, dgs);
    const forma = { verde: 'abierto', ambar: 'restricciones', rojo: 'cerrado' }[dg.nivel];
    const partes = [];
    if (dg.bloqueos.length)
      partes.push(
        `<p><strong>Lo impide:</strong> ${dg.bloqueos.map((t) => `${t.paso ? enlaceGuia(t.paso.guia, sinParentesis(t.paso.nombre), qSentido(t)) : esc(tramoNombre(t))} (${esc(motivoBloqueo(op, t))})`).join(', ')}.</p>`
      );
    if (dg.bloqueos.length && dg.trozos.length)
      partes.push(`<p><strong>Sí funciona hoy:</strong> ${dg.trozos.map((tr) => esc(`${nombre(tr[0].de)} → ${nombre(tr[tr.length - 1].a)}`)).join(' y ')}.</p>`);
    if (dg.dudas.length)
      partes.push(`<ul class="pl-dudas">${dg.dudas.slice(0, 4).map((d) => `<li>${esc(d)}</li>`).join('')}${dg.dudas.length > 4 ? `<li>Y ${dg.dudas.length - 4} más, en «Avisos».</li>` : ''}</ul>`);
    if (dg.sinParte) partes.push(`<p class="pl-nota">${GC.plural(dg.sinParte, 'tramo de carretera', 'tramos de carretera')} sin parte oficial: no sabemos su estado.</p>`);
    if (!partes.length) partes.push('<p>Todos los tramos y pasos de esta opción están abiertos según su fuente, con fecha. Lo tienes tramo a tramo más abajo.</p>');
    return `<section class="pl-veredicto veredicto veredicto-${dg.nivel}" role="status" aria-labelledby="t-veredicto">
      <div class="veredicto-caja"><span class="veredicto-forma">${datos.operativa[forma].icono}</span><div>
        <p class="veredicto-titulo" id="t-veredicto">${esc(titulo)}</p>
        ${porque ? `<p class="veredicto-porque">${esc(porque)}</p>` : ''}
        <details class="veredicto-detalle plegable"><summary>Por qué lo decimos</summary>${partes.join('')}</details>
      </div></div>
    </section>`;
  }

  const distanciaTexto = (d) => {
    if (!d.total) return 'Sin distancia';
    return `${d.estimado || d.sinDato ? '≈ ' : ''}${km(Math.round(d.total))}`;
  };
  const distanciaDesglose = (d) => {
    const t = [];
    if (d.fuente) t.push(`${km(d.fuente)} con fuente`);
    if (d.calculado) t.push(`${km(d.calculado)} calculados con OpenStreetMap`);
    if (d.estimado) t.push(`${km(d.estimado)} estimados en línea recta`);
    if (d.sinDato) t.push(`${GC.plural(d.sinDato, 'tramo', 'tramos')} sin distancia`);
    return t.join(' · ');
  };

  function tarjeta(op, dg, recomendada, n) {
    const pasos = op.tramos.filter((t) => t.paso);
    return `<button type="button" class="pl-opcion" data-op="${op.id}" aria-pressed="${op.id === elegida}" aria-controls="det-${op.id}">
      <span class="pl-opcion-cabeza"><strong>${esc(op.nombre)}</strong>${recomendada && n > 1 ? '<span class="etiqueta">Recomendada</span>' : ''}</span>
      <span class="pl-fronteras">${pasos.length ? pasos.map((t) => `<span class="pl-frontera">${punto(opDe(t))}${esc(sinParentesis(t.paso.nombre).replace(/^Paso (de )?/, ''))}</span>`).join('') : '<span class="pl-frontera">Sin fronteras</span>'}</span>
      <span class="pl-cifras"><span><b>${distanciaTexto(op.distancia)}</b></span><span>${GC.plural(op.problemas.length, 'aviso', 'avisos')}</span><span class="pl-nivel pl-nivel-${dg.nivel}">${{ rojo: 'No se puede hoy', ambar: 'Con dudas', verde: dg.sinParte ? 'Sin problemas conocidos' : 'Se puede' }[dg.nivel]}</span></span>
    </button>`;
  }

  function tramoATramo(op) {
    const filas = op.tramos
      .map((t) => {
        const d = GC.kmTramo(t);
        const avisos = op.incDe(t);
        return `<li class="pl-tramo pl-t-${opDe(t)}">
        ${punto(opDe(t))}
        <div>
          <p class="pl-tramo-nombre">${t.paso ? `Frontera: ${enlaceGuia(t.paso.guia, sinParentesis(t.paso.nombre), qSentido(t))}` : esc(tramoNombre(t))}</p>
          <p class="pl-tramo-datos"><span>${esc(textoEstado(t))}</span>${d ? `<span>${d.tipo === 'estimado' ? '≈ ' : ''}${km(d.km)} <span class="pl-km-tipo">${TIPO_KM[d.tipo]}</span></span>` : '<span class="pl-km-tipo">Sin distancia</span>'}${t.paso ? `<span class="pl-km-tipo">${esc(tramoNombre(t))}</span>` : ''}</p>
          ${avisos.map((i) => `<p class="pl-tramo-aviso"><strong>${esc(i.tipo)}:</strong> <span lang="es" class="txt-es txt-oficial">${esc(i.texto)}</span> <a href="${esc(datos.avisos)}#inc-${esc(i.id)}">Ver aviso</a></p>`).join('')}
          ${cruce(t)}
          ${t.nota ? `<p class="pl-nota" lang="es">${esc(t.nota)}</p>` : ''}
          ${!t.paso && t.guia ? `<p class="pl-nota">${enlaceGuia(t.guia, 'Ficha del tramo')}</p>` : ''}
        </div>
      </li>`;
      })
      .join('');
    return `<ol class="pl-tramos">${filas}</ol>`;
  }

  // Tiempo de cruce reportado por usuarios, en el sentido del viaje (si hay reportes).
  function cruce(t) {
    if (!t.paso) return '';
    const idx = (id) => datos.nodos.findIndex((n) => n.id === id);
    const sentido = idx(t.a) > idx(t.de) ? 'chile' : 'brasil';
    const s = datos.cruces?.porPaso?.[t.paso.id]?.[sentido];
    if (!s?.mediana) return '';
    const tr = datos.cruces.tramos.find((x) => x.id === s.mediana);
    return `<p class="pl-nota">Tiempo de cruce: <strong>${esc(tr.nombre)}</strong> (${GC.plural(s.n, 'reporte', 'reportes')} en ${datos.cruces.dias} días)</p>`;
  }

  const paisesDe = (op) => [...new Set(op.tramos.flatMap((t) => [nodo(t.de)?.pais, nodo(t.a)?.pais]).filter(Boolean))];
  function festivos(op) {
    const ps = new Set(paisesDe(op));
    const hoy = new Date().toISOString().slice(0, 10);
    const limite = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
    return (datos.festivos || []).filter((f) => ps.has(f.pais) && f.fecha >= hoy && f.fecha <= limite);
  }

  const papelesLista = () =>
    datos.documentosCruce
      .filter((d) => !d.cargas || d.cargas.includes(carga()))
      .map((d) => `<li><label><input type="checkbox"><span>${esc(d.nombre)}</span></label></li>`)
      .join('');
  const plegable = (titulo, resumen, cuerpo, abierta = false) =>
    `<details class="plegable"${abierta ? ' open' : ''}><summary><span class="plegable-titulo">${titulo}</span><span class="plegable-resumen">${resumen}</span></summary><div class="plegable-cuerpo">${cuerpo}</div></details>`;

  function detalle(op, dg, visible) {
    const fest = festivos(op);
    const docs = datos.documentosCruce.filter((d) => !d.cargas || d.cargas.includes(carga()));
    const empresas = (datos.empresas || []).filter((e) => e.puntos.some((p) => op.tramos.some((t) => t.de === p || t.a === p)));
    const pasos = op.tramos.filter((t) => t.paso).length;
    return `<div class="pl-detalle" id="det-${op.id}"${visible ? '' : ' hidden'}>
      <div class="plegables">
        ${plegable('Tramo a tramo', `${GC.plural(op.tramos.length, 'tramo', 'tramos')} · ${GC.plural(pasos, 'frontera', 'fronteras')}`, `${tramoATramo(op)}<p class="pl-nota">${esc(distanciaDesglose(op.distancia) || 'Sin distancia')}</p>`)}
        ${plegable(
          'Avisos en la ruta',
          op.problemas.length ? GC.plural(op.problemas.length, 'aviso activo', 'avisos activos') : 'Ninguno registrado',
          op.problemas.length
            ? `<ul class="lista-datos">${op.problemas.map((i) => `<li><strong>${esc(i.tipo)}</strong> · ${esc(i.ubicacion)}: <span lang="es" class="txt-es txt-oficial">${esc(i.texto)}</span> <span class="pl-nota"><span lang="es" class="txt-es">${esc(i.fuente)}</span>${i.publicado ? `, ${esc(fechaCorta(i.publicado))}` : ''}${i.nivel === 'verificado' ? ' · verificado' : ' · sin verificar'}</span> <a href="${esc(datos.avisos)}#inc-${esc(i.id)}">Ver aviso</a></li>`).join('')}</ul>`
            : '<p class="sin-dato">No hay avisos activos en esta ruta.</p>'
        )}
        ${
          pasos
            ? plegable(
                'Papeles para cruzar',
                `<span class="pl-papeles-resumen">${GC.plural(docs.length, 'documento', 'documentos')} para ${esc(nombreCarga())}</span>`,
                `<fieldset class="pl-carga"><legend>¿Qué llevas?</legend><div class="chips">${datos.tiposCarga
                  .map((c) => `<label class="chip chip-radio"><input type="radio" name="carga-${op.id}" value="${esc(c.id)}"${c.id === carga() ? ' checked' : ''}>${esc(c.nombre)}</label>`)
                  .join('')}</div></fieldset>
                 <ul class="pl-papeles">${papelesLista()}</ul>
                 <p class="pl-nota">${esc(datos.avisoDocumentos)}</p>
                 <button type="button" class="btn btn-borde btn-pequeno no-imprimir" data-imprimir>${datos.iconos.imprimir}Imprimir lista</button>`
              )
            : ''
        }
        ${plegable(
          'Festivos',
          fest.length ? `${GC.plural(fest.length, 'festivo', 'festivos')} en las próximas 3 semanas` : 'Ninguno en las próximas 3 semanas',
          `${fest.length ? `<ul class="lista-datos">${fest.map((f) => `<li><strong>${esc(fechaDia(f.fecha))}</strong> · ${esc(datos.paises[f.pais])}: ${esc(f.nombre)}${f.porConfirmar ? ' <span class="pl-nota">sin confirmar</span>' : ''}</li>`).join('')}</ul>` : `<p class="sin-dato">Ningún festivo en ${esc(paisesDe(op).map((p) => datos.paises[p]).join(', '))} en las próximas 3 semanas.</p>`}
           <p class="pl-nota">Un festivo no implica que la aduana cierre. <a href="${esc(datos.calendario)}">Calendario aduanero</a></p>`
        )}
        ${empresas.length ? plegable('Empresas en la ruta', GC.plural(empresas.length, 'empresa', 'empresas'), `<ul class="lista-datos">${empresas.map((e) => `<li><strong>${esc(e.nombre)}</strong> · ${esc(e.cat)}${e.wa ? ` <a href="${esc(e.wa)}" rel="nofollow">WhatsApp</a>` : ''}</li>`).join('')}</ul>`) : ''}
      </div>
    </div>`;
  }

  // --- Pintar ---
  function pintar() {
    const a = Number(origen.value);
    const b = Number(destino.value);
    if (a === b) {
      form.hidden = false;
      salida.innerHTML = '<p class="aviso">El origen y el destino son el mismo punto. Elige otro destino.</p>';
      return;
    }
    GC.guardarRuta(a, b, carga());
    document.body.classList.add('con-barra-accion');
    const ops = GC.opciones(datos, a, b);
    const dgs = Object.fromEntries(ops.map((o) => [o.id, diagnostico(o)]));
    // Recomendada: la que no tiene bloqueos, después la de menos dudas, después la más corta.
    const rec = [...ops].sort((x, y) => ORDEN[dgs[x.id].nivel] - ORDEN[dgs[y.id].nivel] || dgs[x.id].dudas.length - dgs[y.id].dudas.length || x.distancia.total - y.distancia.total)[0];
    if (!ops.some((o) => o.id === elegida)) elegida = rec.id;
    const op = ops.find((o) => o.id === elegida);
    const dg = dgs[op.id];
    const desde = datos.nodos[a].nombre;
    const hasta = datos.nodos[b].nombre;
    const fr = DG.frase(op, dg, ops, dgs);
    const texto = `${desde} → ${hasta}: ${fr.titulo}. ${fr.porque} ${distanciaTexto(op.distancia)}. Confírmalo antes de salir. ${location.href}`;
    const miRuta = GC.leerMiRuta();
    const esMia = miRuta && miRuta.desde === a && miRuta.hasta === b;
    const cotizar = `${datos.base}/cotizar/?desde=${a}&hasta=${b}&carga=${encodeURIComponent(carga())}`;
    const I = datos.iconos;
    const ib = (id, icono, txt, extra = '') => `<button type="button" class="ib" id="${id}" aria-label="${txt}" title="${txt}"${extra}>${icono}</button>`;
    const hoy = new Date().toISOString().slice(0, 10);
    salida.innerHTML = `
      <p class="ruta-pill pl-cabeza"><strong>${esc(desde)} → ${esc(hasta)}</strong>
        <button type="button" class="btn-texto no-imprimir" id="cambiar-busqueda" aria-expanded="${!form.hidden}" aria-controls="buscador-plan">${form.hidden ? 'Cambiar' : 'Ocultar búsqueda'}</button>
        <button type="button" class="btn-guardar no-imprimir" id="guardar-ruta" aria-pressed="${esMia}">${esMia ? datos.iconoGuardada : I.guardar}<span>${esMia ? 'Guardada' : 'Guardar'}</span></button></p>
      ${veredicto(op, dg, ops, dgs)}
      ${
        ops.length > 1
          ? `<div class="pl-opciones" role="group" aria-label="Opciones de ruta">${ops.map((o) => tarjeta(o, dgs[o.id], o === rec, ops.length)).join('')}</div>`
          : `<p class="pl-una">${esc(distanciaTexto(op.distancia))} · ${GC.plural(op.problemas.length, 'aviso', 'avisos')}</p>`
      }
      ${ops.map((o) => detalle(o, dgs[o.id], o.id === elegida)).join('')}
      <div class="acc no-imprimir">
        <a class="btn btn-negocio" href="${cotizar}">Pedir cotización</a>
        ${ib('abrir-informe', I.papeles, 'Generar informe', ' aria-expanded="false" aria-controls="lanzar-informe"')}
        ${ib('copiar', I.enlace, 'Copiar enlace')}
        <a class="ib wa" href="https://wa.me/?text=${encodeURIComponent(texto)}" rel="noopener" aria-label="Compartir por WhatsApp" title="Compartir por WhatsApp">${I.chat}</a>
      </div>
      <form class="pl-informe" id="lanzar-informe" aria-labelledby="t-informe" hidden>
        <p id="t-informe"><strong>Informe para enviar o imprimir</strong><span>Estado, horarios, festivos de ese día, avisos y papeles en una página.</span></p>
        <label class="campo-fecha"><span>Fecha de cruce</span><input type="date" name="fecha" required value="${hoy}" min="${hoy}"></label>
        <input type="hidden" name="op" value="${esc(op.id)}">
        <button class="btn btn-principal" type="submit">Generar informe</button>
      </form>
      <details class="pl-leyenda"><summary>Cómo leer estos datos</summary>
        <p><b>Abierto, con restricciones o no habilitado:</b> estado comprobado a mano en la fuente oficial o en la fuente citada. <b>Sin confirmar:</b> no hay un parte comprobado; mira la ficha antes de salir.</p>
        <p><b>Km con fuente:</b> publicados por una fuente. <b>Calculados con OpenStreetMap:</b> ruta por carretera calculada, no oficial. <b>Estimados en línea recta:</b> por carretera son más.</p>
        <p>La última búsqueda se recuerda en este dispositivo. Con «Guardar ruta» la ves al abrir «Hoy». Nada sale de aquí.</p>
      </details>`;
  }

  // --- Eventos ---
  // Cambiar el tipo de carga solo rehace la lista de papeles (sin cerrar lo que está abierto).
  salida.addEventListener('change', (e) => {
    const r = e.target.closest('.pl-carga input[type="radio"]');
    if (!r) return;
    cargaActual = r.value;
    const url = new URL(location.href);
    url.searchParams.set('carga', carga());
    history.replaceState(null, '', url);
    GC.guardarRuta(Number(origen.value), Number(destino.value), carga());
    const n = datos.documentosCruce.filter((d) => !d.cargas || d.cargas.includes(carga())).length;
    salida.querySelectorAll('.pl-papeles').forEach((ul) => (ul.innerHTML = papelesLista()));
    salida.querySelectorAll('.pl-papeles-resumen').forEach((x) => (x.textContent = `${GC.plural(n, 'documento', 'documentos')} para ${nombreCarga()}`));
    salida.querySelectorAll('.pl-carga input').forEach((x) => (x.checked = x.value === carga()));
  });
  salida.addEventListener('click', (e) => {
    const t = e.target.closest('.pl-opcion');
    if (t) {
      elegida = t.dataset.op;
      salida.querySelectorAll('.pl-opcion').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.op === elegida)));
      salida.querySelectorAll('.pl-detalle').forEach((d) => (d.hidden = d.id !== `det-${elegida}`));
      // El veredicto, el texto para compartir y el informe siguen a la opción elegida.
      pintar();
      return;
    }
    const cambiar = e.target.closest('#cambiar-busqueda');
    if (cambiar) {
      form.hidden = !form.hidden;
      cambiar.setAttribute('aria-expanded', String(!form.hidden));
      cambiar.textContent = form.hidden ? 'Cambiar' : 'Ocultar búsqueda';
      if (!form.hidden) origen.focus();
      return;
    }
    if (e.target.closest('[data-imprimir]')) window.print();
    const inf = e.target.closest('#abrir-informe');
    if (inf) {
      const f = document.getElementById('lanzar-informe');
      f.hidden = !f.hidden;
      inf.setAttribute('aria-expanded', String(!f.hidden));
      return;
    }
    const guardar = e.target.closest('#guardar-ruta');
    if (guardar) {
      // HU-133 (R9): tu ruta queda en este dispositivo y la portada «Hoy» abre con su veredicto. No sale de aquí.
      GC.guardarMiRuta(Number(origen.value), Number(destino.value), carga());
      guardar.innerHTML = `${datos.iconoGuardada}<span>Guardada</span>`;
      guardar.setAttribute('aria-pressed', 'true');
      return;
    }
    const copiar = e.target.closest('#copiar');
    if (copiar) {
      navigator.clipboard?.writeText(location.href).then(
        () => copiar.setAttribute('title', 'Enlace copiado'),
        () => copiar.setAttribute('title', 'No se pudo copiar')
      );
    }
  });
  function actualizar() {
    const url = new URL(location.href);
    url.searchParams.set('desde', origen.value);
    url.searchParams.set('hasta', destino.value);
    url.searchParams.set('carga', carga());
    history.replaceState(null, '', url);
    elegida = null;
    pintar();
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    actualizar();
  });
  form.addEventListener('change', actualizar);
  // Con una ruta ya elegida, la búsqueda se pliega para que el resultado sea lo primero que se ve.
  form.id = form.id || 'buscador-plan';
  form.hidden = true;
  // Informe de viaje (HU-45), con la opción que se está viendo.
  salida.addEventListener('submit', (e) => {
    if (e.target.id !== 'lanzar-informe') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const u = new URL(`${datos.base}/informe/`, location.origin);
    u.searchParams.set('desde', origen.value);
    u.searchParams.set('hasta', destino.value);
    u.searchParams.set('carga', carga());
    u.searchParams.set('fecha', f.get('fecha'));
    u.searchParams.set('op', f.get('op'));
    location.href = u.toString();
  });
  pintar();
})();
