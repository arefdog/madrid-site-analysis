import L from 'leaflet';
import { SOURCES } from '../config.js';
import { arcgisExportLayer } from './util/arcgisExport.js';

// Clasificación del suelo (SIU) — formal planning classification that gates
// development. We override the source symbology (via ArcGIS dynamicLayers) into
// three clearly distinct hues: red = urbano, blue = urbanizable, green = rústico.
// Clicking the map runs an ArcGIS `identify` to read the class at that point.

// Field value -> display colour. Exported so the legend stays in sync.
export const CLASS_COLORS = {
  'SUELO URBANO': [178, 24, 43],
  'SUELO URBANO NO CONSOLIDADO': [239, 138, 98],
  'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': [33, 102, 172],
  'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': [103, 169, 207],
  'SUELO NO URBANIZABLE': [26, 152, 80],
  'SISTEMAS GENERALES': [150, 150, 150],
};

// One-line buildability read per class, surfaced in the click popup.
const CLASS_NOTE = {
  'SUELO URBANO': 'Developed urban land — built or directly buildable.',
  'SUELO URBANO NO CONSOLIDADO': 'Urban, pending development/redevelopment.',
  'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': 'Earmarked for development — most actionable greenfield.',
  'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': 'Developable in principle, no sector plan yet.',
  'SUELO NO URBANIZABLE': 'Rural / protected — generally not developable.',
  'SISTEMAS GENERALES': 'Public infrastructure & systems.',
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

// ArcGIS `identify` at a point. Builds a small map extent around the click so
// the pixel tolerance resolves to a few metres on the ground.
async function identifyClass(map, latlng) {
  const s = SOURCES.arcgis.landClass;
  const d = 0.0009; // ~100 m half-extent in degrees
  const params = new URLSearchParams({
    f: 'json',
    geometry: `${latlng.lng},${latlng.lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'top:0',
    tolerance: '3',
    mapExtent: [latlng.lng - d, latlng.lat - d, latlng.lng + d, latlng.lat + d].join(','),
    imageDisplay: '256,256,96',
    returnGeometry: 'false',
  });
  const res = await fetch(`${s.url}/identify?${params.toString()}`);
  if (!res.ok) throw new Error(`SIU identify ${res.status}`);
  const data = await res.json();
  const attrs = data?.results?.[0]?.attributes;
  if (!attrs) return null;
  // Prefer the configured field; fall back to any attribute whose value we know.
  const direct = attrs[s.classField];
  if (direct != null) return String(direct).toUpperCase();
  const known = Object.values(attrs).find((v) => CLASS_COLORS[String(v).toUpperCase()]);
  return known ? String(known).toUpperCase() : null;
}

function swatch(rgb) {
  return `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:rgb(${rgb.join(',')});vertical-align:middle"></span>`;
}

function popupHtml(cls, latlng) {
  const coords = `<span style="color:#888">${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</span>`;
  if (!cls) {
    return `No land classification here<br>${coords}`;
  }
  const rgb = CLASS_COLORS[cls] || [120, 120, 120];
  const note = CLASS_NOTE[cls];
  return `
    <b>Land classification</b><br>
    <div style="margin-top:3px">${swatch(rgb)} ${cls}</div>
    ${note ? `<div style="margin-top:4px;color:#555">${note}</div>` : ''}
    <div style="margin-top:6px">${coords}</div>`;
}

export default {
  id: 'overlay-landclass',
  label: 'Land classification (urbano / urbanizable / rústico)',
  group: 'overlay',
  enabled: false,
  create(map) {
    const s = SOURCES.arcgis.landClass;
    const tiles = arcgisExportLayer(s.url, { dynamicLayers, attribution: s.attribution, opacity: 0.6 });
    const group = L.layerGroup([tiles]);

    // Click-to-query the planning class, active only while this layer is on.
    const onClick = async (e) => {
      const popup = L.popup({ maxWidth: 260 })
        .setLatLng(e.latlng)
        .setContent('Reading land classification…')
        .openOn(map);
      try {
        popup.setContent(popupHtml(await identifyClass(map, e.latlng), e.latlng));
      } catch (err) {
        popup.setContent(`Lookup failed<br><span style="color:#888">${err.message}</span>`);
      }
    };

    group.on('add', () => map.on('click', onClick));
    group.on('remove', () => { map.off('click', onClick); map.closePopup(); });
    return group;
  },
};
