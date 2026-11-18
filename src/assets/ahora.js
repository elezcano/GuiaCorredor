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
  const doble = (hhmm, zona) => `${hhmm} en ${PAIS_ZONA[zona] || 'hora local'} (${enEspana(hhmm, zona)} en España)`;
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
