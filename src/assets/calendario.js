// Calendario aduanero: filtros por país, organismo, mes y fecha de cruce.
// La fecha de cruce muestra los festivos de 2 días antes a 3 días después y los horarios especiales vigentes ese día.
(function () {
  const caja = document.querySelector('[data-cal-filtros]');
  if (!caja) return;
  const fechaIn = document.getElementById('filtro-fecha');
  const mesIn = document.getElementById('filtro-mes');
  const estadoTxt = document.getElementById('cal-estado');
  const f = { pais: '', organismo: '', mes: '', fecha: '' };
  const dia = (iso, d) => {
    const x = new Date(iso + 'T12:00:00Z');
    x.setUTCDate(x.getUTCDate() + d);
    return x.toISOString().slice(0, 10);
  };
  const fmt = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });

  function aplicar() {
    const desde = f.fecha && dia(f.fecha, -2);
    const hasta = f.fecha && dia(f.fecha, 3);
    let nFest = 0;
    document.querySelectorAll('[data-cal]').forEach((el) => {
      const d = el.dataset;
      let ok = (!f.pais || (d.pais || '').split(' ').includes(f.pais)) && (!f.organismo || d.organismo === f.organismo);
      if (d.fecha) {
        if (f.mes) ok = ok && d.mes === f.mes;
        if (f.fecha) ok = ok && d.fecha >= desde && d.fecha <= hasta;
        if (ok) nFest++;
      } else if (d.desde && f.fecha) ok = ok && d.desde <= f.fecha && d.hasta >= f.fecha;
      el.hidden = !ok;
    });
    // Cabeceras de mes sin festivos visibles
    let cab = null;
    let con = false;
    document.querySelectorAll('#lista-fest > li').forEach((li) => {
      if (li.hasAttribute('data-cabecera')) {
        if (cab) cab.hidden = !con;
        cab = li;
        con = false;
      } else if (!li.hidden) con = true;
    });
    if (cab) cab.hidden = !con;
    document.querySelectorAll('[data-vacio-de]').forEach((v) => {
      const lista = document.getElementById(v.dataset.vacioDe) || document.querySelector('.' + v.dataset.vacioDe);
      v.hidden = !lista || [...lista.querySelectorAll('[data-cal]')].some((x) => !x.hidden);
    });
    caja.querySelectorAll('button[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(f[b.dataset.filtro] === b.dataset.valor)));
    estadoTxt.textContent = f.fecha
      ? nFest
        ? `${nFest} ${nFest === 1 ? 'festivo' : 'festivos'} entre el ${fmt(desde)} y el ${fmt(hasta)}.`
        : `Ningún festivo entre el ${fmt(desde)} y el ${fmt(hasta)} con esos filtros.`
      : '';
  }

  caja.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filtro]');
    if (!b) return;
    f[b.dataset.filtro] = b.dataset.valor;
    aplicar();
  });
  fechaIn.addEventListener('change', () => {
    f.fecha = fechaIn.value;
    if (f.fecha) {
      f.mes = '';
      mesIn.value = '';
    }
    aplicar();
  });
  mesIn.addEventListener('change', () => {
    f.mes = mesIn.value;
    if (f.mes) {
      f.fecha = '';
      fechaIn.value = '';
    }
    aplicar();
  });
  aplicar();
})();
