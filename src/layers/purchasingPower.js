import L from 'leaflet';
import income from '../../data/income.json';
import muniUrl from '../../data/madrid-municipios.geojson?url';

// Choropleth of net average household income (INE, real data) across the 179
// municipalities of the Comunidad de Madrid. Boundaries and income are both
// vendored in /data (no external runtime dependency) and joined by INE code.
// Regenerate income with `npm run data:income`.

// Thresholds (€/yr, "renta neta media por hogar") spanning the ~26k–96k range.
function color(v) {
  return v > 65000 ? '#7a0177'
    : v > 52000 ? '#dd3497'
    : v > 43000 ? '#fa9fb5'
    : v > 36000 ? '#fbb4b9'
    : '#fde0dd';
}

export default {
  id: 'overlay-pp',
  label: 'Purchasing power',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    fetch(muniUrl)
      .then((r) => r.json())
      .then((geo) => {
        const geojson = L.geoJSON(geo, {
          style: (f) => {
            const v = income.values[f.properties.code];
            return { fillColor: v ? color(v) : '#555', weight: 1, color: '#fff', fillOpacity: 0.55 };
          },
          onEachFeature: (f, layer) => {
            const v = income.values[f.properties.code];
            layer.bindPopup(
              `<b>${f.properties.name}</b><br>` +
              `Avg. household income (${income.meta.year}): ${v ? '€' + v.toLocaleString() : 'n/a'}` +
              `<br><span style="color:#888">INE ${f.properties.code}</span>`
            );
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.8 }));
            layer.on('mouseout', () => geojson.resetStyle(layer));
          },
        });
        group.addLayer(geojson);
      })
      .catch((e) => console.warn('[purchasing-power]', e.message));
    return group;
  },
};
