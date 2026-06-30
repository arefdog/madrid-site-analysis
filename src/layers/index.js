// Layer registry — the single source of truth for what appears on the map.
//
// To add a new layer:
//   1. Create a module in this folder that default-exports a layer descriptor
//      (or an array of them). Shape:
//        {
//          id:      unique string,
//          label:   string shown in the panel,
//          group:   'base' | 'overlay' | 'workspace',
//          enabled: boolean (on by default?),
//          legend?: HTML string rendered under the toggle,
//          create(map): returns a Leaflet layer (may load data async into a group),
//        }
//   2. Import it below and add it to the array.
// That's it — the panel and toggle wiring are generated automatically.

import base from './base.js';
import purchasingPower from './purchasingPower.js';
import transport from './transport.js';
import topography from './topography.js';
import cadastre from './cadastre.js';
import landClass from './landClass.js';
import landcover from './landcover.js';
import plots from './plots.js';

export const layers = [
  base,
  purchasingPower,
  transport,
  topography,
  cadastre,
  landClass,
  landcover,
  plots,
].flat();

export const GROUPS = [
  { id: 'base', title: 'Base map' },
  { id: 'overlay', title: 'Overlays' },
  { id: 'workspace', title: 'Workspace' },
];
