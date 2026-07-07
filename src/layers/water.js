import L from 'leaflet';
import { SOURCES } from '../config.js';

// Official water cartography, two toggles:
//  - Hydrography: the river network + surface water bodies of the river-basin
//    plans (MITECO, Planes Hidrológicos 2022-2027) — the same cartography the
//    water-planning institutions (Confederación Hidrográfica del Tajo) work
//    from. Shows where water runs even when it isn't visible on site.
//  - Flood zones: MITECO's SNCZI modelled flood extents (T100/T500) — the
//    official dataset behind "zona inundable" build constraints on a plot.

function wms(source, opacity) {
  return L.tileLayer.wms(source.url, {
    layers: source.layers,
    format: 'image/png',
    transparent: true,
    version: '1.3.0',
    attribution: source.attribution,
    opacity,
  });
}

export default [
  {
    id: 'overlay-water',
    label: 'Water Bodies',
    group: 'overlay',
    enabled: false,
    legend: `<div>Rivers, streams (arroyos) and reservoirs from the official river-basin plans (MITECO / Confederación Hidrográfica — the cartography the water authorities plan with). Streams shown here carry legal protection setbacks even if dry on site.</div>`,
    create() {
      return L.layerGroup([
        wms(SOURCES.wms.hydroWaterBodies, 0.85),
        wms(SOURCES.wms.hydroNetwork, 0.9),
      ]);
    },
  },
  {
    id: 'overlay-flood',
    label: 'Flood Zones',
    group: 'overlay',
    enabled: false,
    legend: `<div>Official MITECO flood mapping: modelled extents for 100- and 500-year floods. Overlap with a parcel usually means build restrictions — check before committing to a site.</div>`,
    create() {
      return wms(SOURCES.wms.floodZones, 0.65);
    },
  },
];
