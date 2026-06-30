import L from 'leaflet';
import { SOURCES } from '../config.js';
import { arcgisExportLayer } from './util/arcgisExport.js';
import { onMapTap } from './util/mapTap.js';

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
// the pixel tolerance resolves to a few metres on the ground. Returns the class
// plus the raw attributes and parcel geometry so the popup can show a richer
// read and the map can highlight the parcel that was hit.
async function identifyAt(map, latlng, signal) {
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
    returnGeometry: 'true',
  });
  const res = await fetch(`${s.url}/identify?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`SIU identify ${res.status}`);
  const data = await res.json();
  const result = data?.results?.[0];
  const attrs = result?.attributes;
  if (!attrs) return null;
  // Prefer the configured field; fall back to any attribute whose value we know.
  const direct = attrs[s.classField];
  const raw = direct != null
    ? direct
    : Object.values(attrs).find((v) => CLASS_COLORS[String(v).toUpperCase()]);
  return {
    cls: raw != null ? String(raw).toUpperCase() : null,
    attrs,
    layerName: result.layerName,
    geometry: result.geometry,
  };
}

// Escape attribute text — values come straight from the remote service.
function esc(v) {
  return String(v).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

// System / geometry fields we never want to surface in the popup.
const HIDE_ATTR = /objectid|globalid|^fid$|shape/i;

// Render up to a handful of the service's own attributes (municipality, planning
// figure, dates…). Field names arrive as human-readable Spanish aliases, so we
// show them as-is rather than hardcoding a schema we can't see.
function attrRows(attrs, cls) {
  if (!attrs) return '';
  const rows = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (rows.length >= 6) break;
    if (v == null || HIDE_ATTR.test(k)) continue;
    const val = String(v).trim();
    if (!val || val.toLowerCase() === 'null') continue;
    if (val.toUpperCase() === cls) continue; // already shown as the class
    rows.push(`<div style="margin-top:2px"><span style="color:#888">${esc(k)}:</span> ${esc(val)}</div>`);
  }
  return rows.length ? `<div style="margin-top:6px;border-top:1px solid #eee;padding-top:5px">${rows.join('')}</div>` : '';
}

// Convert an Esri polygon (rings of [x, y]) to Leaflet [lat, lng] rings. We
// request sr=4326, but fall back to un-projecting Web-Mercator coordinates if
// the service ever returns them.
function esriRingsToLatLngs(geometry) {
  const rings = geometry?.rings;
  if (!Array.isArray(rings)) return null;
  const toLatLng = ([x, y]) => {
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      const p = L.CRS.EPSG3857.unproject(L.point(x, y));
      return [p.lat, p.lng];
    }
    return [y, x];
  };
  return rings.map((ring) => ring.map(toLatLng));
}

function swatch(rgb) {
  return `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:rgb(${rgb.join(',')});vertical-align:middle"></span>`;
}

function popupHtml(info, latlng) {
  const coords = `<span style="color:#888">${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}</span>`;
  const cls = info?.cls;
  if (!cls) {
    return `No land classification here<br>${coords}`;
  }
  const rgb = CLASS_COLORS[cls] || [120, 120, 120];
  const note = CLASS_NOTE[cls];
  return `
    <b>Land classification</b>
    ${info.layerName ? `<div style="color:#888;font-size:11px">${esc(info.layerName)}</div>` : ''}
    <div style="margin-top:3px">${swatch(rgb)} ${cls}</div>
    ${note ? `<div style="margin-top:4px;color:#555">${note}</div>` : ''}
    ${attrRows(info.attrs, cls)}
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

    let highlight = null; // outline of the parcel under the last tap
    let reqId = 0;        // guards against out-of-order identify responses
    let controller = null;

    const clearHighlight = () => {
      if (highlight) { map.removeLayer(highlight); highlight = null; }
    };

    // Tap/click-to-query the planning class, active only while this layer is on.
    // onMapTap handles single taps on iOS (where map 'click' needs a double tap
    // when a custom tile layer is present — Leaflet #8236) plus desktop clicks.
    const onTap = async (e) => {
      const id = ++reqId;
      controller?.abort();
      controller = new AbortController();
      clearHighlight();
      // closeOnClick:false so the "ghost" click a touch fires right after the
      // tap doesn't immediately dismiss the popup we just opened. A new tap
      // replaces it (autoClose), and the × button still closes it.
      const popup = L.popup({ maxWidth: 280, closeOnClick: false })
        .setLatLng(e.latlng)
        .setContent('Reading land classification…')
        .openOn(map);
      try {
        const info = await identifyAt(map, e.latlng, controller.signal);
        if (id !== reqId) return; // a newer tap superseded this one
        popup.setContent(popupHtml(info, e.latlng));
        const latlngs = info?.cls && esriRingsToLatLngs(info.geometry);
        if (latlngs) {
          const rgb = CLASS_COLORS[info.cls] || [120, 120, 120];
          highlight = L.polygon(latlngs, {
            color: `rgb(${rgb.join(',')})`,
            weight: 3, opacity: 0.95, fillOpacity: 0.15, interactive: false,
          }).addTo(map);
        }
      } catch (err) {
        if (err.name === 'AbortError' || id !== reqId) return;
        popup.setContent(`Lookup failed<br><span style="color:#888">${esc(err.message)}</span>`);
      }
    };

    let unbind = null;
    const onPopupClose = () => clearHighlight();
    group.on('add', () => { unbind = onMapTap(map, onTap); map.on('popupclose', onPopupClose); });
    group.on('remove', () => {
      unbind?.(); unbind = null;
      controller?.abort();
      map.off('popupclose', onPopupClose);
      clearHighlight();
      map.closePopup();
    });
    return group;
  },
};
