import L from 'leaflet';
import { SOURCES } from '../config.js';

// Land use / land cover (Copernicus CORINE 2018). Shows what each area
// currently is — continuous urban fabric, industrial, agricultural, forest —
// a fast read on greenfield availability vs. already-built land.
export default {
  id: 'overlay-landcover',
  label: 'Land use / land cover (CORINE)',
  group: 'overlay',
  enabled: false,
  legend: `<div>Red = built/urban · yellow = agricultural · green = forest/natural. Indicates greenfield vs. developed land.</div>`,
  create() {
    const w = SOURCES.wms.landcover;
    return L.tileLayer.wms(w.url, {
      layers: w.layers,
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      attribution: w.attribution,
      opacity: 0.5,
    });
  },
};
