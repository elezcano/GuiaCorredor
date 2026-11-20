// Calendario aduanero (V3): un mes a la vista con flechas; filtro por país; tocar un día lo responde arriba («¿Qué día cruzas?»).
(function () {
  const raiz = document.querySelector('.calendario-v3');
  if (!raiz) return;
  const meses = [...raiz.querySelectorAll('.cal-mes')];
  const fecha = raiz.querySelector('.calendario-paso input[name="fecha"]');
  let pais = '';
  const ver = (i) => meses.forEach((m, j) => (m.hidden = j !== i));
  const filtrar = () => {
    raiz.querySelectorAll('.cal-paises .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pais === pais)));
    raiz.querySelectorAll('.cal-lista > li').forEach((li) => (li.hidden = !!pais && li.dataset.pais !== pais));
    raiz.querySelectorAll('.cal-dia.con-fest').forEach((d) => d.classList.toggle('apagado', !!pais && !d.dataset.paises.split(' ').includes(pais)));
  };
  const marcar = (dia) => raiz.querySelectorAll('.cal-dia').forEach((d) => d.classList.toggle('elegido', d.dataset.dia === dia));
  raiz.addEventListener('click', (e) => {
    const ir = e.target.closest('[data-mes-ir]');
    if (ir) {
      const i = meses.findIndex((m) => !m.hidden) + Number(ir.dataset.mesIr);
      if (meses[i]) ver(i);
      return;
    }
    const chip = e.target.closest('.cal-paises .chip');
    if (chip) {
      pais = chip.dataset.pais;
      filtrar();
      return;
    }
    const dia = e.target.closest('.cal-dia[data-dia]');
    if (dia && fecha) {
      fecha.value = dia.dataset.dia;
      fecha.dispatchEvent(new Event('change', { bubbles: true }));
      marcar(dia.dataset.dia);
      fecha.closest('.calendario-paso').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
  // La fecha elegida arriba lleva al mes que toca.
  raiz.addEventListener('change', (e) => {
    if (e.target.name !== 'fecha' || !e.target.value) return;
    const i = meses.findIndex((m) => m.dataset.mes === e.target.value.slice(0, 7));
    if (i >= 0) ver(i);
    marcar(e.target.value);
  });
  filtrar();
})();
