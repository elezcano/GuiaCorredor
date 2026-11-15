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
  function pintar() {
    d.paises.forEach((p) => {
      const r = el.querySelector(`.ahora-reloj[data-pais="${p.pais}"] .ahora-hora`);
      if (r) r.textContent = `${hora(p.zona)} en ${p.nombre}`;
    });
    if (d.op === 'cerrado') {
      salida.textContent = 'No habilitado: el horario no aplica.';
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
    if (ahora >= a && ahora < c) salida.innerHTML = `${pref}<strong>Abierto ahora</strong> · cierra a las ${d.horario.cierre}, en ${dur(c - ahora)}${nota}.`;
    else if (ahora < a) salida.innerHTML = `${pref}<strong>Cerrado ahora</strong> · abre a las ${d.horario.apertura}, en ${dur(a - ahora)}${nota}.`;
    else salida.innerHTML = `${pref}<strong>Cerrado ahora</strong> · abre mañana a las ${d.horario.apertura}${nota}.`;
  }
  pintar();
  setInterval(pintar, 60000);
})();
