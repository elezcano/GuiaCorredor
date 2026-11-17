// Informe de viaje (HU-45): ruta + fecha de cruce → situación operativa para cotizar, avisar o enviar.
// Se genera en el navegador con los mismos datos y el mismo semáforo que el planificador.
// Todo va en la URL (?desde=&hasta=&carga=&fecha=&op=&gen=&h=): no se guarda nada del usuario.
(function () {
  const GC = window.GC;
  const esc = GC.esc;
  const datos = JSON.parse(document.getElementById('datos-rutas').textContent);
  const salida = document.getElementById('informe');
  const params = new URLSearchParams(location.search);
  const enResumen = params.get('formato') === 'resumen';
  const raiz = document.documentElement;
  raiz.classList.toggle('modo-resumen', enResumen);
  const max = datos.nodos.length - 1;
  const entero = (k, def) => {
    const v = Number(params.get(k));
    return params.has(k) && Number.isInteger(v) && v >= 0 && v <= max ? v : def;
  };
  const hoyISO = new Date().toISOString().slice(0, 10);
  const a = entero('desde', 0);
  const b = entero('hasta', max);
  const carga = datos.tiposCarga.find((c) => c.id === params.get('carga')) || datos.tiposCarga[0];
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(params.get('fecha') || '') ? params.get('fecha') : hoyISO;
  const gen = params.get('gen'); // fecha y hora de generación (ISO)
  const hEnlace = params.get('h'); // huella de los estados al generar

  const ICONO = (d) => `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const I_CHAT = ICONO('M4 20l1.5-4.5A8 8 0 1 1 8.5 19z');
  const I_ENLACE = ICONO('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1');
  const I_PDF = ICONO('M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z');

  const nodo = (id) => datos.nodos.find((n) => n.id === id);
  const fechaLarga = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fechaCorta = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('.', '');
  const dias = (iso) => Math.round((Date.parse(hoyISO) - Date.parse(iso)) / 864e5);
  const hace = (iso) => {
    const d = dias(iso);
    if (!Number.isFinite(d)) return '';
    if (d <= 0) return 'hoy';
    if (d === 1) return 'ayer';
    if (d < 31) return `hace ${d} días`;
    const m = Math.round(d / 30.4);
    return m < 12 ? `hace ${m === 1 ? 'un mes' : `${m} meses`}` : 'hace más de un año';
  };
  const fuente = (f) => (f ? (f.url ? `<a href="${esc(f.url)}" rel="noopener">${esc(f.nombre)}</a>` : esc(f.nombre)) : 'sin fuente');
  const PAISES = datos.paises;

  // Semáforo (mismo criterio que scripts/lib.mjs → operativaDe)
  const operativaDe = (valor, tipo = 'paso') =>
    valor === 'operativo' ? 'abierto' : ['restricciones', 'intermitente', 'cierre-programado'].includes(valor) ? 'restricciones' : valor === 'cerrado' ? 'cerrado' : valor === 'en-obras' ? (tipo === 'paso' ? 'cerrado' : 'restricciones') : 'sin-confirmar';
  const opDe = (t) => (t.vista?.confirmado ? t.vista.op || operativaDe(t.vista.valor, t.paso ? 'paso' : 'tramo') : 'sin-confirmar');
  const chip = (op, valor) => {
    const o = datos.operativa[op];
    const det = valor && datos.estados[valor] && !['pendiente', 'operativo', 'restricciones'].includes(valor) && datos.estados[valor] !== o.texto ? ` · ${esc(datos.estados[valor])}` : '';
    return `<span class="estado op-${op}">${o.icono}<span class="estado-texto">${esc(o.texto)}</span>${det ? `<span class="estado-detalle">${det}</span>` : ''}</span>`;
  };
  const textoOp = (t) => {
    const op = opDe(t);
    const det = t.vista?.confirmado && datos.estados[t.vista.valor] && !['operativo', 'restricciones'].includes(t.vista.valor) && datos.estados[t.vista.valor] !== datos.operativa[op].texto ? ` (${datos.estados[t.vista.valor].toLowerCase()})` : '';
    return datos.operativa[op].texto + det;
  };
  const vistaTexto = (v) => {
    if (v?.confirmado) return `Verificado el ${fechaCorta(v.verificado)}`;
    if (!v?.ultimo || v.ultimo === 'pendiente') return 'Sin estado publicado';
    const viejo = dias(v.publicado) > 30;
    return `Último dato: ${esc((datos.estados[v.ultimo] || v.ultimo).toLowerCase())}, ${v.publicado ? `${fechaCorta(v.publicado)} <span class="edad${viejo ? ' edad-vieja' : ''}">(${hace(v.publicado)})</span>` : 'sin fecha'}`;
  };

  if (a === b) {
    salida.innerHTML = `<p class="aviso">El origen y el destino son el mismo punto. <a href="${datos.base}/planificador/">Vuelve al planificador</a>.</p>`;
    return;
  }
  const ops = GC.opciones(datos, a, b);
  const op = ops.find((o) => o.id === params.get('op')) || ops.find((o) => o.recomendada);
  const otra = ops.find((o) => o !== op);
  const paises = [...new Set(op.tramos.flatMap((t) => [nodo(t.de).pais, nodo(t.a).pais]))];
  const pasos = op.tramos.filter((t) => t.paso);

  // Huella de la situación: si cambia algún estado, aviso o verificación, el enlace antiguo lo avisa.
  const huella = (() => {
    const txt = op.tramos.map((t) => [t.id, t.paso?.id, t.vista?.valor, t.vista?.ultimo, t.vista?.confirmado, t.vista?.verificado, t.vista?.publicado].join('|')).join(';') + op.problemas.map((i) => i.id).join(',');
    let h = 5381;
    for (const c of txt) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
    return h.toString(36);
  })();

  // Festivos: el día del cruce (destacado) y los dos días anteriores y posteriores.
  const desplaza = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10);
  const festivosEn = (d) => (datos.festivosTodos || []).filter((f) => paises.includes(f.pais) && f.fecha === d);
  const festivosDia = festivosEn(fecha);
  const festivosCerca = [-2, -1, 1, 2].flatMap((n) => festivosEn(desplaza(fecha, n)));
  const especialesDia = (id) => (datos.pasosInfo[id]?.especiales || []).filter((h) => h.desde <= fecha && fecha <= h.hasta);

  // Alertas principales (escenarios 2 y 3)
  const alertas = [];
  pasos
    .filter((t) => opDe(t) === 'cerrado')
    .forEach((t) => {
      const alt = otra && !otra.tramos.some((x) => x.paso?.id === t.paso.id) ? otra : null;
      alertas.push(
        `<li class="alerta-fila op-cerrado">${datos.operativa.cerrado.icono}<span><strong>${esc(t.paso.nombre)}: no habilitado.</strong> ${
          alt ? `Alternativa: <a href="${urlCon({ op: alt.id })}">${esc(alt.nombre.toLowerCase())}</a>.` : 'No hay alternativa registrada en el corredor para este cruce.'
        }</span></li>`
      );
    });
  festivosDia.forEach((f) => {
    const afectados = pasos.filter((t) => [nodo(t.de).pais, nodo(t.a).pais].includes(f.pais));
    const especial = afectados.some((t) => especialesDia(t.paso.id).length);
    alertas.push(
      `<li class="alerta-fila op-restricciones">${datos.operativa.restricciones.icono}<span><strong>${esc(fechaCorta(f.fecha))}: ${esc(f.nombre)} en ${esc(PAISES[f.pais])}${f.verificado ? '' : ' (por confirmar)'}.</strong> Afecta a ${esc(
        afectados.map((t) => t.paso.nombre).join(', ') || 'la ruta'
      )}. ${especial ? 'Hay horario especial publicado: míralo abajo.' : 'Ningún organismo ha publicado horario especial para ese día.'}</span></li>`
    );
  });
  pasos
    .filter((t) => opDe(t) === 'sin-confirmar')
    .forEach((t) =>
      alertas.push(
        `<li class="alerta-fila op-sin-confirmar">${datos.operativa['sin-confirmar'].icono}<span><strong>${esc(t.paso.nombre)}: sin confirmar.</strong> ${
          t.vista?.ultimo && t.vista.ultimo !== 'pendiente'
            ? vistaTexto(t.vista)
            : (() => {
                const e = datos.pasosInfo[t.paso.id]?.estado;
                return e?.publicado ? `Último parte (${fechaCorta(e.publicado)}, <span class="edad${dias(e.publicado) > 30 ? ' edad-vieja' : ''}">${hace(e.publicado)}</span>): ${esc(e.texto)}` : 'Sin estado publicado';
              })()
        }. Confírmalo antes de salir.</span></li>`
      )
    );

  function urlCon(cambios = {}) {
    const u = new URL(location.href);
    u.searchParams.set('desde', a);
    u.searchParams.set('hasta', b);
    u.searchParams.set('carga', carga.id);
    u.searchParams.set('fecha', fecha);
    u.searchParams.set('op', op.id);
    for (const [k, v] of Object.entries(cambios)) u.searchParams.set(k, v);
    return u.toString();
  }
  const genAhora = gen || new Date().toISOString();
  const enlaceCompartir = urlCon({ gen: genAhora, h: huella });

  const cambio = hEnlace && hEnlace !== huella;
  const fechaGen = new Date(genAhora);
  const genTexto = fechaGen.toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Distancias (regla 3: nunca se suman como oficiales)
  const nombreT = (t) => `${nodo(t.de).nombre} – ${nodo(t.a).nombre}`;
  const conFuente = op.tramos.filter((t) => typeof t.km === 'number');

  // Papeles
  const docs = datos.documentosCruce.filter((d) => !d.cargas || d.cargas.includes(carga.id));

  // Fuentes citadas
  const fuentes = new Map();
  const anotar = (f) => f?.url && fuentes.set(f.url, f);
  op.tramos.forEach((t) => anotar(t.vista?.fuente));
  pasos.forEach((t) => {
    const p = datos.pasosInfo[t.paso.id];
    anotar(p?.estado.fuente);
    (p?.horarios || []).forEach((h) => anotar(h.fuente));
    (p?.partes || []).forEach((h) => anotar(h.fuente));
  });
  op.problemas.forEach((i) => anotar(datos.incidenciasInfo[i.id]?.fuente));
  festivosDia.forEach((f) => anotar(f.fuente));

  // Resumen para WhatsApp (escenario 5: menos de 600 caracteres)
  const resumenWA = (() => {
    const lineas = [
      `Informe de viaje · ${datos.nodos[a].nombre} → ${datos.nodos[b].nombre}`,
      `Cruce: ${fechaCorta(fecha)} · ${carga.nombre}`,
      ...pasos.map((t) => {
        const ult = datos.pasosInfo[t.paso.id]?.partes?.[0];
        return `• ${t.paso.nombre.replace(/\s*\(.*\)$/, '')}: ${textoOp(t)}${t.vista?.confirmado ? ` (verif. ${fechaCorta(t.vista.verificado)})` : ''}${ult ? ` · parte ${fechaCorta(ult.publicado)}${ult.hora ? ' ' + ult.hora : ''}` : ''}`;
      }),
      ...festivosDia.map((f) => `• Festivo ${PAISES[f.pais]}: ${f.nombre}`),
      op.problemas.length ? `• ${GC.plural(op.problemas.length, 'aviso activo', 'avisos activos')}` : '',
      'Confirmar antes de salir.',
    ].filter(Boolean);
    let t = lineas.join('\n');
    const pie = `\n${enlaceCompartir}`;
    if (t.length + pie.length > 600) t = t.slice(0, 600 - pie.length - 1) + '…';
    return t + pie;
  })();

  const filaTramo = (t) => {
    const op_ = opDe(t);
    const esPaso = !!t.paso;
    return `<tr class="tramo-op-${op_}">
      <th scope="row" data-l="Tramo">${esc(nombreT(t))}${esPaso ? `<span class="inf-paso">Frontera: ${esc(t.paso.nombre)}</span>` : ''}</th>
      <td data-l="Estado">${chip(op_, t.vista?.confirmado ? t.vista.valor : null)}<span class="estado-fecha">${vistaTexto(t.vista)}</span></td>
      <td data-l="Fuente">${t.vista?.fuente ? fuente(t.vista.fuente) : '<span class="sin-dato">Sin fuente</span>'}</td>
    </tr>`;
  };

  // HU-73: partes por país con antigüedad y aviso a partir del umbral.
  const horasDesde = (ts) => (Date.now() - new Date(ts).getTime()) / 36e5;
  const edadParte = (h) => (h < 1 ? 'hace menos de 1 h' : h < 48 ? `hace ${Math.floor(h)} h` : `hace ${Math.floor(h / 24)} días`);
  // HU-97: fiabilidad en los últimos 30 y 90 días.
  const fiabTexto = (f) =>
    [f.cerrado && `${f.cerrado} no habilitado`, f.soloCarga && `${f.soloCarga} sin paso para carga`, f.restricciones && `${f.restricciones} con restricciones`, f.abierto && `${f.abierto} habilitado`, f.sinDatos && `${f.sinDatos} sin datos`]
      .filter(Boolean)
      .join(' · ');
  const fiabPaso = (p) =>
    p.fiabilidad ? `<p class="inf-fiab"><strong>Fiabilidad:</strong> últimos 30 días: ${fiabTexto(p.fiabilidad.d30)}; últimos 90 días: ${fiabTexto(p.fiabilidad.d90)}.</p>` : '';
  const partesPaso = (p) =>
    p.partes || p.lados
      ? `<h4>Qué informa cada país</h4><ul class="inf-partes">${(p.lados || [])
          .map((k) => {
            const del = (p.partes || []).filter((x) => x.lado === k);
            if (!del.length) return `<li><strong>${esc(PAISES[k])}:</strong> <span class="sin-dato">sin parte cargado.</span></li>`;
            return del
              .map((x) => {
                const h = horasDesde(x.ts);
                const viejo = h >= (datos.umbralPartesH || 48);
                return `<li${viejo ? ' class="parte-vieja"' : ''}><strong>${esc(PAISES[k])} · ${esc(x.emisor)}</strong> (${esc(fechaCorta(x.publicado))}${x.hora ? `, ${x.hora} h` : ''}, ${edadParte(Math.max(h, 0))}): ${esc(x.texto)} <span class="texto-suave">— ${x.verificado ? `verificado el ${fechaCorta(x.verificado)}` : 'sin verificar'}, ${fuente(x.fuente)}</span>${
                  viejo ? `<br><strong class="parte-aviso">Este parte tiene ${h >= 48 ? Math.floor(h / 24) + ' días' : Math.floor(h) + ' h'}: confírmalo antes de salir.</strong>` : ''
                }</li>`;
              })
              .join('');
          })
          .join('')}</ul>`
      : '';
  const horariosPaso = (t) => {
    const p = datos.pasosInfo[t.paso.id];
    if (!p) return '';
    const esp = especialesDia(t.paso.id);
    return `<div class="inf-bloque-paso">
      <h3>${esc(p.nombre)}</h3>
      ${fiabPaso(p)}
      ${partesPaso(p)}
      <h4>Horarios</h4>
      ${
        p.horarios.length
          ? `<ul>${p.horarios.map((h) => `<li><strong>${esc(h.lado || 'General')}${h.organismo && h.organismo !== 'general' ? ` · ${esc(h.organismo)}` : ''}:</strong> ${esc(h.texto)} <span class="texto-suave">— ${h.verificado ? `verificado el ${fechaCorta(h.verificado)}` : 'sin verificar'}, ${fuente(h.fuente)}</span></li>`).join('')}</ul>`
          : '<p class="sin-dato">Sin horario con fuente.</p>'
      }
      ${
        esp.length
          ? `<p class="inf-especial"><strong>Horario especial el ${esc(fechaCorta(fecha))}:</strong> ${esp.map((h) => `${esc(h.texto)} (${fuente(h.fuente)})`).join('; ')}</p>`
          : festivosDia.some((f) => [nodo(t.de).pais, nodo(t.a).pais].includes(f.pais))
            ? '<p class="texto-suave">Sin horario especial publicado para el día del cruce.</p>'
            : ''
      }
    </div>`;
  };

  // HU-80: resumen en una página (para imprimir o enviar a quien cotiza).
  const resumenUrl = (() => {
    const u = new URL(enlaceCompartir);
    u.searchParams.set('formato', 'resumen');
    return u.toString();
  })();
  const completoUrl = (() => {
    const u = new URL(enlaceCompartir);
    u.searchParams.delete('formato');
    return u.toString();
  })();
  const ultimoParte = (p) => {
    const x = p?.partes?.[0];
    if (!x) return '<span class="sin-dato">Sin parte cargado</span>';
    const h = horasDesde(x.ts);
    const viejo = h >= (datos.umbralPartesH || 48);
    return `${esc(x.emisor)}, ${esc(fechaCorta(x.publicado))}${x.hora ? ` ${x.hora} h` : ''} (${edadParte(Math.max(h, 0))})${viejo ? ' <strong class="parte-aviso">· parte antiguo: confírmalo</strong>' : ''}`;
  };
  const filaResumenPaso = (t) => {
    const p = datos.pasosInfo[t.paso.id];
    const h = p?.horarios?.[0];
    return `<tr><th scope="row">${esc(t.paso.nombre)}</th><td>${chip(opDe(t), t.vista?.confirmado ? t.vista.valor : null)}<span class="estado-fecha">${t.vista?.confirmado ? `verif. ${esc(fechaCorta(t.vista.verificado))}` : 'sin verificar'}</span></td><td>${ultimoParte(p)}</td><td>${h ? esc(h.texto) : '<span class="sin-dato">Sin horario con fuente</span>'}</td></tr>`;
  };
  const tramosSin = op.tramos.filter((t) => !t.paso && opDe(t) === 'sin-confirmar').length;
  const MAX_AVISOS = 5;
  const resumenHTML = `<section class="informe-resumen" aria-labelledby="inf-resumen">
      <h2 id="inf-resumen">Resumen</h2>
      ${pasos.length ? `<table class="tabla-resumen"><thead><tr><th scope="col">Paso</th><th scope="col">Estado</th><th scope="col">Último parte</th><th scope="col">Horario</th></tr></thead><tbody>${pasos.map(filaResumenPaso).join('')}</tbody></table>` : '<p>Ruta sin pasos de frontera.</p>'}
      <h3>Lo importante</h3>
      ${alertas.length ? `<ul class="alertas">${alertas.join('')}</ul>` : '<p>No hay pasos cerrados, festivos ni pasos sin confirmar en la fecha del cruce.</p>'}
      ${tramosSin ? `<p>${GC.plural(tramosSin, 'tramo de carretera sin estado confirmado', 'tramos de carretera sin estado confirmado')}.</p>` : ''}
      <h3>Avisos activos</h3>
      ${
        op.problemas.length
          ? `<ul class="resumen-lista">${op.problemas.slice(0, MAX_AVISOS).map((i) => `<li><strong>${esc(i.tipo)} · ${esc(i.ubicacion)}</strong>${datos.incidenciasInfo[i.id]?.verificado ? '' : ' (sin verificar)'}</li>`).join('')}${op.problemas.length > MAX_AVISOS ? `<li>y ${op.problemas.length - MAX_AVISOS} más en el informe completo</li>` : ''}</ul>`
          : '<p>Ninguno.</p>'
      }
      <p><strong>Distancia:</strong> ${conFuente.length ? `${GC.km(Math.round(op.km * 10) / 10)} con fuente` : 'sin distancia con fuente'}${op.estimados.length ? `; ≈ ${GC.km(op.kmEstimado)} más en estimación provisional, sin verificar` : ''}.</p>
      ${pasos.length ? `<p><strong>Papeles (${esc(carga.nombre.toLowerCase())}):</strong> ${docs.map((d) => esc(d.nombre.split(' — ')[0])).join(' · ')}.</p>` : ''}
      <p class="resumen-enlace"><strong>Informe completo, con horarios, fuentes y detalle de tramos:</strong> <a href="${esc(completoUrl)}">${esc(completoUrl)}</a></p>
    </section>`;

  salida.innerHTML = `
  <article class="informe" aria-labelledby="inf-titulo">
    <header class="informe-cabeza">
      <p class="informe-marca">Guía del Corredor · Informe de viaje</p>
      <h1 id="inf-titulo">${esc(datos.nodos[a].nombre)} → ${esc(datos.nodos[b].nombre)}</h1>
      <dl class="informe-datos">
        <div><dt>Fecha de cruce</dt><dd>${esc(fechaLarga(fecha))}</dd></div>
        <div><dt>Carga</dt><dd>${esc(carga.nombre)}</dd></div>
        <div><dt>Opción</dt><dd>${esc(op.nombre)}${ops.length > 1 && op.recomendada ? ' (menos incidencias)' : ''}</dd></div>
        <div><dt>Generado</dt><dd>${esc(genTexto)}</dd></div>
      </dl>
    </header>

    <div class="acciones no-imprimir informe-acciones">
      <button class="btn btn-borde" type="button" id="inf-copiar">${I_ENLACE}<span>Copiar enlace</span></button>
      <a class="btn btn-wa" href="https://wa.me/?text=${encodeURIComponent(resumenWA)}" rel="noopener">${I_CHAT}Enviar por WhatsApp</a>
      <button class="btn btn-principal" type="button" id="inf-pdf">${I_PDF}Descargar PDF</button>
      <button class="btn btn-borde" type="button" id="inf-resumen-pdf">${I_PDF}Resumen en 1 página</button>
      <a class="btn btn-texto" id="inf-ver" href="${esc(enResumen ? completoUrl : resumenUrl)}">${enResumen ? 'Ver informe completo' : 'Ver resumen'}</a>
      <a class="btn btn-texto" href="${datos.base}/planificador/?desde=${a}&hasta=${b}&carga=${encodeURIComponent(carga.id)}">Cambiar ruta</a>
    </div>
    <form class="informe-fecha no-imprimir" id="inf-fecha">
      <label><span>Cambiar fecha de cruce</span><input type="date" name="fecha" value="${esc(fecha)}" min="${hoyISO}"></label>
      ${ops.length > 1 ? `<label><span>Opción</span><select name="op">${ops.map((o) => `<option value="${o.id}"${o === op ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>` : ''}
      <button class="btn btn-borde" type="submit">Actualizar informe</button>
    </form>

    ${cambio ? `<p class="aviso aviso-cambio" role="alert"><strong>La situación ha cambiado desde que se generó este informe (${esc(genTexto)}).</strong> Lo que ves abajo son los datos actuales.</p>` : ''}

    ${resumenHTML}

    <section class="informe-seccion" aria-labelledby="inf-alertas">
      <h2 id="inf-alertas">Lo importante</h2>
      ${alertas.length ? `<ul class="alertas">${alertas.join('')}</ul>` : `<p>${datos.operativa.abierto.icono} No hay pasos cerrados, festivos ni pasos sin confirmar en la fecha del cruce.</p>`}
      ${festivosDia.length ? '<p class="texto-suave">Un festivo no implica que la aduana cierre: confirma el horario con el organismo de cada paso.</p>' : ''}
      ${festivosCerca.length ? `<p class="texto-suave">Festivos cerca de la fecha: ${festivosCerca.map((f) => `${esc(fechaCorta(f.fecha))} ${esc(PAISES[f.pais])} (${esc(f.nombre)})`).join('; ')}.</p>` : ''}
    </section>

    <section class="informe-seccion" aria-labelledby="inf-estado">
      <h2 id="inf-estado">Estado de cada tramo</h2>
      <div class="tabla-marco"><table class="tabla-informe">
        <thead><tr><th scope="col">Tramo</th><th scope="col">Estado</th><th scope="col">Fuente</th></tr></thead>
        <tbody>${op.tramos.map(filaTramo).join('')}</tbody>
      </table></div>
    </section>

    ${pasos.length ? `<section class="informe-seccion" aria-labelledby="inf-horarios"><h2 id="inf-horarios">Horarios en frontera</h2>${pasos.map(horariosPaso).join('')}</section>` : ''}

    <section class="informe-seccion" aria-labelledby="inf-avisos">
      <h2 id="inf-avisos">Avisos activos</h2>
      ${
        op.problemas.length
          ? `<ul class="informe-lista">${op.problemas
              .map((i) => {
                const x = datos.incidenciasInfo[i.id] || {};
                return `<li><strong>${esc(i.tipo)} · ${esc(i.ubicacion)}:</strong> ${esc(i.texto)}${x.finPrevista ? ` <em>Previsión: ${esc(x.finPrevista)}.</em>` : ''} <span class="texto-suave">— ${x.verificado ? `verificado el ${fechaCorta(x.verificado)}` : 'sin verificar'}, ${fuente(x.fuente)}${i.publicado ? `, ${fechaCorta(i.publicado)}` : ''}</span></li>`;
              })
              .join('')}</ul>`
          : '<p>No hay avisos activos en esta ruta.</p>'
      }
    </section>

    <section class="informe-seccion" aria-labelledby="inf-km">
      <h2 id="inf-km">Distancias</h2>
      <p><strong>Con fuente:</strong> ${conFuente.length ? `${GC.km(Math.round(op.km * 10) / 10)} en ${GC.plural(conFuente.length, 'tramo', 'tramos')} (${conFuente.map((t) => `${esc(nombreT(t))} ${GC.km(t.km)}`).join('; ')})` : 'ningún tramo'}.</p>
      ${op.estimados.length ? `<p><strong>Estimación provisional, sin verificar:</strong> ≈ ${GC.km(op.kmEstimado)} en línea recta (${op.estimados.map((t) => `${esc(nombreT(t))} ≈ ${GC.km(t.estimacion.km)}`).join('; ')}). Por carretera es más.</p>` : ''}
      ${op.sinKm - op.estimados.length > 0 ? `<p>${GC.plural(op.sinKm - op.estimados.length, 'tramo sin dato', 'tramos sin dato')}.</p>` : ''}
      <p class="texto-suave">No se suman como distancia oficial.</p>
    </section>

    ${
      pasos.length
        ? `<section class="informe-seccion" aria-labelledby="inf-papeles"><h2 id="inf-papeles">Papeles para cruzar (${esc(carga.nombre.toLowerCase())})</h2>
      <ul class="informe-lista informe-check">${docs.map((d) => `<li>${esc(d.nombre)}</li>`).join('')}</ul>
      <p class="texto-suave">${esc(datos.avisoDocumentos)}</p></section>`
        : ''
    }

    <section class="informe-seccion" aria-labelledby="inf-fuentes">
      <h2 id="inf-fuentes">Fuentes</h2>
      <ul class="informe-lista informe-fuentes">${[...fuentes.values()].map((f) => `<li>${fuente(f)}</li>`).join('') || '<li>Sin fuentes</li>'}</ul>
    </section>

    <footer class="informe-pie">
      <p><strong>Situación a ${esc(genTexto)}. Confirma antes de salir.</strong> «Verificado» significa revisado por el responsable editorial de la Guía del Corredor; «Sin confirmar», que solo hay un dato publicado por su fuente. Un festivo no implica cierre de aduana.</p>
      <p class="texto-suave">${esc(location.origin + datos.base)}/</p>
    </footer>
  </article>`;

  // Si el enlace no llevaba fecha de generación, la fija ahora (para que el enlace compartido la conserve).
  if (!gen) history.replaceState(null, '', urlCon({ gen: genAhora, h: huella }));

  document.getElementById('inf-copiar').addEventListener('click', (e) => {
    const s = e.currentTarget.querySelector('span');
    navigator.clipboard?.writeText(enlaceCompartir).then(
      () => (s.textContent = 'Enlace copiado'),
      () => (s.textContent = 'No se pudo copiar')
    );
  });
  document.getElementById('inf-pdf').addEventListener('click', () => {
    raiz.classList.remove('modo-resumen');
    window.print();
    if (enResumen) raiz.classList.add('modo-resumen');
  });
  document.getElementById('inf-resumen-pdf').addEventListener('click', () => {
    raiz.classList.add('modo-resumen');
    window.print();
    if (!enResumen) raiz.classList.remove('modo-resumen');
  });
  document.getElementById('inf-fecha').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const u = new URL(urlCon({ fecha: f.get('fecha') || fecha, ...(f.get('op') ? { op: f.get('op') } : {}) }));
    u.searchParams.delete('gen');
    u.searchParams.delete('h');
    location.href = u.toString();
  });
})();
