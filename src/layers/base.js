import L from 'leaflet';
import { SOURCES } from '../config.js';

// Base maps are mutually exclusive (radio). Generated from config tile sources.
const tile = (key) => {
  const t = SOURCES.tiles[key];
  return L.tileLayer(t.url, { attribution: t.attribution, maxZoom: t.maxZoom });
};

export default [
  { id: 'base-light', label: 'Street (light)', group: 'base', enabled: true, create: () => tile('light') },
  { id: 'base-topo', label: 'Topography / terrain', group: 'base', enabled: false, create: () => tile('topo') },
  { id: 'base-sat', label: 'Satellite', group: 'base', enabled: false, create: () => tile('satellite') },
];
