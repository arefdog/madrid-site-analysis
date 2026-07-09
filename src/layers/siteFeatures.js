import L from 'leaflet';
import { siteFeatures } from './siteFeaturesData.js';

// Site features view — existing trees & rock outcrops read from aerial imagery
// (data/boalo-features.geojson). This is the layer that shows WHAT the
// micro-parcel engine now avoids (tree stands, granite outcrops, the vaguada)
// and anchors premium lots against. Source is a VISUAL ESTIMATE from a
// satellite screenshot — to be replaced by the LiDAR CHM + PNOA-ortho fusion
// and the field inventario de arbolado.

const STYLE = {
  tree: { color: '#166534', fillColor: '#22c55e', fillOpacity: 0.4, weight: 1.5 },
  outcrop: { color: '#57534e', fillColor: '#a8a29e', fillOpacity: 0.5, weight: 1.5 },
  watercourse: { color: '#0369a1', fillColor: '#38bdf8', fillOpacity: 0.35, weight: 1.5, dashArray: '4 3' },
};
const NAME = { tree: 'Arbolado existente', outcrop: 'Afloramiento granítico', watercourse: 'Vaguada / posible cauce' };
const ROLE = { avoid: 'sin desarrollo', anchor: 'emplazamiento premium adyacente', both: 'conservar + emplazar villas al borde' };

export default {
  id: 'overlay-site-features',
  label: '🌳 Site features (trees / rock)',
  group: 'overlay',
  enabled: false,
  legend: '<div><b>Árboles y roca existentes</b> leídos de imagen aérea (estimación visual — sustituir por fusión LiDAR CHM + orto PNOA e inventario de arbolado). <b>Verde</b> = arbolado a conservar, <b>gris</b> = afloramiento granítico (sin excavación), <b>azul</b> = vaguada/posible cauce. El plan de píxeles ahora <b>evita</b> estos y da <b>prima de emplazamiento</b> a las villas junto a ellos (Echo en el hombro granítico, Duo en la línea de encinas).</div>',
  create() {
    const group = L.layerGroup();
    for (const f of siteFeatures.features ?? []) {
      const kind = f.properties?.kind ?? 'tree';
      const st = STYLE[kind] ?? STYLE.tree;
      const rings = (f.geometry?.coordinates ?? []).map((r) => r.map(([lng, lat]) => [lat, lng]));
      group.addLayer(L.polygon(rings, st).bindPopup(
        `<b>${NAME[kind] ?? kind}</b> — ${f.properties?.name ?? ''}`
        + `<br><span style="font-size:11px;color:#555">${f.properties?.note ?? ''}</span>`
        + `<br>Función: <b>${ROLE[f.properties?.role] ?? f.properties?.role}</b>`
        + '<br><span style="font-size:11px;color:#888">Fuente: estimación visual sobre imagen aérea.</span>'));
    }
    return group;
  },
};
