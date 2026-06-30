import L from 'leaflet';
import hotels from '../../data/hotels.json';
import muniUrl from '../../data/madrid-municipios.geojson?url';

// Hotel concentration per municipality (OpenStreetMap). Choropleth by hotel
// count — a proxy for tourism/business demand. Star breakdown in the popup.
// Regenerate with `npm run data:hotels`.

function color(c) {
  return !c ? '#3a3f49'
    : c > 50 ? '#b30000'
    : c > 25 ? '#e34a33'
    : c > 10 ? '#fc8d59'
    : c > 5 ? '#fdbb84'
    : '#fdd49e';
}

function starsLine(stars) {
  const parts = [5, 4, 3, 2, 1].filter((s) => stars[s]).map((s) => `${s}★ ${stars[s]}`);
  return parts.length ? parts.join(' · ') : 'no star ratings tagged';
}

export default {
  id: 'overlay-hotels',
  label: 'Hotel concentration',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    fetch(muniUrl)
      .then((r) => r.json())
      .then((geo) => {
        const gj = L.geoJSON(geo, {
          style: (f) => {
            const c = hotels.values[f.properties.code]?.count || 0;
            return { fillColor: color(c), weight: 1, color: '#fff', fillOpacity: c ? 0.6 : 0.25 };
          },
          onEachFeature: (f, layer) => {
            const v = hotels.values[f.properties.code];
            layer.bindPopup(
              `<b>${f.properties.name}</b><br>` +
              `Hotels: <b>${v?.count || 0}</b><br>` +
              `<span style="color:#888">${v ? starsLine(v.stars) : 'no hotels'}</span>`
            );
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.85 }));
            layer.on('mouseout', () => gj.resetStyle(layer));
          },
        });
        group.addLayer(gj);
      })
      .catch((e) => console.warn('[hotels]', e.message));
    return group;
  },
};
