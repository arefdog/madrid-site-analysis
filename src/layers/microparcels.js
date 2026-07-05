import L from 'leaflet';
import sitesData from '../../data/sites.json';

// Micro-parcel subdivision v3: a continuous ~1000-cell master grid that covers
// 100% of the Boalo estate. Each cell is a real polygon (~70.5 m²) clipped to
// the site footprint, so edge parcels follow the cadastral boundary exactly.
// Cells are the atomic sale/planning unit — adjacent cells combine freely into
// larger lots, which is what gives the masterplan its layout flexibility.
//
// Per-cell attributes: zone (from the masterplan band model), buildability
// score 0–100 (terrain + access + zone constraints), distance to the trail
// spine, and interpolated elevation (one batched EU-DEM request; graceful
// fallback to terrain-agnostic scoring if the API is unreachable).

const SITES = Object.fromEntries(sitesData.sites.map((s) => [s.id, s]));
const BOALO = SITES['boalo-estate'];

const TARGET_PARCELS = 1000;
const M_PER_DEG_LAT = 111320;

const ZONES = {
  Z1: { color: '#1e40af', name: 'Hotel core', type: 'development' },
  Z2: { color: '#ea580c', name: 'Residences', type: 'development' },
  Z3: { color: '#be185d', name: 'VPP village', type: 'development' },
  Z4: { color: '#b8860b', name: 'Equestrian', type: 'development' },
  Z5: { color: '#86efac', name: 'Commons / dehesa', type: 'commons' },
};

// Band model (fractions of the site bbox) — mirrors the masterplan layer.
// First matching band wins; anything unmatched is commons.
const ZONE_BANDS = [
  ['Z1', { latFrom: 0.2, latTo: 0.65, lngFrom: 0, lngTo: 0.32 }],
  ['Z3', { latFrom: 0.65, latTo: 1, lngFrom: 0, lngTo: 0.3 }],
  ['Z2', { latFrom: 0.15, latTo: 0.75, lngFrom: 0.32, lngTo: 0.68 }],
  ['Z4', { latFrom: 0.2, latTo: 0.7, lngFrom: 0.68, lngTo: 1 }],
];

const ROAD_STYLE = { color: '#2d3748', fillColor: '#4a5568', fillOpacity: 0.55 };
const PARKING_STYLE = { color: '#5c4a33', fillColor: '#8b7355', fillOpacity: 0.55 };

function bbox(rings) {
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const ring of rings) {
    for (const [lat, lng] of ring) {
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lng < lngMin) lngMin = lng;
      if (lng > lngMax) lngMax = lng;
    }
  }
  return { latMin, latMax, lngMin, lngMax };
}

// ---------------------------------------------------------------------------
// Sutherland–Hodgman clip of a ring against an axis-aligned rect. Rings are
// [lat, lng] arrays. Returns [] when the ring misses the rect entirely.

function clipHalfPlane(ring, inside, intersect) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const cur = ring[i];
    const prev = ring[(i + ring.length - 1) % ring.length];
    const curIn = inside(cur);
    if (curIn !== inside(prev)) out.push(intersect(prev, cur));
    if (curIn) out.push(cur);
  }
  return out;
}

function clipRingToRect(ring, r) {
  let poly = ring;
  const planes = [
    [(p) => p[0] >= r.latMin, 0, r.latMin],
    [(p) => p[0] <= r.latMax, 0, r.latMax],
    [(p) => p[1] >= r.lngMin, 1, r.lngMin],
    [(p) => p[1] <= r.lngMax, 1, r.lngMax],
  ];
  for (const [inside, axis, val] of planes) {
    if (poly.length < 3) return [];
    poly = clipHalfPlane(poly, inside, (a, b) => {
      const t = (val - a[axis]) / (b[axis] - a[axis]);
      return axis === 0
        ? [val, a[1] + t * (b[1] - a[1])]
        : [a[0] + t * (b[0] - a[0]), val];
    });
  }
  return poly.length >= 3 ? poly : [];
}

// Planar shoelace area in m² (fine at parcel scale).
function ringAreaM2(ring, latRef) {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [aLat, aLng] = ring[i];
    const [bLat, bLng] = ring[(i + 1) % ring.length];
    sum += (aLng * mPerDegLng) * (bLat * M_PER_DEG_LAT) - (bLng * mPerDegLng) * (aLat * M_PER_DEG_LAT);
  }
  return Math.abs(sum) / 2;
}

// ---------------------------------------------------------------------------
// Terrain: one batched EU-DEM request for a coarse sample grid, then bilinear
// interpolation for every cell. Returns null if the API is unreachable.

async function fetchElevationGrid(b, n = 6) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lat = b.latMin + ((b.latMax - b.latMin) * i) / (n - 1);
      const lng = b.lngMin + ((b.lngMax - b.lngMin) * j) / (n - 1);
      pts.push(`${lat.toFixed(5)},${lng.toFixed(5)}`);
    }
  }
  try {
    const url = `https://api.opentopodata.org/v1/eudem25m?locations=${pts.join('|')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`elevation API ${res.status}`);
    const data = await res.json();
    const grid = data?.results?.map((r) => r.elevation);
    if (!grid || grid.length !== n * n || grid.some((v) => v == null)) return null;

    return (lat, lng) => {
      const fi = ((lat - b.latMin) / (b.latMax - b.latMin)) * (n - 1);
      const fj = ((lng - b.lngMin) / (b.lngMax - b.lngMin)) * (n - 1);
      const i0 = Math.max(0, Math.min(n - 2, Math.floor(fi)));
      const j0 = Math.max(0, Math.min(n - 2, Math.floor(fj)));
      const ti = fi - i0, tj = fj - j0;
      const v00 = grid[i0 * n + j0], v01 = grid[i0 * n + j0 + 1];
      const v10 = grid[(i0 + 1) * n + j0], v11 = grid[(i0 + 1) * n + j0 + 1];
      return v00 * (1 - ti) * (1 - tj) + v01 * (1 - ti) * tj + v10 * ti * (1 - tj) + v11 * ti * tj;
    };
  } catch (e) {
    console.warn('[microparcels] elevation unavailable, terrain-agnostic scoring:', e.message);
    return null;
  }
}

// Local slope in degrees from the interpolated surface (central differences
// over ~25 m — matches the EU-DEM resolution).
function slopeDeg(elevAt, lat, lng) {
  if (!elevAt) return null;
  const dLat = 25 / M_PER_DEG_LAT;
  const dLng = 25 / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const gLat = (elevAt(lat + dLat, lng) - elevAt(lat - dLat, lng)) / 50;
  const gLng = (elevAt(lat, lng + dLng) - elevAt(lat, lng - dLng)) / 50;
  return (Math.atan(Math.sqrt(gLat ** 2 + gLng ** 2)) * 180) / Math.PI;
}

function distM(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * M_PER_DEG_LAT;
  const dLng = (aLng - bLng) * M_PER_DEG_LAT * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

// Buildability 0–100: terrain, access to the trail spine, zone constraints.
function buildabilityScore(cell, zoneId) {
  let score = 80;
  if (cell.slope != null) {
    if (cell.slope > 20) score -= 25;
    else if (cell.slope > 12) score -= 12;
    else if (cell.slope > 7) score -= 5;
  }
  if (cell.roadDist > 300) score -= 25;
  else if (cell.roadDist > 150) score -= 10;
  else if (cell.roadDist > 100) score -= 5;
  if (zoneId === 'Z1') score += 10;      // access-ready hotel core
  else if (zoneId === 'Z3') score -= 5;  // VPP regulatory envelope
  else if (zoneId === 'Z4') score -= 10; // stables want flat ground
  if (zoneId === 'Z2' && cell.fLng > 0.5) score += 5; // E/SE views
  return Math.max(0, Math.min(100, score));
}

export default {
  id: 'overlay-microparcels',
  label: 'Micro-parcels (1000-unit master grid)',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    if (!BOALO?.footprint) return group;

    const rings = [BOALO.footprint];
    const b = bbox(rings);
    const renderer = L.canvas({ padding: 0.5 }); // ~1000 polygons: canvas, not SVG

    (async () => {
      const elevAt = await fetchElevationGrid(b);

      // Cell size chosen so the parcels INSIDE the footprint number ~1000.
      // The bbox holds more cells than the site; scale by the area ratio.
      const siteArea = ringAreaM2(BOALO.footprint, (b.latMin + b.latMax) / 2);
      const cellSideM = Math.sqrt(siteArea / TARGET_PARCELS);
      const latRef = (b.latMin + b.latMax) / 2;
      const dLat = cellSideM / M_PER_DEG_LAT;
      const dLng = cellSideM / (M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180));
      const rows = Math.ceil((b.latMax - b.latMin) / dLat);
      const cols = Math.ceil((b.lngMax - b.lngMin) / dLng);

      // --- Pass 1: clip every grid cell to the footprint. ------------------
      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const rect = {
            latMin: b.latMin + r * dLat,
            latMax: b.latMin + (r + 1) * dLat,
            lngMin: b.lngMin + c * dLng,
            lngMax: b.lngMin + (c + 1) * dLng,
          };
          for (const ring of rings) {
            const clipped = clipRingToRect(ring, rect);
            if (!clipped.length) continue;
            const area = ringAreaM2(clipped, latRef);
            if (area < 2) continue; // degenerate boundary sliver
            const cLat = (rect.latMin + rect.latMax) / 2;
            const cLng = (rect.lngMin + rect.lngMax) / 2;
            const fLat = (cLat - b.latMin) / (b.latMax - b.latMin);
            const fLng = (cLng - b.lngMin) / (b.lngMax - b.lngMin);
            let zoneId = 'Z5';
            for (const [id, band] of ZONE_BANDS) {
              if (fLat >= band.latFrom && fLat < band.latTo && fLng >= band.lngFrom && fLng < band.lngTo) {
                zoneId = id;
                break;
              }
            }
            cells.push({ poly: clipped, area, cLat, cLng, fLat, fLng, zoneId, kind: 'parcel' });
          }
        }
      }

      // --- Pass 2: carve the circulation network out of the commons. -------
      // Vertical trail spine at mid-longitude + three cross-paths.
      const spineLng = (b.lngMin + b.lngMax) / 2;
      const crossLats = [0.3, 0.55, 0.8].map((f) => b.latMin + f * (b.latMax - b.latMin));
      for (const cell of cells) {
        if (cell.zoneId !== 'Z5') continue;
        const onSpine = Math.abs(cell.cLng - spineLng) < dLng / 2;
        const onCross = crossLats.some((lat) => Math.abs(cell.cLat - lat) < dLat / 2);
        if (onSpine || onCross) cell.kind = 'road';
      }
      const roadCells = cells.filter((c) => c.kind === 'road');

      // --- Pass 3: terrain, access, buildability. --------------------------
      for (const cell of cells) {
        cell.elev = elevAt ? elevAt(cell.cLat, cell.cLng) : null;
        cell.slope = slopeDeg(elevAt, cell.cLat, cell.cLng);
        let min = Infinity;
        for (const road of roadCells) {
          const d = distM(cell.cLat, cell.cLng, road.cLat, road.cLng);
          if (d < min) min = d;
        }
        cell.roadDist = min;
        if (ZONES[cell.zoneId].type === 'development') {
          cell.score = buildabilityScore(cell, cell.zoneId);
        }
      }

      // --- Pass 4: parking cluster — 25 cells (~1,762 m²) at the spine junction
      // closest to the Z1 hotel access (its SW corner).
      const z1 = cells.filter((c) => c.zoneId === 'Z1');
      if (z1.length && roadCells.length) {
        const access = z1.reduce((a, c) => (c.cLng < a.cLng ? c : a));
        const junction = roadCells.reduce((a, c) =>
          distM(c.cLat, c.cLng, access.cLat, access.cLng) < distM(a.cLat, a.cLng, access.cLat, access.cLng) ? c : a);
        cells
          .filter((c) => c.kind === 'parcel')
          .sort((p, q) =>
            distM(p.cLat, p.cLng, junction.cLat, junction.cLng) - distM(q.cLat, q.cLng, junction.cLat, junction.cLng))
          .slice(0, 25)
          .forEach((c) => { c.kind = 'parking'; });
      }

      // --- Pass 5: render. --------------------------------------------------
      const counts = {};
      let id = 0;
      for (const cell of cells) {
        id++;
        const zone = ZONES[cell.zoneId];
        counts[cell.zoneId] = (counts[cell.zoneId] || 0) + 1;
        const ref = `MP-${String(id).padStart(4, '0')}`;
        const facts =
          `Area: ${cell.area.toFixed(0)} m²` +
          (cell.elev != null ? `<br>Elevation: ~${cell.elev.toFixed(0)} m` : '') +
          (cell.slope != null ? `<br>Slope: ~${cell.slope.toFixed(1)}°` : '') +
          `<br>Trail access: ${cell.roadDist.toFixed(0)} m`;

        let style, popup;
        if (cell.kind === 'road') {
          style = { ...ROAD_STYLE, weight: 0.6 };
          popup = `<b>${ref} · Trail / path</b><br>Commons circulation spine<br>${facts}`;
        } else if (cell.kind === 'parking') {
          style = { ...PARKING_STYLE, weight: 1, dashArray: '3,2' };
          popup = `<b>${ref} · Parking (subterranean)</b><br>Part of the 25-cell garage cluster (~1,762 m²) at the Z1 access junction.<br>${facts}`;
        } else if (cell.score != null) {
          const bright = 0.15 + (cell.score / 100) * 0.45; // buildability → fill intensity
          style = { color: zone.color, weight: 0.5, fillColor: zone.color, fillOpacity: bright };
          const verdict = cell.score > 70 ? '✓ Optimal' : cell.score > 50 ? '◐ Acceptable' : '✗ Constrained';
          popup =
            `<b>${ref} · ${zone.name} (${cell.zoneId})</b><br>${facts}` +
            `<br><b>Buildability: ${cell.score.toFixed(0)}/100</b> ${verdict}` +
            `<br><span style="color:#666">Combine with adjacent cells for larger lots.</span>`;
        } else {
          style = { color: '#65a30d', weight: 0.4, fillColor: zone.color, fillOpacity: 0.2 };
          popup = `<b>${ref} · ${zone.name} (${cell.zoneId})</b><br>Green meadow / dehesa<br>${facts}`;
        }

        group.addLayer(L.polygon(cell.poly, { renderer, ...style }).bindPopup(popup));
      }
      console.info('[microparcels]', cells.length, 'parcels;', 'zone counts:', counts);
    })();

    return group;
  },
};
