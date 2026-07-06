import L from 'leaflet';
import sitesData from '../../data/sites.json';
import planning from '../../data/planning-config.json';
import { getBoaloRings } from './masterplan.js';
import { cellsToGeoJSON, cellsToDXF, ledgerToCSV, download } from './exports.js';

// Micro-parcel subdivision v4: terrain-driven generative masterplan.
//
// Instead of abstract zone bands, the program is laid out the way Spanish
// hillside urbanizaciones actually are (La Moraleja, Ciudalcampo, La Zagaleta
// pattern): circulation first, program along it.
//
//   1. A main access road enters from Calle Berrocal (east edge) and traces
//      the CONTOURS — each step picks the flattest neighbour, so the road
//      hugs the hillside instead of fighting it.
//   2. Residential streets branch off the uphill leg every ~40 m on the
//      downhill (view) side. Villas sit in LOTS of ~6 cells (~420 m²) strung
//      along both sides of each street, with pedestrian paths cut between
//      every few lots.
//   3. The hotel is a LINEAR building — a 3-cell-deep strip following the
//      upper contour on the view side of the road (the classic parador /
//      wellness-resort section: rooms face the valley, service faces the road).
//   4. VPP village: a compact block at the site entry, closest to the
//      existing town fabric (standard practice for ceded VPP land).
//   5. Equestrian: the flattest contiguous window on the lower meadow.
//   6. Everything left is commons/dehesa; steep cells always stay green.
//
// The grid itself is unchanged: ~1000 cells (~70.5 m²) clipped to the
// cadastral footprint, covering 100% of the site. Cells remain the atomic
// unit — lots are just named groups of cells and stay recombinable.
//
// Terrain comes from one batched EU-DEM 25 m request (bilinear-interpolated);
// if the API is unreachable a calibrated fallback model is used (El Boalo:
// ground rises N-NW toward the Sierra from ~905 m at the road).

const SITES = Object.fromEntries(sitesData.sites.map((s) => [s.id, s]));
const BOALO = SITES['boalo-estate'];

const TARGET_PARCELS = 1000;
const M_PER_DEG_LAT = 111320;

const ZONES = {
  Z1: { color: '#1e40af', name: 'Hotel line', type: 'development' },
  Z2: { color: '#ea580c', name: 'Villa lot', type: 'development' },
  Z3: { color: '#be185d', name: 'VPP village', type: 'development' },
  Z4: { color: '#b8860b', name: 'Equestrian', type: 'development' },
  Z5: { color: '#86efac', name: 'Commons / dehesa', type: 'commons' },
};

const KIND_STYLES = {
  road: { color: '#2d3748', weight: 0.6, fillColor: '#4a5568', fillOpacity: 0.65 },
  street: { color: '#4a5568', weight: 0.5, fillColor: '#6b7280', fillOpacity: 0.5 },
  path: { color: '#a89468', weight: 0.8, fillColor: '#d6c9a8', fillOpacity: 0.5, dashArray: '2,2' },
  parking: { color: '#5c4a33', weight: 1, fillColor: '#8b7355', fillOpacity: 0.55, dashArray: '3,2' },
  protected: { color: '#4d7c0f', weight: 0.8, fillColor: '#a3e635', fillOpacity: 0.18, dashArray: '1,3' },
};

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

// --- Sutherland–Hodgman clip of a ring against an axis-aligned rect. --------

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

function distM(aLat, aLng, bLat, bLng) {
  const dLat = (aLat - bLat) * M_PER_DEG_LAT;
  const dLng = (aLng - bLng) * M_PER_DEG_LAT * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

// Distance (m) from a point to the nearest boundary segment of the rings.
function boundaryDistM(lat, lng, rings, latRef) {
  const mLng = M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180);
  const px = lng * mLng, py = lat * M_PER_DEG_LAT;
  let min = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [aLat, aLng] = ring[i];
      const [bLat, bLng] = ring[(i + 1) % ring.length];
      const ax = aLng * mLng, ay = aLat * M_PER_DEG_LAT;
      const bx = bLng * mLng, by = bLat * M_PER_DEG_LAT;
      const dx = bx - ax, dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < min) min = d;
    }
  }
  return min;
}

// --- Terrain -----------------------------------------------------------------

// Bilinear interpolator over an n×n grid spanning gb.
function gridInterp(gb, n, grid) {
  return (lat, lng) => {
    const fi = ((lat - gb.latMin) / (gb.latMax - gb.latMin)) * (n - 1);
    const fj = ((lng - gb.lngMin) / (gb.lngMax - gb.lngMin)) * (n - 1);
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(fi)));
    const j0 = Math.max(0, Math.min(n - 2, Math.floor(fj)));
    const ti = Math.max(0, Math.min(1, fi - i0)), tj = Math.max(0, Math.min(1, fj - j0));
    const v00 = grid[i0 * n + j0], v01 = grid[i0 * n + j0 + 1];
    const v10 = grid[(i0 + 1) * n + j0], v11 = grid[(i0 + 1) * n + j0 + 1];
    return v00 * (1 - ti) * (1 - tj) + v01 * (1 - ti) * tj + v10 * ti * (1 - tj) + v11 * ti * tj;
  };
}

// Baked heightmap (public/terrain/boalo.json, produced by scripts/bake-terrain.mjs
// in CI where the network allows a much denser sample than one live request).
async function bakedTerrain(b) {
  const res = await fetch(`${import.meta.env.BASE_URL}terrain/boalo.json`);
  if (!res.ok) throw new Error(`no baked terrain (${res.status})`);
  const t = await res.json();
  const gb = t.bbox;
  if (!(gb.latMin <= b.latMin && gb.latMax >= b.latMax && gb.lngMin <= b.lngMin && gb.lngMax >= b.lngMax)) {
    throw new Error('baked terrain does not cover the site bbox');
  }
  return { elevAt: gridInterp(gb, t.n, t.grid), source: t.source || 'baked heightmap' };
}

async function fetchElevationGrid(b, n = 10) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const lat = b.latMin + ((b.latMax - b.latMin) * i) / (n - 1);
      const lng = b.lngMin + ((b.lngMax - b.lngMin) * j) / (n - 1);
      pts.push(`${lat.toFixed(5)},${lng.toFixed(5)}`);
    }
  }
  const url = `https://api.opentopodata.org/v1/eudem25m?locations=${pts.join('|')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`elevation API ${res.status}`);
  const data = await res.json();
  const grid = data?.results?.map((r) => r.elevation);
  if (!grid || grid.length !== n * n || grid.some((v) => v == null)) throw new Error('incomplete elevation grid');
  return gridInterp(b, n, grid);
}

async function terrainModel(b) {
  try {
    return await bakedTerrain(b);
  } catch (e) {
    console.info('[microparcels] no baked terrain, trying live API:', e.message);
  }
  try {
    return { elevAt: await fetchElevationGrid(b), source: 'EU-DEM 25 m (live)' };
  } catch (e) {
    console.warn('[microparcels] elevation API unavailable, using calibrated model:', e.message);
    // El Boalo: rises N-NW toward the Sierra, ~905 m at the eastern road.
    const elevAt = (lat, lng) => {
      const fLat = (lat - b.latMin) / (b.latMax - b.latMin);
      const fLng = (lng - b.lngMin) / (b.lngMax - b.lngMin);
      return 905 + 42 * fLat + 14 * (1 - fLng)
        + 4 * Math.sin(2.6 * fLat * Math.PI) * Math.cos(1.8 * fLng * Math.PI);
    };
    return { elevAt, source: 'estimated terrain model' };
  }
}

function slopeDegAt(elevAt, lat, lng) {
  const dLat = 25 / M_PER_DEG_LAT;
  const dLng = 25 / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const gLat = (elevAt(lat + dLat, lng) - elevAt(lat - dLat, lng)) / 50;
  const gLng = (elevAt(lat, lng + dLng) - elevAt(lat, lng - dLng)) / 50;
  return (Math.atan(Math.sqrt(gLat ** 2 + gLng ** 2)) * 180) / Math.PI;
}

// Buildability 0–100: terrain, access to circulation, zone constraints.
function buildabilityScore(cell, zoneId) {
  let score = 80;
  if (cell.slope > 20) score -= 25;
  else if (cell.slope > 12) score -= 12;
  else if (cell.slope > 7) score -= 5;
  if (cell.roadDist > 300) score -= 25;
  else if (cell.roadDist > 150) score -= 10;
  else if (cell.roadDist > 100) score -= 5;
  if (zoneId === 'Z1') score += 10;      // hotel line sits directly on the road
  else if (zoneId === 'Z3') score -= 5;  // VPP regulatory envelope
  else if (zoneId === 'Z4') score -= 10; // stables want dead-flat ground
  return Math.max(0, Math.min(100, score));
}

export default {
  id: 'overlay-microparcels',
  label: 'Micro-parcels (1000-unit master grid)',
  group: 'overlay',
  enabled: true,
  create() {
    const group = L.layerGroup();
    const renderer = L.canvas({ padding: 0.5 });

    (async () => {
      // Exactly the same geometry the masterplan-zones layer draws (shared,
      // memoized promise) — the grid and the zones can never diverge.
      const rings = await getBoaloRings();
      if (!rings.length) return;
      const rcUsed = BOALO?.cadastre?.refs?.[0]?.rc ?? null;

      const b = bbox(rings);
      const { elevAt, source } = await terrainModel(b);

      const latRef = (b.latMin + b.latMax) / 2;
      const siteArea = rings.reduce((s, ring) => s + ringAreaM2(ring, latRef), 0);
      const cellSideM = Math.sqrt(siteArea / TARGET_PARCELS);
      const dLat = cellSideM / M_PER_DEG_LAT;
      const dLng = cellSideM / (M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180));
      const rows = Math.ceil((b.latMax - b.latMin) / dLat);
      const cols = Math.ceil((b.lngMax - b.lngMin) / dLng);

      // --- Grid: clip every cell to the footprint. -------------------------
      // grid[r][c] row 0 = south, col 0 = west.
      const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
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
            if (area < 2) continue;
            const cLat = (rect.latMin + rect.latMax) / 2;
            const cLng = (rect.lngMin + rect.lngMax) / 2;
            const cell = {
              r, c, poly: clipped, area, cLat, cLng,
              elev: elevAt(cLat, cLng),
              slope: slopeDegAt(elevAt, cLat, cLng),
              kind: null, zoneId: null, lotId: null,
              // Perimeter buffer (fire self-protection strip + road setback):
              // no development, only green uses and circulation crossings.
              protected: boundaryDistM(cLat, cLng, rings, latRef) < (planning.exclusions?.perimeterBufferM ?? 0),
            };
            grid[r][c] = cell;
            cells.push(cell);
          }
        }
      }
      const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? grid[r][c] : null);

      // --- 1. Main access road: contour-following from the east entry. -----
      // Entry where Calle Berrocal meets the east boundary (~1/3 up the site).
      const entryR = Math.round(rows * 0.3);
      let start = null;
      outer: for (let dr = 0; dr <= 3 && !start; dr++) {
        for (const r of [entryR + dr, entryR - dr]) {
          for (let c = cols - 1; c >= 0; c--) {
            if (at(r, c)) { start = at(r, c); break outer; }
          }
        }
      }
      const mainRoad = [];
      if (start) {
        // West leg: march inland, each step taking the flattest neighbour.
        let { r, c } = start;
        const westEnd = Math.round(cols * 0.2);
        while (c > westEnd) {
          const prev = at(r, c);
          c--;
          let best = null;
          for (const rr of [r - 1, r, r + 1]) {
            const cand = at(rr, c);
            if (!cand) continue;
            const cost = Math.abs(cand.elev - (prev ? prev.elev : cand.elev)) + (rr === r ? 0 : 0.15);
            if (!best || cost < best.cost) best = { cell: cand, cost };
          }
          if (!best) break;
          r = best.cell.r;
          best.cell.kind = 'road';
          mainRoad.push(best.cell);
        }
        // North leg: climb toward the upper meadow, again hugging contours.
        const northLeg = [];
        const northEnd = Math.round(rows * 0.85);
        while (r < northEnd) {
          r++;
          let best = null;
          for (const cc of [c - 1, c, c + 1]) {
            const cand = at(r, cc);
            if (!cand) continue;
            const prev = at(r - 1, c);
            const cost = Math.abs(cand.elev - (prev ? prev.elev : cand.elev)) + (cc === c ? 0 : 0.15);
            if (!best || cost < best.cost) best = { cell: cand, cost };
          }
          if (!best) break;
          c = best.cell.c;
          best.cell.kind = 'road';
          mainRoad.push(best.cell);
          northLeg.push(best.cell);
        }

        // --- 2. Hotel: linear building along the upper contour, view side. --
        // 3 cells deep on the downhill (east) side of the top of the north leg.
        const hotelRun = northLeg.slice(-8, -1);
        for (const roadCell of hotelRun) {
          for (let off = 1; off <= 3; off++) {
            const cand = at(roadCell.r, roadCell.c + off);
            if (cand && !cand.kind && !cand.zoneId && !cand.protected && cand.slope < 18) cand.zoneId = 'Z1';
          }
        }

        // --- 3. VPP village: compact block at the entry, near the town. -----
        let vpp = 0;
        for (let dr = -5; dr <= 5 && vpp < 70; dr++) {
          for (let dc = 0; dc >= -9 && vpp < 70; dc--) {
            const cand = at(start.r + dr, start.c + dc);
            if (cand && !cand.kind && !cand.zoneId && !cand.protected && cand.slope < 15) { cand.zoneId = 'Z3'; vpp++; }
          }
        }

        // --- 4. Residential streets + villa lots + pedestrian paths. --------
        // A street branches downhill (east) every 4 rows of the north leg,
        // below the hotel segment.
        const lots = [];
        const junctions = northLeg.slice(0, -8).filter((_, i) => i % 4 === 1);
        junctions.forEach((j, ji) => {
          const streetCols = [];
          for (let dc = 1; dc <= 16; dc++) {
            const cand = at(j.r, j.c + dc);
            if (!cand || cand.kind || cand.zoneId || cand.slope > 16) break;
            cand.kind = 'street';
            streetCols.push(cand.c);
          }
          // Lots: 3 street-cells wide × 2 deep on both sides (~420 m² each).
          // Every 3rd bay becomes a pedestrian path instead of a lot.
          const bays = Math.floor(streetCols.length / 3);
          for (let bi = 0; bi < bays; bi++) {
            const bayCols = streetCols.slice(bi * 3, bi * 3 + 3);
            for (const side of [1, -1]) {
              if (bi % 3 === 2) {
                for (const depth of [1, 2]) {
                  const cand = at(j.r + side * depth, bayCols[0]);
                  if (cand && !cand.kind && !cand.zoneId && cand.slope < 20) cand.kind = 'path';
                }
                continue;
              }
              const lotCells = [];
              for (const col of bayCols) {
                for (const depth of [1, 2]) {
                  const cand = at(j.r + side * depth, col);
                  if (cand && !cand.kind && !cand.zoneId && !cand.protected && cand.slope < 20) lotCells.push(cand);
                }
              }
              if (lotCells.length >= 4) {
                const lotId = `V${ji + 1}${side > 0 ? 'N' : 'S'}-${String(bi + 1).padStart(2, '0')}`;
                for (const cand of lotCells) { cand.zoneId = 'Z2'; cand.lotId = lotId; }
                lots.push({ id: lotId, cells: lotCells });
              }
            }
          }
        });

        // --- 5. Equestrian: flattest 11×11 window on the lower meadow. ------
        let bestWin = null;
        for (let r0 = 0; r0 < Math.floor(rows * 0.5) - 11; r0 += 2) {
          for (let c0 = 0; c0 < cols - 11; c0 += 2) {
            let sum = 0, free = 0;
            for (let dr = 0; dr < 11; dr++) {
              for (let dc = 0; dc < 11; dc++) {
                const cand = at(r0 + dr, c0 + dc);
                if (cand && !cand.kind && !cand.zoneId && !cand.protected) { sum += cand.slope; free++; }
              }
            }
            if (free < 70) continue;
            const meanSlope = sum / free;
            if (!bestWin || meanSlope < bestWin.meanSlope) bestWin = { r0, c0, meanSlope };
          }
        }
        if (bestWin) {
          for (let dr = 0; dr < 11; dr++) {
            for (let dc = 0; dc < 11; dc++) {
              const cand = at(bestWin.r0 + dr, bestWin.c0 + dc);
              if (cand && !cand.kind && !cand.zoneId && !cand.protected) cand.zoneId = 'Z4';
            }
          }
        }

        // --- 6. Parking at the hotel junction (subterranean), sized from the
        // Ley 9/2001 standard: 1.5 spaces / 100 m² built, 25 m² per space.
        const hotelJunction = hotelRun[0];
        if (hotelJunction) {
          const law = planning.legal.cessions;
          let builtM2 = 0;
          for (const cell of cells) {
            if (cell.zoneId && planning.zoning[cell.zoneId]) {
              builtM2 += cell.area * planning.zoning[cell.zoneId].edifM2PerM2;
            }
          }
          const requiredM2 = (builtM2 / 100) * law.parkingSpacesPer100m2Built * law.parkingSpaceM2;
          const candidates = cells
            .filter((x) => !x.kind && !x.zoneId && !x.protected)
            .sort((p, q) =>
              distM(p.cLat, p.cLng, hotelJunction.cLat, hotelJunction.cLng) -
              distM(q.cLat, q.cLng, hotelJunction.cLat, hotelJunction.cLng));
          let acc = 0;
          for (const x of candidates) {
            if (acc >= requiredM2) break;
            x.kind = 'parking';
            acc += x.area;
          }
        }
      }

      // --- 7. Remainder is commons; compute access + buildability. ---------
      const circulation = cells.filter((x) => x.kind === 'road' || x.kind === 'street');
      for (const cell of cells) {
        if (!cell.kind && !cell.zoneId) cell.zoneId = 'Z5';
        let min = Infinity;
        for (const rc of circulation) {
          const d = distM(cell.cLat, cell.cLng, rc.cLat, rc.cLng);
          if (d < min) min = d;
        }
        cell.roadDist = min;
        if (cell.zoneId && ZONES[cell.zoneId].type === 'development') {
          cell.score = buildabilityScore(cell, cell.zoneId);
        }
      }

      // --- 8. Render cells, then lot outlines on top. -----------------------
      const counts = { road: 0, street: 0, path: 0, parking: 0 };
      const rcNote =
        `<br><span style="color:#888;font-size:11px">Parcel ${rcUsed ?? 'footprint (Catastro offline)'}` +
        ` · site ${Math.round(siteArea).toLocaleString('en')} m²</span>`;
      let id = 0;
      for (const cell of cells) {
        id++;
        const ref = `MP-${String(id).padStart(4, '0')}`;
        const facts =
          `Area: ${cell.area.toFixed(0)} m²` +
          `<br>Elevation: ~${cell.elev.toFixed(0)} m (${source})` +
          `<br>Slope: ~${cell.slope.toFixed(1)}°` +
          (Number.isFinite(cell.roadDist) ? `<br>Road access: ${cell.roadDist.toFixed(0)} m` : '') +
          rcNote;

        let style, popup;
        if (cell.kind === 'road') {
          counts.road++;
          style = KIND_STYLES.road;
          popup = `<b>${ref} · Main access road</b><br>Contour-following; enters from Calle Berrocal (E).<br>${facts}`;
        } else if (cell.kind === 'street') {
          counts.street++;
          style = KIND_STYLES.street;
          popup = `<b>${ref} · Residential street</b><br>Downhill branch serving the villa lots.<br>${facts}`;
        } else if (cell.kind === 'path') {
          counts.path++;
          style = KIND_STYLES.path;
          popup = `<b>${ref} · Pedestrian path</b><br>Cut between villa lots — connects streets to the dehesa.<br>${facts}`;
        } else if (cell.kind === 'parking') {
          counts.parking++;
          style = KIND_STYLES.parking;
          popup = `<b>${ref} · Parking (subterranean)</b><br>20-cell cluster (~1,400 m²) at the hotel junction.<br>${facts}`;
        } else if (cell.protected) {
          counts.protected = (counts.protected || 0) + 1;
          style = KIND_STYLES.protected;
          popup = `<b>${ref} · Perimeter buffer</b><br>${planning.exclusions.perimeterBufferNote}<br>${facts}`;
        } else {
          const zone = ZONES[cell.zoneId];
          counts[cell.zoneId] = (counts[cell.zoneId] || 0) + 1;
          if (cell.score != null) {
            const bright = 0.15 + (cell.score / 100) * 0.45;
            style = { color: zone.color, weight: 0.5, fillColor: zone.color, fillOpacity: bright };
            const verdict = cell.score > 70 ? '✓ Optimal' : cell.score > 50 ? '◐ Acceptable' : '✗ Constrained';
            popup =
              `<b>${ref} · ${zone.name} (${cell.zoneId})</b>` +
              (cell.lotId ? `<br>Lot <b>${cell.lotId}</b> — combine/split freely at cell resolution.` : '') +
              `<br>${facts}<br><b>Buildability: ${cell.score.toFixed(0)}/100</b> ${verdict}`;
          } else {
            style = { color: '#65a30d', weight: 0.4, fillColor: zone.color, fillOpacity: 0.2 };
            popup = `<b>${ref} · ${zone.name} (${cell.zoneId})</b><br>Green meadow / dehesa.<br>${facts}`;
          }
        }
        group.addLayer(L.polygon(cell.poly, { renderer, ...style }).bindPopup(popup));
      }

      // Lot outlines: heavier border around each villa lot so the "house on a
      // few pixels" unit reads at a glance. Outlines are kept for the exports.
      const lots = new Map();
      for (const cell of cells) {
        if (!cell.lotId) continue;
        if (!lots.has(cell.lotId)) lots.set(cell.lotId, []);
        lots.get(cell.lotId).push(cell);
      }
      const lotExports = [];
      for (const [lotId, lotCells] of lots) {
        const rMin = Math.min(...lotCells.map((x) => x.r));
        const rMax = Math.max(...lotCells.map((x) => x.r));
        const cMin = Math.min(...lotCells.map((x) => x.c));
        const cMax = Math.max(...lotCells.map((x) => x.c));
        const rect = {
          latMin: b.latMin + rMin * dLat,
          latMax: b.latMin + (rMax + 1) * dLat,
          lngMin: b.lngMin + cMin * dLng,
          lngMax: b.lngMin + (cMax + 1) * dLng,
        };
        for (const ring of rings) {
          const outline = clipRingToRect(ring, rect);
          if (!outline.length) continue;
          lotExports.push({ id: lotId, outline, areaM2: lotCells.reduce((s, x) => s + x.area, 0) });
          group.addLayer(L.polygon(outline, {
            renderer, color: '#9a3412', weight: 1.6, fill: false, interactive: false,
          }));
        }
      }

      // --- 9. Cessions ledger (cuadro de superficies + Ley 9/2001 checks). --
      const areas = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, road: 0, street: 0, path: 0, parking: 0, protected: 0 };
      for (const cell of cells) {
        if (cell.kind) areas[cell.kind] += cell.area;
        else if (cell.protected) areas.protected += cell.area;
        else areas[cell.zoneId] += cell.area;
      }
      const edif = {};
      let totalEdif = 0;
      for (const z of ['Z1', 'Z2', 'Z3', 'Z4']) {
        edif[z] = areas[z] * (planning.zoning[z]?.edifM2PerM2 ?? 0);
        totalEdif += edif[z];
      }
      const law = planning.legal.cessions;
      const greenProvided = areas.Z5 + areas.protected + areas.path;
      const greenRequired = (totalEdif / 100) * law.greenMinM2per100m2Built;
      const vppShare = edif.Z2 + edif.Z3 > 0 ? edif.Z3 / (edif.Z2 + edif.Z3) : 0;
      const parkingProvided = areas.parking / law.parkingSpaceM2;
      const parkingRequired = (totalEdif / 100) * law.parkingSpacesPer100m2Built;
      const ledger = {
        siteArea,
        totalEdif,
        rows: [
          { name: 'Hotel (Z1)', area: areas.Z1, pct: areas.Z1 / siteArea, edif: edif.Z1 },
          { name: 'Villas (Z2)', area: areas.Z2, pct: areas.Z2 / siteArea, edif: edif.Z2 },
          { name: 'VPP (Z3)', area: areas.Z3, pct: areas.Z3 / siteArea, edif: edif.Z3 },
          { name: 'Ecuestre (Z4)', area: areas.Z4, pct: areas.Z4 / siteArea, edif: edif.Z4 },
          { name: 'Dehesa / verde (Z5)', area: areas.Z5, pct: areas.Z5 / siteArea },
          { name: 'Franja perimetral', area: areas.protected, pct: areas.protected / siteArea },
          { name: 'Viario (vial + calles)', area: areas.road + areas.street, pct: (areas.road + areas.street) / siteArea },
          { name: 'Sendas peatonales', area: areas.path, pct: areas.path / siteArea },
          { name: 'Aparcamiento', area: areas.parking, pct: areas.parking / siteArea },
        ],
        checks: [
          { label: `Verde ≥ ${law.greenMinM2per100m2Built} m²/100 m² edif.`, value: `${Math.round(greenProvided).toLocaleString('en')} m²`, required: `${Math.round(greenRequired).toLocaleString('en')} m²`, ok: greenProvided >= greenRequired },
          { label: `VPP ≥ ${law.vppMinShareOfResidentialEdif * 100}% edif. residencial`, value: `${(vppShare * 100).toFixed(0)}%`, required: `${law.vppMinShareOfResidentialEdif * 100}%`, ok: vppShare >= law.vppMinShareOfResidentialEdif },
          { label: `Aparcamiento ≥ ${law.parkingSpacesPer100m2Built} pl/100 m²`, value: `${Math.round(parkingProvided)} pl`, required: `${Math.round(parkingRequired)} pl`, ok: parkingProvided >= parkingRequired },
        ],
      };

      // --- 10. On-map summary control: cuadro, checks, export buttons. ------
      const control = L.control({ position: 'bottomleft' });
      control.onAdd = () => {
        const el = L.DomUtil.create('div', 'mp-summary');
        el.style.cssText = 'background:rgba(17,24,39,.92);color:#e5e7eb;padding:10px 12px;border-radius:8px;font:11px/1.5 system-ui;max-width:260px;box-shadow:0 2px 10px rgba(0,0,0,.4)';
        const rows = ledger.rows.filter((row) => row.area > 0).map((row) =>
          `<tr><td>${row.name}</td><td style="text-align:right">${Math.round(row.area).toLocaleString('en')}</td><td style="text-align:right">${(row.pct * 100).toFixed(1)}%</td></tr>`).join('');
        const checks = ledger.checks.map((check) =>
          `<div>${check.ok ? '✅' : '❌'} ${check.label}: <b>${check.value}</b> / req. ${check.required}</div>`).join('');
        el.innerHTML =
          `<b>Cuadro de superficies</b> · ${Math.round(siteArea).toLocaleString('en')} m²` +
          `<table style="border-collapse:collapse;width:100%;margin:4px 0">${rows}</table>` +
          `<div style="margin:4px 0">Edificabilidad total: <b>${Math.round(totalEdif).toLocaleString('en')} m²</b></div>` +
          `${checks}` +
          `<div style="margin-top:6px;display:flex;gap:6px">` +
          `<button data-x="geojson">GeoJSON</button><button data-x="dxf">DXF (UTM30)</button><button data-x="csv">Cuadro CSV</button></div>` +
          `<div style="color:#9ca3af;margin-top:4px">Parámetros: ${planning.legal.cessions.source}. Zonas: hipótesis de trabajo.</div>`;
        L.DomEvent.disableClickPropagation(el);
        el.addEventListener('click', (ev) => {
          const kind = ev.target?.dataset?.x;
          if (kind === 'geojson') download('boalo-masterplan.geojson', 'application/geo+json', cellsToGeoJSON(cells, rings, { rc: rcUsed, site_m2: Math.round(siteArea) }));
          if (kind === 'dxf') download('boalo-masterplan-utm30.dxf', 'application/dxf', cellsToDXF(cells, lotExports, rings));
          if (kind === 'csv') download('boalo-cuadro-superficies.csv', 'text/csv', ledgerToCSV(ledger));
        });
        return el;
      };
      const attachControl = () => { if (group._map) control.addTo(group._map); };
      group.on('add', attachControl);
      group.on('remove', () => control.remove());
      attachControl(); // layer may already be on the map (async build)

      console.info('[microparcels]', cells.length, 'cells;', lots.size, 'villa lots;', 'counts:', counts,
        'terrain:', source, '| parcel:', rcUsed ?? 'footprint', `| site ${Math.round(siteArea)} m²`,
        '| edif', Math.round(totalEdif), 'm² | checks:', ledger.checks.map((c) => `${c.label}=${c.ok}`).join(', '));
    })();

    return group;
  },
};
