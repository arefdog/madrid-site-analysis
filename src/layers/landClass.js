import { SOURCES } from '../config.js';
import { arcgisExportLayer } from './util/arcgisExport.js';

// Clasificación del suelo (SIU) — formal planning classification that gates
// development. We override the source symbology (via ArcGIS dynamicLayers) into
// three clearly distinct hues: red = urbano, blue = urbanizable, green = rústico.

// Field value -> display colour. Exported so the legend stays in sync.
export const CLASS_COLORS = {
  'SUELO URBANO': [178, 24, 43],
  'SUELO URBANO NO CONSOLIDADO': [239, 138, 98],
  'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': [33, 102, 172],
  'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': [103, 169, 207],
  'SUELO NO URBANIZABLE': [26, 152, 80],
  'SISTEMAS GENERALES': [150, 150, 150],
};

const renderer = {
  type: 'uniqueValue',
  field1: 'ClaseSuelo',
  uniqueValueInfos: Object.entries(CLASS_COLORS).map(([value, rgb]) => ({
    value,
    symbol: { type: 'esriSFS', style: 'esriSFSSolid', color: [...rgb, 255] },
  })),
};

const dynamicLayers = [
  { id: 0, source: { type: 'mapLayer', mapLayerId: 0 }, drawingInfo: { renderer } },
];

export default {
  id: 'overlay-landclass',
  label: 'Land classification (urbano / urbanizable / rústico)',
  group: 'overlay',
  enabled: false,
  create() {
    const s = SOURCES.arcgis.landClass;
    return arcgisExportLayer(s.url, { dynamicLayers, attribution: s.attribution, opacity: 0.6 });
  },
};
