import L from 'leaflet';
import { SOURCES, featureName } from '../config.js';
import income from '../../data/income.json';

// Choropleth of average household income across municipalities / city districts.
// Data lives in data/income.json (currently placeholder — see file meta).

function color(v) {
  return v > 58000 ? '#7a0177'
    : v > 48000 ? '#dd3497'
    : v > 40000 ? '#fa9fb5'
    : v > 32000 ? '#fbb4b9'
    : '#fde0dd';
}

async function loadBoundaries() {
  for (const url of SOURCES.boundaries) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* try next source */ }
  }
  throw new Error('No boundary GeoJSON source reachable');
}

export default {
  id: 'overlay-pp',
  label: 'Purchasing power',
  group: 'overlay',
  enabled: true,
  legend: `
    <div class="scale">
      <span style="background:#fde0dd"></span><span style="background:#fbb4b9"></span>
      <span style="background:#fa9fb5"></span><span style="background:#dd3497"></span><span style="background:#7a0177"></span>
    </div>
    <div class="ends"><span>lower</span><span>higher avg. income</span></div>`,
  // Returns a LayerGroup immediately and fills it once boundaries load, so the
  // toggle works without awaiting the network.
  create() {
    const group = L.layerGroup();
    loadBoundaries().then((geo) => {
      const geojson = L.geoJSON(geo, {
        style: (f) => {
          const v = income.values[featureName(f.properties)];
          return { fillColor: v ? color(v) : '#555', weight: 1, color: '#fff', fillOpacity: 0.55 };
        },
        onEachFeature: (f, layer) => {
          const name = featureName(f.properties);
          const v = income.values[name];
          layer.bindPopup(
            `<b>${name}</b><br>Income index: ${v ? '€' + v.toLocaleString() : 'n/a'}` +
            `<br><i>add notes / scores here</i>`
          );
          layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.8 }));
          layer.on('mouseout', () => geojson.resetStyle(layer));
        },
      });
      group.addLayer(geojson);
    }).catch((e) => console.warn('[purchasing-power]', e.message));
    return group;
  },
};
