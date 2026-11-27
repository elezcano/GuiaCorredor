// Operación (decisión 45): lo vivo se lee de GitHub al abrir la página. Solo lectura, sin datos personales.
(() => {
  const raiz = document.querySelector('.operacion');
  if (!raiz) return;
  const repo = raiz.dataset.repo;
  const raw = (f) => `https://raw.githubusercontent.com/${repo}/datos-vigilancia/${f}`;
  const api = (f) => `https://api.github.com/repos/${repo}/${f}`;
  const $ = (s) => raiz.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  // Hora de Argentina (UTC−3, sin horario de verano).
  const horaAR = (iso) => {
    if (!iso) return '—';
    const d = new Date(Date.parse(iso) - 3 * 36e5);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };
  const hace = (iso) => {
    const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
    return m < 60 ? `hace ${m} min` : m < 2880 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`;
  };
  const json = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
  const texto = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''));
  const acciones = [];
  const accion = () => {
    const p = $('[data-op-accion]');
    p.hidden = !acciones.length;
    p.textContent = acciones.join(' · ');
  };

  json(raw('vigilancia.json'))
    .then((v) => {
      const viejo = (Date.now() - Date.parse(v.ultimaPasada)) / 36e5 > 2;
      $('[data-op-vigilante]').innerHTML = `<span class="${viejo ? 'op-cerrado' : 'op-abierto'}">${viejo ? '✗' : '✓'} última pasada ${esc(horaAR(v.ultimaPasada))} (${esc(hace(v.ultimaPasada))})</span>`;
      if (viejo) acciones.push('El vigilante no pasa desde hace más de 2 h: mira Actions.');
      const filas = Object.entries(v.fuentes || {})
        .sort(([, a], [, b]) => (b.fallosSeguidos || 0) - (a.fallosSeguidos || 0) || Number(!!b.atrasada) - Number(!!a.atrasada))
        .map(([id, f]) => {
          const estado = f.fallosSeguidos ? ['op-cerrado', 'falla'] : f.atrasada ? ['op-sin-confirmar', 'atrasada'] : ['op-abierto', 'ok'];
          if (f.fallosSeguidos >= 3) acciones.push(`${f.nombre}: ${f.fallosSeguidos} fallos seguidos.`);
          return `<tr class="${f.fallosSeguidos ? 'op-mal' : ''}"><td>${f.url ? `<a href="${esc(f.url)}" rel="noopener">${esc(f.nombre || id)}</a>` : esc(f.nombre || id)}<small> ${esc(id)}</small></td><td data-c="Última buena" class="num">${esc(horaAR(f.ultimaLecturaBuena))}</td><td data-c="Publicó" class="num">${esc(horaAR(f.ultimaPublicacion))}</td><td data-c="Estado" class="${estado[0]}">${estado[1]}</td><td data-c="Fallos" class="num">${f.fallosSeguidos || 0}</td><td data-c="Error">${esc(f.ultimoError || '—')}</td><td data-c=""><a href="https://github.com/${repo}/blob/main/data/fuentes-vigilancia.csv">csv ↗</a></td></tr>`;
        });
      $('[data-op-fuentes] tbody').innerHTML = filas.join('') || '<tr><td colspan="7">Sin fuentes.</td></tr>';
      $('[data-op-leido]').textContent = `Datos en vivo leídos a las ${horaAR(new Date().toISOString())}.`;
      accion();
    })
    .catch((e) => {
      $('[data-op-vigilante]').textContent = `no se pudo leer (${e.message})`;
      $('[data-op-fuentes] tbody').innerHTML = `<tr><td colspan="7">No se pudo leer vigilancia.json (${esc(e.message)}).</td></tr>`;
    });

  json(api('actions/workflows/vigia.yml/runs?per_page=1'))
    .then((r) => {
      const c = r.workflow_runs?.[0];
      if (!c) throw new Error('sin ejecuciones');
      const ok = c.conclusion === 'success';
      $('[data-op-vigia]').innerHTML = `<a class="${ok ? 'op-abierto' : c.conclusion ? 'op-cerrado' : 'op-sin-confirmar'}" href="${esc(c.html_url)}">${ok ? '✓ verde' : esc(c.conclusion || c.status)} · ${esc(horaAR(c.created_at))}</a>`;
      if (c.conclusion && !ok) { acciones.push('El Vigía está en rojo: es un fallo nuestro.'); accion(); }
    })
    .catch((e) => ($('[data-op-vigia]').textContent = `no se pudo leer (${e.message})`));

  json(api('issues?state=open&per_page=30'))
    .then((l) => {
      const solo = l.filter((i) => !i.pull_request);
      $('[data-op-issues]').innerHTML = solo.length ? solo.map((i) => `<a href="${esc(i.html_url)}">#${i.number} ${esc(i.title)}</a>`).join('<br>') : 'ninguno';
    })
    .catch((e) => ($('[data-op-issues]').textContent = `no se pudo leer (${e.message})`));

  // Registro: hoy y ayer (UTC, como los nombra el vigilante).
  const dia = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  Promise.all([texto(raw(`registro/${dia(0)}.jsonl`)), texto(raw(`registro/${dia(1)}.jsonl`))]).then(([a, b]) => {
    const filas = `${b}\n${a}`
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .reverse();
    const sel = $('[data-op-paso]');
    [...new Set(filas.map((f) => f.paso).filter(Boolean))].sort().forEach((p) => sel.insertAdjacentHTML('beforeend', `<option>${esc(p)}</option>`));
    const pintar = () => {
      const paso = sel.value;
      const err = $('[data-op-errores]').checked;
      const cam = $('[data-op-cambios]').checked;
      const ver = filas.filter((f) => (!paso || f.paso === paso) && (!err || f.error || f.http !== 'ok') && (!cam || f.cambio)).slice(0, 60);
      $('[data-op-registro] tbody').innerHTML =
        ver
          .map((f) => `<tr class="${f.error || f.http !== 'ok' ? 'op-mal' : ''}"><td>${esc(horaAR(f.consultado || f.ejecucion))}</td><td>${esc(f.paso || f.fuente)}</td><td>${esc(f.http)}</td><td>${esc(f.error || Object.entries(f.lectura || {}).map(([k, v]) => `${k}: ${v}`).join(' · '))}</td><td>${esc(f.calculado ?? '—')} → ${esc(f.publicado ?? '—')}${f.cambio ? ' ●' : ''}</td></tr>`)
          .join('') || '<tr><td colspan="5">Nada con ese filtro.</td></tr>';
    };
    raiz.querySelectorAll('[data-op-paso], [data-op-errores], [data-op-cambios]').forEach((x) => x.addEventListener('change', pintar));
    pintar();
  });
})();
