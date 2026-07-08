// Constraint verification for the Boalo parcel — Node twin of the
// "Constraint check (live)" map layer, for machines with open internet:
//
//   npm run data:constraints            → writes data/constraints-boalo.json
//   npm run data:constraints -- --apply → ALSO patches planning-config.json's
//                                         exclusions.protectionPolygons with
//                                         any protected/SNU polygons the SIU
//                                         returns (the pixel engine excludes
//                                         every cell inside them)
//
// Queries (all official, no keys): SIU land classification (identify at a
// sample grid over the parcel), MITECO ENP + Red Natura 2000 GetFeatureInfo
// (PRCAM membership), CM vías pecuarias, MITECO red hidrográfica (DPH).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sites = JSON.parse(readFileSync(join(root, 'data/sites.json'), 'utf8'));
const boalo = sites.sites.find((s) => s.id === 'boalo-estate');
const APPLY = process.argv.includes('--apply');

const SIU = 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/CLASES_DE_SUELO/MapServer';
const WMS_SOURCES = {
  enp: ['https://wms.mapama.gob.es/sig/Biodiversidad/ENP/wms.aspx'],
  redNatura: [
    'https://wms.mapama.gob.es/sig/Biodiversidad/RedNatura/wms.aspx',
    'https://wms.mapama.gob.es/sig/Biodiversidad/RedNaturaLIC/wms.aspx',
    'https://wms.mapama.gob.es/sig/Biodiversidad/RedNaturaZEPA/wms.aspx',
  ],
  viasPecuarias: [
    'https://idem.madrid.org/geosgis/services/medio_ambiente/WMS_VIAS_PECUARIAS/MapServer/WmsServer',
    'https://idem.madrid.org/geosgis/services/planea/WMS_VIAS_PECUARIAS/MapServer/WmsServer',
    'https://idem.madrid.org/geosgis/services/medioambiente/VIAS_PECUARIAS/MapServer/WMSServer',
  ],
  hydro: ['https://wms.mapama.gob.es/sig/Agua/PHC/RedHidro2027'],
};

// Parcel footprint (the live layer uses Catastro; here the vendored footprint
// is close enough for point sampling — swap in the WFS ring if you need it).
const rings = [boalo.footprint];
const bbox = rings.flat().reduce((b, [lat, lng]) => ({
  latMin: Math.min(b.latMin, lat), latMax: Math.max(b.latMax, lat),
  lngMin: Math.min(b.lngMin, lng), lngMax: Math.max(b.lngMax, lng),
}), { latMin: 90, latMax: -90, lngMin: 180, lngMax: -180 });
const centroid = [(bbox.latMin + bbox.latMax) / 2, (bbox.lngMin + bbox.lngMax) / 2];

function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const samples = [];
for (let i = 1; i <= 4; i++) {
  for (let j = 1; j <= 4; j++) {
    const lat = bbox.latMin + ((bbox.latMax - bbox.latMin) * i) / 5;
    const lng = bbox.lngMin + ((bbox.lngMax - bbox.lngMin) * j) / 5;
    if (rings.some((ring) => pointInRing(lat, lng, ring))) samples.push([lat, lng]);
  }
}

async function siuIdentify(lat, lng) {
  const d = 0.0009;
  const params = new URLSearchParams({
    f: 'json', geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', sr: '4326',
    layers: 'top:0', tolerance: '3',
    mapExtent: [lng - d, lat - d, lng + d, lat + d].join(','),
    imageDisplay: '256,256,96', returnGeometry: 'true',
  });
  const res = await fetch(`${SIU}/identify?${params}`);
  if (!res.ok) throw new Error(`SIU ${res.status}`);
  return (await res.json())?.results?.[0] ?? null;
}

async function wmsResolve(candidates) {
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}?service=WMS&request=GetCapabilities`);
      if (!res.ok) continue;
      const text = await res.text();
      const names = [...new Set([...text.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1].trim()))]
        .filter((n) => n && !/^WMS/i.test(n));
      if (names.length) return { url, layers: names.slice(0, 6) };
    } catch { /* next */ }
  }
  return null;
}

async function featureInfo(svc, lat, lng, r = 0.002) {
  const layers = svc.layers.join(',');
  const params = new URLSearchParams({
    service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
    layers, query_layers: layers, styles: '', srs: 'EPSG:4326',
    bbox: [lng - r, lat - r, lng + r, lat + r].join(','),
    width: '101', height: '101', x: '50', y: '50',
    feature_count: '10', format: 'image/png', info_format: 'text/plain',
  });
  const res = await fetch(`${svc.url}?${params}`);
  if (!res.ok) throw new Error(`GFI ${res.status}`);
  const text = await res.text();
  const names = [...text.matchAll(/(?:NOMBRE|SITE_?NAME|NOM\w*|DENOMINA\w*)\s*[:=]\s*'?([^'\n;]+)/gi)]
    .map((m) => m[1].trim()).filter((v) => v.length > 3);
  if (!names.length && /=/.test(text) && text.trim().length > 20) return ['(hit sin nombre)'];
  return [...new Set(names)];
}

const report = {
  generated: new Date().toISOString(),
  parcel: boalo.cadastre.refs[0].rc,
  samples: samples.length,
  sources: {},
  protectionPolygons: [],
};

// SIU
try {
  const classCount = {};
  for (const [lat, lng] of samples) {
    const hit = await siuIdentify(lat, lng);
    const cls = String(hit?.attributes?.ClaseSuelo
      ?? Object.values(hit?.attributes ?? {}).find((v) => /SUELO/i.test(String(v)))
      ?? 'SIN DATO').toUpperCase();
    classCount[cls] = (classCount[cls] || 0) + 1;
    if (hit?.geometry?.rings && /NO URBANIZABLE|PROTE/i.test(cls)) {
      for (const ring of hit.geometry.rings) {
        const latlng = ring.map(([x, y]) => [y, x]);
        if (!report.protectionPolygons.some((p) => p.length === latlng.length && p[0][0] === latlng[0][0])) {
          report.protectionPolygons.push(latlng);
        }
      }
    }
  }
  report.sources.siu = { classCount };
  console.log('SIU:', classCount);
} catch (e) {
  report.sources.siu = { error: String(e.message || e) };
  console.warn('SIU failed:', e.message);
}

// WMS point checks
for (const [id, candidates] of Object.entries(WMS_SOURCES)) {
  try {
    const svc = await wmsResolve(candidates);
    if (!svc) throw new Error('no candidate answered');
    const hits = await featureInfo(svc, centroid[0], centroid[1]);
    report.sources[id] = { url: svc.url, layers: svc.layers, hits };
    console.log(`${id}:`, hits.length ? hits.join(' · ') : 'sin afección en el centroide');
  } catch (e) {
    report.sources[id] = { error: String(e.message || e) };
    console.warn(`${id} failed:`, e.message);
  }
}

const out = join(root, 'data/constraints-boalo.json');
writeFileSync(out, JSON.stringify(report, null, 2));
console.log('wrote', out);

if (APPLY && report.protectionPolygons.length) {
  const cfgPath = join(root, 'data/planning-config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  cfg.exclusions.protectionPolygons = report.protectionPolygons;
  cfg.exclusions.protectionPolygonsNote =
    `Polígonos SNU/protección del SIU (identify, ${report.generated.slice(0, 10)}) — vía scripts/fetch-constraints.mjs --apply. Contrastar con la ficha NNSS.`;
  cfg.exclusions.status = 'verified-service';
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log(`applied ${report.protectionPolygons.length} protection polygons to planning-config.json`);
} else if (APPLY) {
  console.log('nothing to apply (no protected/SNU polygons returned)');
}
