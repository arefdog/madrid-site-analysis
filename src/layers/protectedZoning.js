import L from 'leaflet';
import zoning from '../../data/cm-protected-zonification.json';

// Protected-area zoning of the Comunidad de Madrid — the internal PORN/PRUG
// zonification of the region's protected areas, not just their outlines.
//
// Four services publish an internal zoning scheme, each with its own codes:
//   · P.R. Cuenca Alta del Manzanares — A1/A2/B1/B2/B3/P/T
//   · P.R. del Sureste                — A…G
//   · P.R. Curso Medio del Guadarrama — Máxima protección / Mejora / Mantenimiento
//   · P.N. Sierra de Guadarrama       — PN / Zona Periférica de Protección
//
// Those schemes aren't comparable at face value, so every zone is mapped to a
// common PROTECTION TIER (1 strict reserve … 6 left to municipal planning) and
// colored by tier — one visual language across the region. The exact,
// park-specific zone (code + official description) stays on each feature and
// shows on click. Data baked to data/cm-protected-zonification.json (CM IDEM
// WFS, EPSG:4326). No harmonized national equivalent exists — this is regional.

const TIERS = {
  1: { color: '#14532d', label: 'Reserva integral / máxima protección', rule: 'Sin edificación.' },
  2: { color: '#16a34a', label: 'Reserva natural / alta protección', rule: 'Protección alta; sin edificación residencial.' },
  3: { color: '#84cc16', label: 'Regeneración / mejora', rule: 'Áreas a regenerar o mejorar; edificación muy restringida.' },
  4: { color: '#ca8a04', label: 'Uso agropecuario / explotación ordenada', rule: 'Uso agropecuario u ordenado; edificación ligada a la explotación.' },
  5: { color: '#f97316', label: 'Periférica de protección / transición', rule: 'Franja de protección o transición del borde.' },
  6: { color: '#2563eb', label: 'A ordenar por planeamiento', rule: 'Su ordenación remite al planeamiento urbanístico municipal.' },
};

function esc(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const styleFor = (t) => ({ color: '#111', weight: 1, fillColor: (TIERS[t] || {}).color || '#999', fillOpacity: 0.5 });

export default {
  id: 'overlay-cm-zoning',
  label: 'Protected-area zoning (CM · PORN/PRUG)',
  group: 'overlay',
  enabled: false,
  legend: '<div><b>Zonificación interna de los espacios protegidos de la Comunidad de Madrid</b> '
    + '(PORN/PRUG): P.R. Cuenca Alta del Manzanares, P.R. del Sureste, P.R. Curso Medio del Guadarrama y '
    + 'P.N. Sierra de Guadarrama. Cada zona se colorea por su <b>intensidad de protección</b> (verde = reserva, '
    + 'sin edificar → azul = a ordenar por el planeamiento). <b>Haz clic</b> en un polígono para ver el parque y '
    + 'su zona oficial exacta. No existe un equivalente nacional armonizado — es una capa regional. Fuente: CM IDEM. '
    + 'Contrastar con el PORN/PRUG vigente.</div>',
  create() {
    const group = L.layerGroup();

    group.addLayer(L.geoJSON(zoning, {
      style: (f) => styleFor(f.properties.tier),
      onEachFeature: (f, lyr) => {
        const p = f.properties;
        const t = TIERS[p.tier] || {};
        lyr.bindPopup(
          `<b>${esc(p.parkName)}</b>`
          + `<div style="font-size:11px;margin-top:4px;max-width:230px"><b>Zona ${esc(p.cd)}</b> — ${esc(p.ds)}</div>`
          + `<div style="font-size:11px;color:#555;margin-top:4px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${t.color};margin-right:5px"></span>${esc(t.label)}: ${esc(t.rule)}</div>`,
          { maxWidth: 260 });
      },
    }));

    // On-map legend (top-right; the left is the panel, bottom-right the constraints card).
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      const el = L.DomUtil.create('div', 'cm-zoning-legend');
      el.style.cssText = 'background:rgba(17,24,39,.94);color:#e5e7eb;padding:10px 12px;border-radius:8px;font:11px/1.5 system-ui;max-width:250px;box-shadow:0 2px 10px rgba(0,0,0,.4)';
      const swatches = Object.entries(TIERS).map(([, t]) =>
        `<div style="margin:1px 0"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${t.color};margin-right:5px"></span>${esc(t.label)}</div>`).join('');
      el.innerHTML = '<b>Espacios protegidos CM</b>'
        + '<div style="color:#9ca3af;margin-bottom:4px">Zonificación PORN/PRUG · intensidad de protección</div>'
        + swatches
        + '<div style="color:#9ca3af;margin-top:5px">Clic en una zona para el parque y su código oficial.</div>';
      L.DomEvent.disableClickPropagation(el);
      return el;
    };
    group.on('add', () => { if (group._map) control.addTo(group._map); });
    group.on('remove', () => control.remove());

    return group;
  },
};
