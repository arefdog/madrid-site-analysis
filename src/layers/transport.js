import L from 'leaflet';
import { SOURCES } from '../config.js';

const overlayTile = (key, opacity) => {
  const t = SOURCES.tiles[key];
  return L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom, opacity });
};

// Rail / metro network overlay. Future: replace with CRTM station GeoJSON +
// walk-time isochrones (see scripts/ roadmap in README).
export default {
  id: 'overlay-transit',
  label: 'Public transport (rail/metro)',
  group: 'overlay',
  enabled: false,
  create: () => overlayTile('transit', 0.9),
};
