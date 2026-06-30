import L from 'leaflet';
import { SOURCES } from '../config.js';

// Topography layer: hillshade tiles for visual relief, plus click-to-query
// point elevation (EU-DEM 25m). Useful for buildability / grading screening.
// Future: derive classified slope bands from the DEM (see README roadmap).

async function queryElevation(lat, lng) {
  const url = SOURCES.elevation.replace('{lat}', lat.toFixed(5)).replace('{lng}', lng.toFixed(5));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`elevation API ${res.status}`);
  const data = await res.json();
  const v = data?.results?.[0]?.elevation;
  if (v == null) throw new Error('no elevation returned');
  return v;
}

export default {
  id: 'overlay-topo',
  label: 'Topography (hillshade + elevation)',
  group: 'overlay',
  enabled: false,
  legend: `<div>Shaded relief. <b>Click the map</b> to read ground elevation (m).</div>`,
  create(map) {
    const t = SOURCES.tiles.hillshade;
    const hillshade = L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom, opacity: 0.55 });
    const group = L.layerGroup([hillshade]);

    // Click-to-query elevation, active only while this layer is on the map.
    const onClick = async (e) => {
      const { lat, lng } = e.latlng;
      const popup = L.popup({ offset: [0, -2] })
        .setLatLng(e.latlng)
        .setContent('Reading elevation…')
        .openOn(map);
      try {
        const m = await queryElevation(lat, lng);
        popup.setContent(`<b>Elevation</b><br>${m.toFixed(0)} m a.s.l.<br><span style="color:#888">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`);
      } catch (err) {
        popup.setContent(`Elevation unavailable<br><span style="color:#888">${err.message}</span>`);
      }
    };

    group.on('add', () => map.on('click', onClick));
    group.on('remove', () => { map.off('click', onClick); map.closePopup(); });

    return group;
  },
};
