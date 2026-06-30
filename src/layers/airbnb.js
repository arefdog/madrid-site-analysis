import L from 'leaflet';
import dataUrl from '../../data/airbnb-madrid.geojson?url';

// Short-term-rental performance (Inside Airbnb, Madrid). Choropleth by estimated
// annual revenue per listing — the STR "money signal" for serviced/STR plays.
// Madrid municipality only (that's where the data exists). Estimates, not booked
// figures. Regenerate with `npm run data:airbnb`.

// €/yr estimated revenue per listing.
function color(v) {
  return v == null ? '#555'
    : v > 16000 ? '#084081'
    : v > 13000 ? '#0868ac'
    : v > 10000 ? '#2b8cbe'
    : v > 7000 ? '#7bccc4'
    : '#ccebc5';
}

export default {
  id: 'overlay-airbnb',
  label: 'Short-term rental (Airbnb)',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    fetch(dataUrl)
      .then((r) => r.json())
      .then((geo) => {
        const gj = L.geoJSON(geo, {
          style: (f) => ({
            fillColor: color(f.properties.estAnnualRevenue),
            weight: 1, color: '#fff', fillOpacity: 0.6,
          }),
          onEachFeature: (f, layer) => {
            const p = f.properties;
            const eur = (n) => (n == null ? 'n/a' : '€' + n.toLocaleString());
            layer.bindPopup(
              `<b>${p.neighbourhood}</b> <span style="color:#888">${p.district}</span><br>` +
              `Est. revenue/listing: <b>${eur(p.estAnnualRevenue)}/yr</b><br>` +
              `Median nightly: ${eur(p.medianPrice)}<br>` +
              `Est. occupancy: ${p.estOccupancy == null ? 'n/a' : p.estOccupancy + '%'}<br>` +
              `Active listings: ${p.listings}`
            );
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.85 }));
            layer.on('mouseout', () => gj.resetStyle(layer));
          },
        });
        group.addLayer(gj);
      })
      .catch((e) => console.warn('[airbnb]', e.message));
    return group;
  },
};
