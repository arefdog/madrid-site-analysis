import L from 'leaflet';
import { getBoaloRings } from './masterplan.js';
import { resolveFeatures, bboxOfRings } from './siteFeaturesData.js';

// Site features view — existing trees & rock outcrops. Positions are
// fractional within the parcel and resolved against the REAL Catastro geometry
// at load time, so they always render on the true parcel. This is the layer
// that shows WHAT the micro-parcel engine avoids (tree stands, outcrops, the
// vaguada) and anchors premium lots against. Source is a VISUAL ESTIMATE from
// a satellite screenshot — to be replaced by the LiDAR CHM + PNOA-ortho fusion
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
  legend: '<div><b>Árboles y roca existentes</b> leídos de imagen aérea (estimación visual — sustituir por fusión LiDAR CHM + orto PNOA e inventario de arbolado). Posiciones relativas a la parcela, resueltas sobre la <b>geometría catastral real</b>. <b>Verde</b> = arbolado a conservar, <b>gris</b> = afloramiento granítico (sin excavación), <b>azul</b> = vaguada/posible cauce. El plan de píxeles <b>evita</b> estos y da <b>prima de emplazamiento</b> a las villas junto a ellos.</div>',
  create() {
    const group = L.layerGroup();
    (async () => {
      const rings = await getBoaloRings();
      if (!rings.length) return;
      const feats = resolveFeatures(bboxOfRings(rings));
      for (const f of feats) {
        const st = STYLE[f.kind] ?? STYLE.tree;
        group.addLayer(L.polygon(f.ring, st).bindPopup(
          `<b>${NAME[f.kind] ?? f.kind}</b> — ${f.name}`
          + `<br><span style="font-size:11px;color:#555">${f.note}</span>`
          + `<br>Función: <b>${ROLE[f.role] ?? f.role}</b>`
          + '<br><span style="font-size:11px;color:#888">Fuente: estimación visual sobre imagen aérea, posición relativa a la parcela.</span>'));
      }
    })();
    return group;
  },
};
