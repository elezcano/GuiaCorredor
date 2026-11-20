// HU-115: mapa interactivo del corredor con MapLibre GL y teselas de OpenFreeMap (datos de OpenStreetMap).
// Si MapLibre no está, el navegador no tiene WebGL o el mapa base no carga, se queda el esquema SVG.
(function () {
  // Un solo estado en el marco: «esquema» (por defecto), «cargando» (el esquema tapa el mapa) o «mapa».
  const caja = document.getElementById('mapa-vivo');
  const marco = caja?.closest('.mapa-vivo-marco');
  const estado = (e) => marco && (marco.dataset.estado = e);
  const fuente = document.getElementById('datos-mapa');
  if (!caja || !fuente || !window.maplibregl) return;
  if (window.maplibregl.supported && !window.maplibregl.supported()) return;
  const d = JSON.parse(fuente.textContent);
  const color = ['match', ['get', 'op'], 'abierto', d.colores.abierto, 'restricciones', d.colores.restricciones, 'cerrado', d.colores.cerrado, d.colores['sin-confirmar']];
  const lineas = {
    type: 'FeatureCollection',
    features: d.lineas.map((l) => ({ type: 'Feature', properties: { nombre: l.nombre, op: l.op, estado: l.estado, recta: l.trazado === 'recta', alt: l.alt, url: l.url || '' }, geometry: { type: 'LineString', coordinates: l.coords } })),
  };
  const puntos = {
    type: 'FeatureCollection',
    features: d.puntos.map((p) => ({ type: 'Feature', properties: { nombre: p.nombre, tipo: p.tipo, op: p.op || '', estado: p.estado || p.pais || '', url: p.url || '' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
  };
  const lons = d.puntos.map((p) => p.lon), lats = d.puntos.map((p) => p.lat);
  // Formas de estado dibujadas en un lienzo (las mismas que en el resto de la web).
  const FORMAS = { abierto: 'circulo', restricciones: 'triangulo', cerrado: 'cuadrado', 'sin-confirmar': 'discontinuo' };
  function lienzo(op, col, t = 44) {
    const c = document.createElement('canvas');
    c.width = c.height = t;
    const x = c.getContext('2d');
    const m = t / 2;
    x.lineWidth = 5;
    x.strokeStyle = '#ffffff';
    x.fillStyle = col;
    x.beginPath();
    if (FORMAS[op] === 'triangulo') {
      x.moveTo(m, 5);
      x.lineTo(t - 5, t - 6);
      x.lineTo(5, t - 6);
      x.closePath();
    } else if (FORMAS[op] === 'cuadrado') x.roundRect ? x.roundRect(7, 7, t - 14, t - 14, 6) : x.rect(7, 7, t - 14, t - 14);
    else x.arc(m, m, m - 6, 0, Math.PI * 2);
    x.stroke();
    if (FORMAS[op] === 'discontinuo') {
      x.fillStyle = '#ffffff';
      x.fill();
      x.setLineDash([5, 4]);
      x.lineWidth = 4;
      x.strokeStyle = col;
      x.stroke();
    } else x.fill();
    if (FORMAS[op] === 'cuadrado') {
      x.fillStyle = '#ffffff';
      x.fillRect(m - 8, m - 2.5, 16, 5);
    }
    return c;
  }
  const dibujar = (op, col) => {
    const c = lienzo(op, col);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height);
  };
  // Todo el corredor a la vista (V2): la misma caja al crear el mapa y al terminar de cargar.
  const encuadre = [[Math.min(...lons) - 0.5, Math.min(...lats) - 0.5], [Math.max(...lons) + 0.5, Math.max(...lats) + 0.5]];
  let mapa;
  try {
    estado('cargando');
    mapa = new maplibregl.Map({
      container: caja,
      style: 'https://tiles.openfreemap.org/styles/positron',
      bounds: encuadre,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: { 'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para acercar', 'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para acercar', 'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa' },
    });
  } catch (e) {
    console.warn('Mapa: no se pudo crear', e && e.message);
    estado('esquema');
    return;
  }
  let listo = false;
  // Si el mapa base no carga en 12 s, se vuelve al esquema.
  const plazo = setTimeout(() => {
    if (!listo) {
      console.warn('Mapa: el mapa base no cargó en 12 s; se muestra el esquema');
      estado('esquema');
      try { mapa.remove(); } catch {}
    }
  }, 12000);
  mapa.on('error', (e) => console.warn('Mapa:', e && e.error && e.error.message));
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  mapa.on('load', () => {
    listo = true;
    mapa.resize();
    mapa.fitBounds(encuadre, { padding: 16, animate: false });
    clearTimeout(plazo);
    mapa.addSource('lineas', { type: 'geojson', data: lineas });
    mapa.addSource('puntos', { type: 'geojson', data: puntos });
    mapa.addLayer({ id: 'lineas-borde', type: 'line', source: 'lineas', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['case', ['get', 'alt'], 6, 8] } });
    mapa.addLayer({ id: 'lineas', type: 'line', source: 'lineas', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': color, 'line-width': ['case', ['get', 'alt'], 3, 5], 'line-dasharray': ['case', ['get', 'recta'], ['literal', [2, 2]], ['literal', [1, 0]]] } });
    mapa.addLayer({ id: 'ciudades', type: 'circle', source: 'puntos', filter: ['!=', ['get', 'tipo'], 'paso'], paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#14181b', 'circle-stroke-width': 3 } });
    // HU-136 (V2): cada paso con la forma de su estado (círculo, triángulo, cuadrado, círculo discontinuo), no solo color.
    for (const op of Object.keys(FORMAS)) mapa.addImage(`forma-${op}`, dibujar(op, d.colores[op]), { pixelRatio: 2 });
    mapa.addLayer({ id: 'pasos', type: 'symbol', source: 'puntos', filter: ['==', ['get', 'tipo'], 'paso'], layout: { 'icon-image': ['concat', 'forma-', ['get', 'op']], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    mapa.addLayer({ id: 'nombres', type: 'symbol', source: 'puntos', layout: { 'text-field': ['get', 'nombre'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 9 }, paint: { 'text-color': '#14181b', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
    const aviso = (e) => {
      const f = e.features[0];
      const p = f.properties;
      const div = document.createElement('div');
      const t = document.createElement('strong');
      t.textContent = p.nombre;
      const s = document.createElement('p');
      s.className = 'mapa-estado';
      if (p.op && FORMAS[p.op]) {
        const img = document.createElement('img');
        img.src = lienzo(p.op, d.colores[p.op], 32).toDataURL();
        img.alt = '';
        img.width = img.height = 16;
        s.append(img, ' ');
      }
      s.append(p.estado);
      div.append(t, s);
      if (p.url) {
        const a = document.createElement('a');
        a.href = p.url;
        a.textContent = p.tipo === 'paso' ? 'Abrir la ficha del paso' : p.tipo ? 'Ver servicios aquí' : 'Abrir la ficha';
        div.append(a);
      }
      new maplibregl.Popup({ closeButton: true, maxWidth: '260px' }).setLngLat(e.lngLat).setDOMContent(div).addTo(mapa);
    };
    for (const capa of ['pasos', 'ciudades', 'lineas']) {
      mapa.on('click', capa, aviso);
      mapa.on('mouseenter', capa, () => (mapa.getCanvas().style.cursor = 'pointer'));
      mapa.on('mouseleave', capa, () => (mapa.getCanvas().style.cursor = ''));
    }
    estado('mapa');
    // La lista de tramos de la página centra el mapa en el tramo elegido.
    document.querySelectorAll('[data-tramo-mapa]').forEach((b) =>
      b.addEventListener('click', () => {
        const l = d.lineas.find((x) => x.id === b.dataset.tramoMapa);
        if (!l) return;
        const xs = l.coords.map((c) => c[0]), ys = l.coords.map((c) => c[1]);
        mapa.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, maxZoom: 9 });
        caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
      })
    );
  });
})();
