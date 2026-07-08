// Export utilities for the micro-parcel masterplan: coordinate conversion to
// the official Spanish CRS (ETRS89 / UTM zone 30N, EPSG:25830 — ETRS89 and
// WGS84 differ by centimetres, ignored here), a minimal DXF writer for CAD
// handoff, GeoJSON for GIS, and the CSV area schedule (cuadro de superficies).

const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const LON0 = (-3 * Math.PI) / 180; // UTM zone 30 central meridian

// WGS84 lat/lng (degrees) → UTM 30N [easting, northing] in metres.
export function toUtm30(lat, lng) {
  const e2 = F * (2 - F);
  const ep2 = e2 / (1 - e2);
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const N = A / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const Am = Math.cos(phi) * (lam - LON0);
  const M = A * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * phi
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * phi)
  );
  const E = K0 * N * (Am + ((1 - T + C) * Am ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Am ** 5) / 120) + 500000;
  const Nn = K0 * (M + N * Math.tan(phi) * ((Am * Am) / 2 + ((5 - T + 9 * C + 4 * C * C) * Am ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Am ** 6) / 720));
  return [E, Nn];
}

export function download(name, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// --- GeoJSON (WGS84 per spec; UTM coordinates included as properties). -------

export function cellsToGeoJSON(cells, rings, meta) {
  const features = cells.map((cell, i) => ({
    type: 'Feature',
    properties: {
      ref: `MP-${String(i + 1).padStart(4, '0')}`,
      kind: cell.kind || 'parcel',
      zone: cell.zoneId,
      program: cell.programId || null,
      lot: cell.lotId,
      unit_type: cell.lotType || null,
      protected: !!cell.protected,
      area_m2: Math.round(cell.area),
      elev_m: cell.elev != null ? Math.round(cell.elev) : null,
      slope_deg: cell.slope != null ? Math.round(cell.slope * 10) / 10 : null,
      grade_pct: cell.grade != null ? Math.round(cell.grade * 10) / 10 : null,
      buildability: cell.score != null ? Math.round(cell.score) : null,
    },
    geometry: { type: 'Polygon', coordinates: [cell.poly.map(([lat, lng]) => [lng, lat])] },
  }));
  features.push({
    type: 'Feature',
    properties: { kind: 'site-boundary', ...meta },
    geometry: { type: 'MultiPolygon', coordinates: rings.map((ring) => [ring.map(([lat, lng]) => [lng, lat])]) },
  });
  return JSON.stringify({ type: 'FeatureCollection', crs_note: 'WGS84 (lng,lat); official CRS export in the DXF (ETRS89/UTM30N)', features });
}

// --- DXF (AutoCAD 2000 ASCII, LWPOLYLINE entities, ETRS89/UTM30N metres). ----

function dxfPolyline(layer, points) {
  const head = ['0', 'LWPOLYLINE', '8', layer, '90', String(points.length), '70', '1'];
  const verts = points.flatMap(([e, n]) => ['10', e.toFixed(3), '20', n.toFixed(3)]);
  return head.concat(verts);
}

export function cellsToDXF(cells, lots, rings) {
  const lines = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES'];
  for (const ring of rings) {
    lines.push(...dxfPolyline('SITE_BOUNDARY', ring.map(([lat, lng]) => toUtm30(lat, lng))));
  }
  for (const cell of cells) {
    const layer = cell.kind ? `CIRC_${cell.kind.toUpperCase()}` : `ZONE_${cell.zoneId}`;
    lines.push(...dxfPolyline(layer, cell.poly.map(([lat, lng]) => toUtm30(lat, lng))));
  }
  for (const lot of lots) {
    const layer = lot.type ? `LOTS_${lot.type.toUpperCase()}` : 'LOTS';
    lines.push(...dxfPolyline(layer, lot.outline.map(([lat, lng]) => toUtm30(lat, lng))));
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

// --- CSV cuadro de superficies. ----------------------------------------------

export function ledgerToCSV(ledger) {
  const rows = [['concepto', 'superficie_m2', 'pct_suelo', 'edificabilidad_m2']];
  for (const row of ledger.rows) {
    rows.push([row.name, Math.round(row.area), (row.pct * 100).toFixed(1) + '%', row.edif ? Math.round(row.edif) : '']);
  }
  rows.push([]);
  rows.push(['total suelo', Math.round(ledger.siteArea), '100%', Math.round(ledger.totalEdif)]);
  if (ledger.viario) {
    rows.push(['vial principal', `${Math.round(ledger.viario.roadLenM)} m`,
      `pdte media ${ledger.viario.roadAvgGrade.toFixed(1)}%`, `max ${ledger.viario.roadMaxGrade.toFixed(1)}%`]);
    rows.push(['calles residenciales', '', '', `max ${ledger.viario.streetMaxGrade.toFixed(1)}%`]);
  }
  if (ledger.program?.length) {
    rows.push([]);
    rows.push(['programa v0.4', 'fase', 'objetivo', 'logrado', 'estado']);
    for (const p of ledger.program) {
      const target = p.targetUnits != null ? `${p.targetUnits} uds / ${Math.round(p.targetM2)} m2` : `${Math.round(p.targetM2)} m2`;
      const achieved = p.targetUnits != null ? `${p.achievedUnits} uds / ${Math.round(p.achievedM2)} m2` : `${Math.round(p.achievedM2)} m2`;
      rows.push([p.name, p.phase, target, achieved, p.ok ? 'CUMPLE' : 'PARCIAL']);
    }
  }
  rows.push([]);
  for (const check of ledger.checks) {
    rows.push([check.label, check.value, check.required, check.ok ? 'CUMPLE' : 'NO CUMPLE']);
  }
  return rows.map((r) => r.join(';')).join('\n');
}
