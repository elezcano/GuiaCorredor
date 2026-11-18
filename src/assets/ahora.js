// HU-66: hora local de cada lado del paso y «abierto ahora / cierra en…».
// Usa el horario con apertura, cierre y zona horaria de data/pasos.json. Sin horario estructurado no calcula nada.
(function () {
  const el = document.querySelector('.ahora[data-ahora]');
  if (!el) return;
  const d = JSON.parse(el.dataset.ahora);
  const hora = (zona) => new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zona }).format(new Date());
  const minutos = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
  const salida = el.querySelector('.ahora-estado');
  // HU-133 (R4): cada hora del paso también en hora de España.
  const PAIS_ZONA = { 'America/Argentina/Salta': 'Argentina', 'America/Santiago': 'Chile', 'America/Asuncion': 'Paraguay', 'America/Campo_Grande': 'Brasil' };
  const desfase = (zona) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName').value;
    const m = p.match(/GMT([+-])(\d\d):(\d\d)/);
    return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  const enEspana = (hhmm, zona) => {
    let t = minutos(hhmm) - desfase(zona) + desfase('Europe/Madrid');
    t = ((t % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };
  const paisZona = (z) => PAIS_ZONA[z] || (/^America\/Argentina\//.test(z) ? 'Argentina' : 'hora local');
  const doble = (hhmm, zona) => `${hhmm} en ${paisZona(zona)} (${enEspana(hhmm, zona)} en España)`;
  function pintar() {
    d.paises.forEach((p) => {
      const r = el.querySelector(`.ahora-reloj[data-pais="${p.pais}"] .ahora-hora`);
      if (r) r.textContent = `${hora(p.zona)} en ${p.nombre}`;
    });
    el.querySelectorAll('.ahora-reloj-es .ahora-hora').forEach((r) => {
      r.textContent = `${hora('Europe/Madrid')} en España`;
    });
    const habitual = d.horario ? ` (de ${doble(d.horario.apertura, d.horario.zona)} a ${doble(d.horario.cierre, d.horario.zona)})` : '';
    if (d.op === 'cerrado') {
      salida.innerHTML = d.soloCarga
        ? `<strong>No habilitado para carga.</strong> Un camión no puede cruzar aunque sea dentro del horario habitual${habitual}, hasta un nuevo parte oficial.`
        : d.horario
          ? `<strong>No habilitado.</strong> No se puede cruzar aunque sea dentro del horario habitual${habitual}, hasta un nuevo parte oficial.`
          : '<strong>No habilitado.</strong> No se puede cruzar hasta que se habilite oficialmente.';
      return;
    }
    if (!d.horario) {
      salida.textContent = 'Sin horario con hora de apertura y cierre: consulta el parte del día.';
      return;
    }
    const ahora = minutos(hora(d.horario.zona));
    const a = minutos(d.horario.apertura);
    const c = minutos(d.horario.cierre);
    const nota = d.horario.verificado ? '' : ' (según el horario publicado, sin verificar)';
    const pref = d.op === 'sin-confirmar' ? 'Estado sin confirmar. ' : '';
    if (ahora >= a && ahora < c) salida.innerHTML = `${pref}<strong>Abierto ahora</strong> · hasta las ${doble(d.horario.cierre, d.horario.zona)}, en ${dur(c - ahora)}${nota}.`;
    else if (ahora < a) salida.innerHTML = `${pref}<strong>Cerrado ahora</strong> · abre a las ${doble(d.horario.apertura, d.horario.zona)}, en ${dur(a - ahora)}${nota}.`;
    else salida.innerHTML = `${pref}<strong>Cerrado ahora</strong> · abre mañana a las ${doble(d.horario.apertura, d.horario.zona)}${nota}.`;
  }
  pintar();
  setInterval(pintar, 60000);
})();

// HU-73: antigüedad de cada parte y aviso a partir del umbral (data/site.json → partes.umbralHoras).
(function () {
  const caja = document.querySelector('.partes[data-umbral]');
  if (!caja) return;
  const umbral = Number(caja.dataset.umbral) || 48;
  const edad = (h) => (h < 1 ? 'hace menos de 1 h' : h < 48 ? `hace ${Math.floor(h)} h` : `hace ${Math.floor(h / 24)} días`);
  function pintar() {
    caja.querySelectorAll('.parte[data-ts]').forEach((li) => {
      const h = (Date.now() - new Date(li.dataset.ts).getTime()) / 36e5;
      const t = li.querySelector('time');
      let e = li.querySelector('.parte-edad');
      if (!e) (e = document.createElement('span')), (e.className = 'parte-edad'), t.after(e);
      e.textContent = ` (${edad(Math.max(h, 0))})`;
      const av = li.querySelector('.parte-aviso');
      const viejo = h >= umbral;
      li.classList.toggle('parte-vieja', viejo);
      av.hidden = !viejo;
      if (viejo) av.textContent = `Este parte tiene ${h >= 48 ? Math.floor(h / 24) + ' días' : Math.floor(h) + ' h'}: confírmalo antes de salir.`;
    });
  }
  pintar();
  setInterval(pintar, 60000);
})();

// HU-105: sentido del cruce. El botón «⇄» da la vuelta a la ficha: banderas, orden de los
// controles (primero lo común a los dos países, después la salida y al final la entrada),
// orden de los partes y datos que solo valen para un sentido. El sentido va en la URL (?sentido=CL-AR).
(function () {
  const caja = document.querySelector('.sentido[data-sentido-paso]');
  if (!caja) return;
  const [a, b] = caja.dataset.sentidoPaso.split('-');
  const nombres = JSON.parse(caja.dataset.nombres || '{}');
  const url = new URL(location.href);
  let s = url.searchParams.get('sentido');
  if (s !== `${a}-${b}` && s !== `${b}-${a}`) s = `${a}-${b}`;
  const ruta = caja.querySelector('.sentido-ruta');
  const ladoA = caja.querySelector('.sentido-a');
  const ladoB = caja.querySelector('.sentido-b');
  const nota = caja.querySelector('.sentido-nota');
  function aplicar(cambiarUrl) {
    const [sal, ent] = s.split('-');
    // Banderas y nombres
    const [primero, segundo] = sal === a ? [ladoA, ladoB] : [ladoB, ladoA];
    ruta.replaceChildren(primero, document.createTextNode(' → '), segundo);
    nota.textContent = `Sales de ${nombres[sal]} y entras en ${nombres[ent]}. Los controles van en ese orden.`;
    // Controles: primero lo común a los dos países (control integrado), después la salida y al final la entrada
    const lista = document.querySelector('.controles');
    if (lista) {
      const grupo = (li) => (li.dataset.lado === sal ? 1 : li.dataset.lado === ent ? 2 : 0);
      [...lista.children]
        .sort((x, y) => grupo(x) - grupo(y) || Number(x.dataset.orden) - Number(y.dataset.orden))
        .forEach((li) => lista.appendChild(li));
    }
    // Partes: primero el país de salida
    const grid = document.querySelector('.partes-grid');
    if (grid) {
      const bloques = [...grid.children];
      bloques.sort((x, y) => (x.dataset.pais === sal ? -1 : y.dataset.pais === sal ? 1 : 0)).forEach((el) => grid.appendChild(el));
    }
    // Datos que solo valen para un sentido
    document.querySelectorAll('[data-sentido]').forEach((el) => (el.hidden = el.dataset.sentido !== s));
    if (cambiarUrl) {
      url.searchParams.set('sentido', s);
      history.replaceState(null, '', url);
    }
  }
  caja.querySelector('.btn-sentido').addEventListener('click', () => {
    const [x, y] = s.split('-');
    s = `${y}-${x}`;
    aplicar(true);
  });
  aplicar(false);
})();

// HU-133 (R7): pestañas Hoy · Papeles · Calendario de la ficha del paso. #papeles y #calendario abren la suya.
(function () {
  const lista = document.querySelector('.pestanas[role="tablist"]');
  if (!lista) return;
  const tabs = [...lista.querySelectorAll('[role="tab"]')];
  const elegir = (tab, foco) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (foco) tab.focus();
    const id = tab.id.replace('tab-', '');
    history.replaceState(null, '', id === 'hoy' ? location.pathname + location.search : `#${id}`);
  };
  tabs.forEach((t) => t.addEventListener('click', () => elegir(t)));
  lista.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      elegir(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
    }
  });
  const porHash = () => {
    const t = tabs.find((x) => `#${x.id.replace('tab-', '')}` === location.hash);
    if (t) elegir(t);
  };
  porHash();
  addEventListener('hashchange', porHash);
})();

// HU-133 (R7): papeles según la carga; lo marcado se guarda en este dispositivo.
(function () {
  const caja = document.querySelector('[data-papeles]');
  if (!caja) return;
  const leer = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };
  const guardar = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };
  const marcados = leer('guia-corredor:papeles', {});
  const carga = leer('guia-corredor:carga', 'general');
  const radio = caja.querySelector(`input[name="carga-paso"][value="${carga}"]`);
  if (radio) radio.checked = true;
  caja.querySelectorAll('[data-doc]').forEach((c) => (c.checked = !!marcados[c.dataset.doc]));
  function pintar() {
    const c = caja.querySelector('input[name="carga-paso"]:checked')?.value || 'general';
    let total = 0;
    let listos = 0;
    caja.querySelectorAll('.papeles-lista li').forEach((li) => {
      const vale = !li.dataset.cargas || li.dataset.cargas.split(' ').includes(c);
      li.hidden = !vale;
      if (vale) {
        total++;
        if (li.querySelector('input').checked) listos++;
      }
    });
    caja.querySelector('[data-total]').textContent = `${total} ${total === 1 ? 'papel' : 'papeles'}`;
    caja.querySelector('[data-listos]').textContent = `· ${listos} ${listos === 1 ? 'listo' : 'listos'}`;
  }
  caja.addEventListener('change', (e) => {
    if (e.target.name === 'carga-paso') guardar('guia-corredor:carga', e.target.value);
    if (e.target.dataset.doc) {
      marcados[e.target.dataset.doc] = e.target.checked;
      guardar('guia-corredor:papeles', marcados);
    }
    pintar();
  });
  pintar();
})();

// HU-133 (R7): ¿cuándo cruzas? Avisa si ese día es festivo en algún lado y si hay horario especial publicado.
(function () {
  const caja = document.querySelector('[data-cal-paso]');
  if (!caja) return;
  const d = JSON.parse(caja.dataset.calPaso);
  const salida = caja.querySelector('.cal-respuesta');
  const fechaInput = caja.querySelector('input[name="fecha"]');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const masDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const hoyLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Salta' }).format(new Date());
  const largo = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const nombres = (ps) => {
    const n = ps.map((p) => d.paises[p]);
    return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}` : n[0];
  };
  function pintar(dia) {
    const fs = d.festivos.filter((f) => f.fecha === dia);
    const esp = d.especiales.filter((h) => h.desde <= dia && dia <= h.hasta);
    const D = largo(dia);
    if (!fs.length) {
      salida.innerHTML = `<p class="cal-ok"><strong>${esc(D[0].toUpperCase() + D.slice(1))}:</strong> no es festivo ${Object.keys(d.paises).map((p) => `en ${esc(d.paises[p])}`).join(' ni ')}.${esp.length ? ` Horario especial publicado: ${esp.map((h) => esc(h.texto)).join(' ')}` : ''}</p>`;
      return;
    }
    const ps = [...new Set(fs.map((f) => f.pais))];
    const dos = ps.length === Object.keys(d.paises).length;
    salida.innerHTML = `<div class="cal-festivo" role="status">
      <p class="cal-festivo-titulo">${dos ? 'Festivo en los dos lados' : `Festivo en ${esc(nombres(ps))}`}</p>
      <p>${esc(D[0].toUpperCase() + D.slice(1))}: ${fs.map((f) => `${esc(f.nombre)} (${esc(d.paises[f.pais])}${f.tipo !== 'Feriado' ? `, ${esc(f.tipo.toLowerCase())}` : ''}${f.porConfirmar ? ', por confirmar' : ''})`).join('; ')}.</p>
      <p>${esp.length ? `Horario especial publicado: ${esp.map((h) => esc(h.texto)).join(' ')}` : 'Nadie ha publicado horario especial. Antes de salir, confirma si la aduana atiende carga ese día.'}</p>
    </div>`;
  }
  caja.addEventListener('change', (e) => {
    if (e.target.name === 'cuando') {
      const dia = masDias(hoyLocal(), Number(e.target.value));
      fechaInput.value = dia;
      pintar(dia);
    }
    if (e.target.name === 'fecha' && e.target.value) {
      caja.querySelectorAll('input[name="cuando"]').forEach((r) => (r.checked = false));
      pintar(e.target.value);
    }
  });
  const hoy = hoyLocal();
  fechaInput.value = hoy;
  fechaInput.min = hoy;
  pintar(hoy);
})();
