import L from 'leaflet';
import scores from '../../data/scores.json';
import muniUrl from '../../data/madrid-municipios.geojson?url';

// Attractiveness Score — composite 0–100 per municipality, weighted for a
// luxury wellness retreat + branded villas thesis. See scripts/build-scores.mjs.

function color(s) {
  return s == null ? '#3a3f49'
    : s > 50 ? '#00441b'
    : s > 45 ? '#238b45'
    : s > 40 ? '#66c2a4'
    : s > 35 ? '#b2e2af'
    : s > 30 ? '#edf8e9'
    : '#f7fcf5';
}

const bar = (label, v) =>
  `<div style="display:flex;align-items:center;gap:6px;margin:1px 0">
     <span style="width:74px;color:#555">${label}</span>
     <span style="flex:1;height:6px;background:#eee;border-radius:3px;overflow:hidden">
       <span style="display:block;height:100%;width:${v}%;background:#238b45"></span></span>
     <span style="width:22px;text-align:right;color:#555">${v}</span>
   </div>`;

export default {
  id: 'overlay-score',
  label: 'Attractiveness score (wellness villas)',
  group: 'overlay',
  enabled: true,
  create() {
    const group = L.layerGroup();
    fetch(muniUrl)
      .then((r) => r.json())
      .then((geo) => {
        const gj = L.geoJSON(geo, {
          style: (f) => {
            const s = scores.values[f.properties.code]?.score;
            return { fillColor: color(s), weight: 1, color: '#fff', fillOpacity: s == null ? 0.2 : 0.62 };
          },
          onEachFeature: (f, layer) => {
            const d = scores.values[f.properties.code];
            if (!d) { layer.bindPopup(`<b>${f.properties.name}</b><br>no score`); return; }
            const p = d.parts;
            layer.bindPopup(
              `<b>${f.properties.name}</b> — score <b style="font-size:14px">${d.score}</b>/100<br>` +
              `<div style="margin:4px 0 2px">` +
              bar('Income', p.income) + bar('Nature', p.nature) + bar('Access', p.access) +
              bar('Exclusivity', p.exclusivity) + bar('Premium★', p.premiumHosp) +
              `</div><span style="color:#888">${d.elev} m · ${d.distMadrid} km from centre</span>`
            );
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.85 }));
            layer.on('mouseout', () => gj.resetStyle(layer));
          },
        });
        group.addLayer(gj);
      })
      .catch((e) => console.warn('[scores]', e.message));
    return group;
  },
};
