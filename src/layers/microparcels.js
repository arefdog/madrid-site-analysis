import L from 'leaflet';
import sitesData from '../../data/sites.json';
import planning from '../../data/planning-config.json';
import { siteFeatures as features } from './siteFeaturesData.js';
import { getBoaloRings } from './masterplan.js';
import { cellsToGeoJSON, cellsToDXF, ledgerToCSV, download } from './exports.js';
import { protectedStore } from './protectedStore.js';

// Existing site features (trees & rock outcrops) → [lat,lng] rings by role.
// Interior of an 'avoid'/'both' feature is no-build (the plan routes around
// the oak stands and outcrops); cells just outside an 'anchor'/'both' feature
// get a buildability premium (deck: Echo on the granite shoulder, Duo along
// the oak line). GeoJSON is [lng,lat]; flip to [lat,lng] here.
const FEATURES = (features.features ?? []).map((f) => ({
  kind: f.properties?.kind ?? 'tree',
  role: f.properties?.role ?? 'avoid',
  name: f.properties?.name ?? '',
  ring: (f.geometry?.coordinates?.[0] ?? []).map(([lng, lat]) => [lat, lng]),
})).filter((f) => f.ring.length >= 3);
const FEATURE_AVOID = FEATURES.filter((f) => f.role === 'avoid' || f.role === 'both');
const FEATURE_ANCHOR = FEATURES.filter((f) => f.role === 'anchor' || f.role === 'both');
const ANCHOR_RADIUS_M = 30; // premium band around a kept tree/outcrop

// Micro-parcel subdivision v5: PROGRAM-DRIVEN terrain-generative masterplan.
//
// The program is no longer emergent from magic numbers — it is a first-class
// brief in data/planning-config.json (`program`, v0.4, calibrated to the BYLD
// deck v0.3 envelope in sites.json). Every allocation below is sized from a
// target (keys, built m², land m², unit counts) and the on-map ledger
// reconciles ACHIEVED vs TARGET, so terrain-imposed shortfalls are visible.
//
// Layout follows the Spanish hillside urbanización pattern (La Moraleja,
// Ciudalcampo, La Zagaleta): circulation first, program along it.
//
//   1. A main access road enters from Calle Berrocal (east edge) and traces
//      the CONTOURS — each step picks the flattest neighbour, so the road
//      hugs the hillside instead of fighting it.
//   2. Hotel: a LINEAR building sized from its land target, 3 cells deep on
//      the UPHILL (west) side of the upper road — rooms look E/SE over the
//      lane to the valley, and the downhill flank stays free for streets.
//   3. Spa & restaurant: a compact cluster grown around the road bend, held
//      to the western access edge — shares the arrival core (and basement
//      parking) with the hotel.
//   4. VPP village: a linear piece along the entry lane's south frontage,
//      the corner most connected to the town road.
//   5. Equestrian: a rectangular paddock window (the meadow is shallow) on
//      the flattest ground, biased to the east meadow; reserved BEFORE the
//      lots so the streets can't nibble it.
//   6. Residential streets branch from BOTH road legs (crossings where both
//      flanks are deep). Villa lots are TYPED from the unit mix — Echo
//      (3×2 cells) starting the bay rhythm on upper streets, Duo (5×2 bars)
//      alternating, Grand (5×3) reserved at street ends (landscape edge) —
//      and allocation STOPS when the 27-unit program is met; the rest stays
//      dehesa. Leftover Echos scatter onto stilt patches touching paths
//      (units are reached on foot/buggy).
//   7. Parking: basement levels under the hotel+spa core, plus a small
//      surface visitor pocket at the entry for the law-required remainder.
//   8. Everything left is commons/dehesa; steep cells always stay green.
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

const SPA_COLOR = '#0e7490'; // spa & restaurant cells — teal within the Z1 core

const ZONES = {
  Z1: { color: '#1e40af', name: 'Arrival core (hotel + spa)', type: 'development' },
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

// Ray-casting point-in-ring test (ring = [[lat,lng], …]).
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
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
  // Premium siting next to a kept tree / granite outcrop (deck's own logic).
  if (cell.anchor) score += 15;
  return Math.max(0, Math.min(100, score));
}

export default {
  id: 'overlay-microparcels',
  label: 'Micro-parcels (1000-unit master grid)',
  group: 'overlay',
  enabled: false, // start blank — no overlays pre-ticked
  create() {
    const group = L.layerGroup();
    const renderer = L.canvas({ padding: 0.5 });
    let control = null;
    let buildToken = 0; // guards against overlapping async rebuilds

    // The whole plan generator, parameterized by an (optional) program
    // override so the brief can be edited from the map card and the plan
    // recalculated live. Re-entrant: a newer build supersedes an in-flight
    // one (each await checks it's still the latest before mutating the group).
    const build = async (progOverride) => {
      const myToken = ++buildToken;
      const stale = () => myToken !== buildToken;
      const PROG = progOverride ?? planning.program;
      group.clearLayers();
      if (control) { control.remove(); control = null; }
      // Exactly the same geometry the masterplan-zones layer draws (shared,
      // memoized promise) — the grid and the zones can never diverge.
      const rings = await getBoaloRings();
      if (stale() || !rings.length) return;
      const rcUsed = BOALO?.cadastre?.refs?.[0]?.rc ?? null;

      const b = bbox(rings);
      const { elevAt, source } = await terrainModel(b);
      if (stale()) return; // a newer build started during the terrain fetch

      const latRef = (b.latMin + b.latMax) / 2;
      const siteArea = rings.reduce((s, ring) => s + ringAreaM2(ring, latRef), 0);
      const cellSideM = Math.sqrt(siteArea / TARGET_PARCELS);
      const dLat = cellSideM / M_PER_DEG_LAT;
      const dLng = cellSideM / (M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180));
      const rows = Math.ceil((b.latMax - b.latMin) / dLat);
      const cols = Math.ceil((b.lngMax - b.lngMin) / dLng);

      // Protection polygons, two sources:
      //  • planning-config exclusions — verified/baked polygons. Two accepted
      //    shapes: a plain [lat,lng] ring, or a tagged { source, ring } object
      //    (written by scripts/fetch-constraints.mjs --apply so each polygon
      //    knows which dataset it came from).
      //  • the live protected-land layers via the shared store (toggling one
      //    re-fires build() below, so the plan carves around it live).
      const configPolys = (planning.exclusions?.protectionPolygons ?? [])
        .map((p) => (Array.isArray(p) ? p : p?.ring))
        .filter((ring) => Array.isArray(ring) && ring.length >= 3);
      const protPolys = [...configPolys, ...protectedStore.allRings()]
        .filter((ring) => Array.isArray(ring) && ring.length >= 3);

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
            // Protection tests, in priority order:
            //  1. perimeter buffer (fire strip + road setback),
            //  2. verified protection polygons from planning-config,
            //  3. existing site features to keep — tree stands / outcrops /
            //     watercourse (data/boalo-features.geojson). All no-build.
            const inBuffer = boundaryDistM(cLat, cLng, rings, latRef) < (planning.exclusions?.perimeterBufferM ?? 0);
            const inProtPoly = !inBuffer && protPolys.some((ring) => pointInRing(cLat, cLng, ring));
            const feat = (!inBuffer && !inProtPoly)
              ? FEATURE_AVOID.find((f) => pointInRing(cLat, cLng, f.ring)) : null;
            // Anchor: within ANCHOR_RADIUS_M of a kept feature but not inside
            // one — the premium siting band along the oak line / granite shoulder.
            let anchor = null;
            if (!inBuffer && !inProtPoly && !feat) {
              for (const f of FEATURE_ANCHOR) {
                if (boundaryDistM(cLat, cLng, [f.ring], latRef) <= ANCHOR_RADIUS_M) { anchor = f.kind; break; }
              }
            }
            const cell = {
              r, c, poly: clipped, area, cLat, cLng,
              elev: elevAt(cLat, cLng),
              slope: slopeDegAt(elevAt, cLat, cLng),
              kind: null, zoneId: null, lotId: null,
              protected: inBuffer || inProtPoly || !!feat,
              protReason: feat ? feat.kind : inProtPoly ? 'polygon' : inBuffer ? 'buffer' : null,
              featureName: feat?.name ?? null,
              anchor, // 'tree' | 'outcrop' | null — premium siting band
            };
            grid[r][c] = cell;
            cells.push(cell);
          }
        }
      }
      const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? grid[r][c] : null);

      // --- Program brief (planning-config.json → program, v0.4). ------------
      // Land claimed per item accumulates real (clipped) cell areas; achieved
      // built scales the target GFA by the land actually secured.
      const progItem = (pid) => PROG.items.find((p) => p.id === pid);
      const claimed = { hotel: 0, spa: 0, vpp: 0, equestrian: 0, residences: 0 };
      const mix = progItem('residences').unitMix.map((m) => ({ ...m, placed: 0 }));
      const builtOf = (pid) => {
        const item = progItem(pid);
        return item.builtM2 * Math.min(1, claimed[pid] / item.landM2);
      };
      const residencesBuilt = () => mix.reduce((s, m) => s + m.placed * m.builtM2, 0);
      const achievedBuilt = () =>
        builtOf('hotel') + builtOf('spa') + builtOf('vpp') + builtOf('equestrian') + residencesBuilt();
      let parkingRequiredM2 = 0;
      let parkingBasementM2 = 0;

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
      let roadLenM = 0, roadMaxGrade = 0, roadAvgGrade = 0, streetMaxGrade = 0;
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
        // North leg: climb toward the upper meadow with grade-aware RAMPING —
        // when every uphill step would exceed ~10% longitudinal grade, the
        // road traverses laterally (switchback) instead of climbing straight.
        const northLeg = [];
        const northEnd = Math.round(rows * 0.85);
        const maxRiseM = cellSideM * 0.10; // 10% target grade per step
        let guard = rows * 4;
        while (r < northEnd && guard-- > 0) {
          const here = at(r, c);
          const options = [];
          for (const [rr, cc, lateral] of [[r + 1, c - 1, 0], [r + 1, c, 0], [r + 1, c + 1, 0], [r, c - 1, 1], [r, c + 1, 1]]) {
            const cand = at(rr, cc);
            if (!cand || cand.kind === 'road') continue;
            const rise = Math.abs(cand.elev - (here ? here.elev : cand.elev));
            const over = Math.max(0, rise - maxRiseM);
            options.push({ cand, rr, cc, cost: rise + over * 4 + lateral * maxRiseM * 1.2 });
          }
          if (!options.length) break;
          options.sort((p, q) => p.cost - q.cost);
          const best = options[0];
          r = best.rr;
          c = best.cc;
          best.cand.kind = 'road';
          mainRoad.push(best.cand);
          northLeg.push(best.cand);
        }

        // Longitudinal grade (%) along the carriageway from real cell-centre
        // elevations and distances — the road-engineering readout. Amber and
        // red fills flag the segments that would need earthworks or rerouting.
        {
          let prev = start, gradeSum = 0;
          for (const rc of mainRoad) {
            const d = distM(prev.cLat, prev.cLng, rc.cLat, rc.cLng);
            rc.grade = d > 0 ? (Math.abs(rc.elev - prev.elev) / d) * 100 : 0;
            roadLenM += d;
            gradeSum += rc.grade * d;
            if (rc.grade > roadMaxGrade) roadMaxGrade = rc.grade;
            prev = rc;
          }
          roadAvgGrade = roadLenM > 0 ? gradeSum / roadLenM : 0;
        }

        const isFree = (x) => x && !x.kind && !x.zoneId && !x.protected;
        const northSet = new Set(northLeg);
        const bend = northLeg[0] ?? mainRoad[mainRoad.length - 1] ?? start;

        // --- 2. Hotel: linear building sized from its land target, on the
        // UPHILL (west) side of the upper road, from the top down — rooms look
        // E/SE over the road to the valley, and the downhill flank stays free
        // for the residence streets.
        const hotel = progItem('hotel');
        for (let i = mainRoad.length - 1; i >= 0 && claimed.hotel < hotel.landM2; i--) {
          const roadCell = mainRoad[i];
          const back = northSet.has(roadCell) ? [0, -1] : [1, 0];
          for (let off = 1; off <= 3 && claimed.hotel < hotel.landM2; off++) {
            const cand = at(roadCell.r + back[0] * off, roadCell.c + back[1] * off);
            if (isFree(cand) && cand.slope < 18) {
              cand.zoneId = 'Z1';
              cand.programId = 'hotel';
              claimed.hotel += cand.area;
            }
          }
        }

        // --- 3. Spa & restaurant: compact cluster grown around the bend but
        // held to the western access edge (deck: "arrival & core at the
        // western access") so it never creeps up the residential flank.
        const spa = progItem('spa');
        {
          const queue = [bend];
          const seen = new Set([bend]);
          while (queue.length && claimed.spa < spa.landM2) {
            const cur = queue.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const cand = at(cur.r + dr, cur.c + dc);
              if (!cand || seen.has(cand)) continue;
              seen.add(cand);
              if (cand.slope > 15 || cand.c > bend.c + 3 || Math.abs(cand.r - bend.r) > 3) continue;
              if (isFree(cand)) {
                cand.zoneId = 'Z1';
                cand.programId = 'spa';
                claimed.spa += cand.area;
              }
              if (claimed.spa >= spa.landM2) break;
              queue.push(cand);
            }
          }
        }

        // --- 4. VPP village: linear piece along the entry lane's south
        // frontage — the corner most connected to the town road — sized from
        // the program target; the meadow north of the lane stays free.
        const vppProg = progItem('vpp');
        for (let dr = -7; dr <= 0 && claimed.vpp < vppProg.landM2; dr++) {
          for (let dc = 0; dc >= -16 && claimed.vpp < vppProg.landM2; dc--) {
            const cand = at(start.r + dr, start.c + dc);
            if (isFree(cand) && cand.slope < 15) {
              cand.zoneId = 'Z3';
              cand.programId = 'vpp';
              claimed.vpp += cand.area;
            }
          }
        }

        // --- 5. Equestrian BEFORE the lots (reserves its meadow window before
        // the streets nibble it). The south meadow is shallow, so rectangular
        // paddock windows are searched (deep or wide) with an eastward bias —
        // the deck's "flat east meadow".
        const eq = progItem('equestrian');
        const eqCells = Math.ceil(eq.landM2 / (cellSideM * cellSideM));
        let bestWin = null;
        for (const minFill of [0.75, 0.5]) {
          for (const [h, w] of [[5, Math.ceil(eqCells / 5)], [7, Math.ceil(eqCells / 7)], [9, Math.ceil(eqCells / 9)]]) {
            for (let r0 = 0; r0 <= Math.floor(rows * 0.55) - h; r0 += 1) {
              for (let c0 = 0; c0 <= cols - w; c0 += 2) {
                let sum = 0, free = 0;
                for (let dr = 0; dr < h; dr++) {
                  for (let dc = 0; dc < w; dc++) {
                    const cand = at(r0 + dr, c0 + dc);
                    if (isFree(cand)) { sum += cand.slope; free++; }
                  }
                }
                if (free < h * w * minFill) continue;
                const score = sum / free + (1 - (c0 + w / 2) / cols) * 1.2;
                if (!bestWin || score < bestWin.score) bestWin = { r0, c0, h, w, score };
              }
            }
            if (bestWin) break;
          }
          if (bestWin) break;
        }
        if (bestWin) {
          for (let dr = 0; dr < bestWin.h; dr++) {
            for (let dc = 0; dc < bestWin.w; dc++) {
              const cand = at(bestWin.r0 + dr, bestWin.c0 + dc);
              if (isFree(cand)) {
                cand.zoneId = 'Z4';
                cand.programId = 'equestrian';
                claimed.equestrian += cand.area;
              }
            }
          }
        }

        // --- 6. Residential streets + TYPED villa lots + pedestrian paths. --
        // Streets branch from both road legs; lots are allocated from the unit
        // mix (Echo/Duo/Grand) and allocation STOPS when the program is met —
        // the remainder stays dehesa.
        const mixRemaining = () => mix.reduce((s, m) => s + m.count - m.placed, 0);
        const pickType = (colsLeft, prefEcho, bay) => {
          const rem = (m) => m.count - m.placed;
          const grand = mix.find((m) => m.type === 'Grand');
          const echo = mix.find((m) => m.type === 'Echo');
          const duo = mix.find((m) => m.type === 'Duo');
          // Grand prefers the landscape edge — a short remaining run.
          if (grand && rem(grand) > 0 && colsLeft <= grand.lotCols && colsLeft >= 3) return grand;
          // Alternate Echo/Duo bays; upper (prefEcho) streets start with Echo.
          const wantEcho = prefEcho ? bay % 2 === 0 : bay % 2 === 1;
          const order = wantEcho ? [echo, duo, grand] : [duo, echo, grand];
          for (const m of order) if (m && rem(m) > 0 && colsLeft >= 3) return m;
          return null;
        };

        const lots = [];
        // Bay-walker: places typed lots along a line of cells (a street or the
        // main lane). On a long street the far end is reserved for Grand first
        // (its landscape-edge position); a dead bay slides one cell so small
        // free pockets aren't skipped.
        const placeBays = (line, sides, prefEcho, withPaths) => {
          const grand = mix.find((m) => m.type === 'Grand');
          let end = line.length;
          if (withPaths && grand && grand.count - grand.placed > 0 && line.length >= 12) {
            const bayCells = line.slice(line.length - grand.lotCols);
            for (const s of sides) {
              if (grand.count - grand.placed <= 0) break;
              const lotCells = [];
              for (const sc of bayCells) {
                for (let depth = 1; depth <= grand.lotDepth; depth++) {
                  const cand = at(sc.r + s[0] * depth, sc.c + s[1] * depth);
                  if (isFree(cand) && cand.slope < 20) lotCells.push(cand);
                }
              }
              if (lotCells.length >= Math.max(4, grand.lotCols * grand.lotDepth - 2)) {
                grand.placed++;
                const lotId = `G-${String(grand.placed).padStart(2, '0')}`;
                for (const cand of lotCells) {
                  cand.zoneId = 'Z2';
                  cand.lotId = lotId;
                  cand.lotType = 'Grand';
                  claimed.residences += cand.area;
                }
                lots.push({ id: lotId, type: 'Grand', cells: lotCells });
              }
            }
            end = line.length - grand.lotCols;
          }
          const walk = line.slice(0, end);
          let cursor = 0, bay = 0;
          while (cursor < walk.length && mixRemaining() > 0) {
            // Every 5th bay: a pedestrian path cut through to the dehesa.
            if (withPaths && bay % 5 === 4) {
              for (const s of sides) {
                for (const depth of [1, 2]) {
                  const sc = walk[cursor];
                  const cand = at(sc.r + s[0] * depth, sc.c + s[1] * depth);
                  if (isFree(cand) && cand.slope < 20) cand.kind = 'path';
                }
              }
              cursor += 1;
              bay++;
              continue;
            }
            const type = pickType(walk.length - cursor, prefEcho, bay);
            if (!type) break;
            const width = Math.min(type.lotCols, walk.length - cursor);
            const bayCells = walk.slice(cursor, cursor + width);
            let placedHere = 0;
            for (const s of sides) {
              if (type.count - type.placed <= 0) break;
              const lotCells = [];
              for (const sc of bayCells) {
                for (let depth = 1; depth <= type.lotDepth; depth++) {
                  const cand = at(sc.r + s[0] * depth, sc.c + s[1] * depth);
                  if (isFree(cand) && cand.slope < 20) lotCells.push(cand);
                }
              }
              if (lotCells.length >= Math.max(4, width * type.lotDepth - 2)) {
                type.placed++;
                placedHere++;
                const lotId = `${type.type[0]}-${String(type.placed).padStart(2, '0')}`;
                for (const cand of lotCells) {
                  cand.zoneId = 'Z2';
                  cand.lotId = lotId;
                  cand.lotType = type.type;
                  claimed.residences += cand.area;
                }
                lots.push({ id: lotId, type: type.type, cells: lotCells });
              }
            }
            cursor += placedHere ? width : 1;
            if (placedHere) bay++;
          }
        };

        // Junctions: greedy along each leg with a minimum gap (streets need
        // ~5 cells of separation so facing lots don't collide). Runs up to
        // twice — grade caps shorten streets, so a second pass lands new
        // junctions on the flanks the first pass left free.
        const westLeg = mainRoad.filter((rc) => !northSet.has(rc));
        const collectJunctions = () => {
          const junctions = [];
          let gap = 99;
          northLeg.forEach((j) => {
            gap++;
            if (gap >= 5 && isFree(at(j.r, j.c + 1))) {
              junctions.push({ j, step: [0, 1], sides: [[1, 0], [-1, 0]] });
              gap = 0;
            }
          });
          gap = 99;
          westLeg.forEach((j) => {
            gap++;
            if (gap < 5) return;
            // Probe both flanks; deep on both → a crossing: streets to the
            // meadow AND the mid band.
            const depthOf = (dir) => {
              let d = 0;
              while (d < 6 && isFree(at(j.r + dir * (d + 1), j.c))) d++;
              return d;
            };
            const s = depthOf(-1), n = depthOf(1);
            if (Math.max(s, n) < 3) return;
            if (s >= 3) junctions.push({ j, step: [-1, 0], sides: [[0, 1], [0, -1]] });
            if (n >= 3) junctions.push({ j, step: [1, 0], sides: [[0, 1], [0, -1]] });
            gap = 0;
          });
          // Upper (higher-elevation) streets are laid first; alternating
          // streets start their bay rhythm with Echo — the outcrop shoulder.
          junctions.sort((a, b) => b.j.elev - a.j.elev);
          return junctions;
        };
        const layStreets = (junctions) => junctions.forEach(({ j, step, sides }, rank) => {
          if (mixRemaining() === 0) return;
          const street = [];
          let prev = j;
          for (let i = 1; i <= 28; i++) {
            const cand = at(j.r + step[0] * i, j.c + step[1] * i);
            if (!isFree(cand) || cand.slope > 16) break;
            const d = distM(prev.cLat, prev.cLng, cand.cLat, cand.cLng);
            const g = d > 0 ? (Math.abs(cand.elev - prev.elev) / d) * 100 : 0;
            if (g > 16) break; // the street ends where it would exceed max grade
            cand.kind = 'street';
            cand.grade = g;
            if (g > streetMaxGrade) streetMaxGrade = g;
            prev = cand;
            street.push(cand);
          }
          placeBays(street, sides, rank % 2 === 0, true);
        });
        layStreets(collectJunctions());
        if (mixRemaining() > 0) layStreets(collectJunctions());
        // Fallbacks: unplaced units front the main lane (either side), then
        // scatter onto free lot-sized stilt patches touching circulation
        // (deck: units reached on foot/buggy, no fences). Largest types claim
        // ground first.
        if (mixRemaining() > 0) {
          placeBays(westLeg, [[-1, 0]], false, false);
          if (mixRemaining() > 0) placeBays(westLeg, [[1, 0]], false, false);
          if (mixRemaining() > 0) placeBays(northLeg, [[0, 1]], true, false);
        }
        if (mixRemaining() > 0) {
          const touchesCirc = (x) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => {
            const n = at(x.r + dr, x.c + dc);
            return n && (n.kind === 'road' || n.kind === 'street' || n.kind === 'path');
          });
          const anchors = cells
            .filter((x) => isFree(x) && x.slope < 18 && touchesCirc(x))
            .sort((p, q) => p.slope - q.slope);
          const bySize = [...mix].sort((p, q) => q.lotCols * q.lotDepth - p.lotCols * p.lotDepth);
          for (const type of bySize) {
            for (const a of anchors) {
              if (type.count - type.placed <= 0) break;
              let placedIt = false;
              for (const [h, w] of [[type.lotDepth, type.lotCols], [type.lotCols, type.lotDepth]]) {
                if (placedIt) break;
                // Try the anchor as each corner of the patch.
                for (const [r0, c0] of [[0, 0], [0, 1 - w], [1 - h, 0], [1 - h, 1 - w]]) {
                  const patch = [];
                  for (let dr = 0; dr < h; dr++) {
                    for (let dc = 0; dc < w; dc++) {
                      const cand = at(a.r + r0 + dr, a.c + c0 + dc);
                      if (isFree(cand) && cand.slope < 20) patch.push(cand);
                    }
                  }
                  if (patch.length >= h * w - 1) {
                    type.placed++;
                    placedIt = true;
                    const lotId = `${type.type[0]}-${String(type.placed).padStart(2, '0')}`;
                    for (const cand of patch) {
                      cand.zoneId = 'Z2';
                      cand.lotId = lotId;
                      cand.lotType = type.type;
                      claimed.residences += cand.area;
                    }
                    lots.push({ id: lotId, type: type.type, cells: patch });
                    break;
                  }
                }
              }
            }
          }
        }

        // Still-unplaced units get PATH-SERVED clusters — the deck's own
        // access model (units reached on foot/buggy from core parking): take
        // the flattest free pocket anywhere on the dehesa and connect it to
        // circulation with a pedestrian spur.
        if (mixRemaining() > 0) {
          const bySize = [...mix].sort((p, q) => q.lotCols * q.lotDepth - p.lotCols * p.lotDepth);
          for (const type of bySize) {
            while (type.count - type.placed > 0) {
              let bestWin = null;
              for (const [h, w] of [[type.lotDepth, type.lotCols], [type.lotCols, type.lotDepth]]) {
                for (let r0 = 0; r0 <= rows - h; r0++) {
                  for (let c0 = 0; c0 <= cols - w; c0++) {
                    let sum = 0;
                    const patch = [];
                    for (let dr = 0; dr < h; dr++) {
                      for (let dc = 0; dc < w; dc++) {
                        const cand = at(r0 + dr, c0 + dc);
                        if (isFree(cand) && cand.slope < 20) { patch.push(cand); sum += cand.slope; }
                      }
                    }
                    if (patch.length < h * w - 1) continue;
                    const score = sum / patch.length;
                    if (!bestWin || score < bestWin.score) bestWin = { patch, score };
                  }
                }
              }
              if (!bestWin) break;
              const anchor = bestWin.patch[0];
              let nearest = null;
              for (const cc of cells) {
                if (cc.kind !== 'road' && cc.kind !== 'street' && cc.kind !== 'path') continue;
                const d = distM(anchor.cLat, anchor.cLng, cc.cLat, cc.cLng);
                if (!nearest || d < nearest.d) nearest = { cc, d };
              }
              if (!nearest || nearest.d > cellSideM * 14) break; // too remote to serve
              type.placed++;
              const lotId = `${type.type[0]}-${String(type.placed).padStart(2, '0')}`;
              for (const cand of bestWin.patch) {
                cand.zoneId = 'Z2';
                cand.lotId = lotId;
                cand.lotType = type.type;
                claimed.residences += cand.area;
              }
              lots.push({ id: lotId, type: type.type, cells: bestWin.patch });
              // Pedestrian spur: walk toward the nearest circulation cell,
              // marking free cells as path (crossing the buffer is allowed —
              // green uses and circulation crossings only).
              let pr = anchor.r, pc = anchor.c, steps = 20;
              while (steps-- > 0 && (pr !== nearest.cc.r || pc !== nearest.cc.c)) {
                pr += Math.sign(nearest.cc.r - pr);
                pc += Math.sign(nearest.cc.c - pc);
                const cand = at(pr, pc);
                if (!cand || cand.kind) break; // reached circulation or blocked
                if (!cand.zoneId) cand.kind = 'path';
              }
            }
          }
        }

        // Prune dead pavement: a street cell with no villa lot within two
        // cells serves nothing — return it to dehesa. This drops unused
        // second-pass streets and the tails beyond each street's last bay,
        // and recovers open land.
        let prunedStreetMax = 0;
        for (const cell of cells) {
          if (cell.kind !== 'street') continue;
          let serves = false;
          for (let dr = -2; dr <= 2 && !serves; dr++) {
            for (let dc = -2; dc <= 2 && !serves; dc++) {
              const n = at(cell.r + dr, cell.c + dc);
              if (n && n.lotId) serves = true;
            }
          }
          if (!serves) {
            cell.kind = null;
            cell.grade = undefined;
          } else if (cell.grade > prunedStreetMax) {
            prunedStreetMax = cell.grade;
          }
        }
        streetMaxGrade = prunedStreetMax;

        // --- 7. Parking: Ley 9/2001 standard (1.5 pl/100 m² built, 25 m²/pl).
        // Basement levels under the hotel+spa core carry the demand; only a
        // small visitor pocket (plus any law-required remainder) takes ground
        // at the entry.
        {
          const law = planning.legal.cessions;
          parkingRequiredM2 = (achievedBuilt() / 100) * law.parkingSpacesPer100m2Built * law.parkingSpaceM2;
          parkingBasementM2 = (claimed.hotel + claimed.spa) * (PROG.parkingBasementLevels ?? 2);
          const surfaceNeed = Math.max(0, parkingRequiredM2 - parkingBasementM2) + (PROG.visitorPocketM2 ?? 500);
          const candidates = cells
            .filter(isFree)
            .sort((p, q) =>
              distM(p.cLat, p.cLng, start.cLat, start.cLng) -
              distM(q.cLat, q.cLng, start.cLat, start.cLng));
          let acc = 0;
          for (const x of candidates) {
            if (acc >= surfaceNeed) break;
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
      // Every polygon is registered with its base style and phase so the
      // phase buttons on the card can ghost everything outside a phase.
      const rendered = [];
      const phaseOf = (cell) =>
        cell.programId ? progItem(cell.programId).phase
          : cell.lotId ? 'P1'
            : cell.kind ? 'P1'
              : null;
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

        const gradeFill = (g, base) => (g == null ? base : g > 10 ? '#b91c1c' : g > 6 ? '#b45309' : base);
        const gradeNote = cell.grade != null ? `<br>Grade: ${cell.grade.toFixed(1)}%${cell.grade > 10 ? ' ⚠ earthworks/reroute' : cell.grade > 6 ? ' ◐ steep' : ''}` : '';

        let style, popup;
        if (cell.kind === 'road') {
          counts.road++;
          style = { ...KIND_STYLES.road, fillColor: gradeFill(cell.grade, KIND_STYLES.road.fillColor) };
          popup = `<b>${ref} · Main access road</b><br>Contour-following; enters from Calle Berrocal (E).${gradeNote}<br>${facts}`;
        } else if (cell.kind === 'street') {
          counts.street++;
          style = { ...KIND_STYLES.street, fillColor: gradeFill(cell.grade, KIND_STYLES.street.fillColor) };
          popup = `<b>${ref} · Residential street</b><br>Downhill branch serving the villa lots.${gradeNote}<br>${facts}`;
        } else if (cell.kind === 'path') {
          counts.path++;
          style = KIND_STYLES.path;
          popup = `<b>${ref} · Pedestrian path</b><br>Cut between villa lots — connects streets to the dehesa.<br>${facts}`;
        } else if (cell.kind === 'parking') {
          counts.parking++;
          style = KIND_STYLES.parking;
          popup = `<b>${ref} · Visitor parking (surface)</b><br>Entry pocket for the law-required remainder — the core's demand parks in the basement under hotel + spa (~${Math.round(parkingBasementM2).toLocaleString('en')} m²).<br>${facts}`;
        } else if (cell.protected) {
          counts.protected = (counts.protected || 0) + 1;
          const featStyle = { tree: '#166534', outcrop: '#78716c', watercourse: '#0369a1' };
          if (featStyle[cell.protReason]) {
            counts[`feat_${cell.protReason}`] = (counts[`feat_${cell.protReason}`] || 0) + 1;
            style = { color: featStyle[cell.protReason], weight: 0.5, fillColor: featStyle[cell.protReason], fillOpacity: 0.5 };
            const label = cell.protReason === 'tree' ? 'Arbolado existente (conservar)'
              : cell.protReason === 'outcrop' ? 'Afloramiento granítico (sin excavación)'
                : 'Vaguada / posible cauce (verde)';
            popup = `<b>${ref} · ${label}</b><br><span style="font-size:11px;color:#555">${cell.featureName || ''} — leído de imagen aérea (estimación visual; sustituir por LiDAR + inventario de arbolado).</span><br>Sin desarrollo; el plan se traza alrededor.<br>${facts}`;
          } else {
            style = KIND_STYLES.protected;
            popup = cell.protReason === 'polygon'
              ? `<b>${ref} · Protección verificada</b><br>Dentro de un polígono de protección de planning-config (PRCAM / vía pecuaria / DPH). Sin desarrollo.<br>${facts}`
              : `<b>${ref} · Perimeter buffer</b><br>${planning.exclusions.perimeterBufferNote}<br>${facts}`;
          }
        } else {
          const zone = ZONES[cell.zoneId];
          counts[cell.zoneId] = (counts[cell.zoneId] || 0) + 1;
          if (cell.score != null) {
            const bright = 0.15 + (cell.score / 100) * 0.45;
            const color = cell.programId === 'spa' ? SPA_COLOR : zone.color;
            style = { color, weight: cell.anchor ? 0.9 : 0.5, fillColor: color, fillOpacity: bright };
            const verdict = cell.score > 70 ? '✓ Optimal' : cell.score > 50 ? '◐ Acceptable' : '✗ Constrained';
            const prog = cell.programId ? progItem(cell.programId) : null;
            const unitType = cell.lotType ? mix.find((m) => m.type === cell.lotType) : null;
            const title = prog ? `${prog.name} · ${prog.phase}` : `${zone.name} (${cell.zoneId})`;
            const anchorNote = cell.anchor
              ? `<br><b>${cell.anchor === 'tree' ? '🌳 Junto a arbolado' : '🪨 Junto a afloramiento'}</b> — emplazamiento premium (+15).`
              : '';
            popup =
              `<b>${ref} · ${title}</b>` +
              (prog?.note ? `<br><span style="font-size:11px;color:#555">${prog.note}</span>` : '') +
              (cell.lotId ? `<br>Lot <b>${cell.lotId}</b> · <b>${cell.lotType}</b>${unitType ? ` — ${unitType.builtM2} m² unit, ${unitType.siting}` : ''}<br>Combine/split freely at cell resolution.` : '') +
              anchorNote +
              `<br>${facts}<br><b>Buildability: ${cell.score.toFixed(0)}/100</b> ${verdict}`;
          } else {
            style = { color: '#65a30d', weight: 0.4, fillColor: zone.color, fillOpacity: 0.2 };
            popup = `<b>${ref} · ${zone.name} (${cell.zoneId})</b><br>Green meadow / dehesa.<br>${facts}`;
          }
        }
        const cellLayer = L.polygon(cell.poly, { renderer, ...style }).bindPopup(popup);
        rendered.push({ layer: cellLayer, style, phase: phaseOf(cell) });
        group.addLayer(cellLayer);
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
          lotExports.push({ id: lotId, type: lotCells[0].lotType, outline, areaM2: lotCells.reduce((s, x) => s + x.area, 0) });
          const outlineStyle = { color: '#9a3412', weight: 1.6, fill: false, opacity: 1 };
          const outlineLayer = L.polygon(outline, { renderer, ...outlineStyle, interactive: false });
          rendered.push({ layer: outlineLayer, style: outlineStyle, phase: 'P1' });
          group.addLayer(outlineLayer);
        }
      }

      // --- 9. Cessions ledger (cuadro de superficies + Ley 9/2001 checks
      //        + program reconciliation: target vs achieved per brief item). --
      const areas = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, road: 0, street: 0, path: 0, parking: 0, protected: 0 };
      for (const cell of cells) {
        if (cell.kind) areas[cell.kind] += cell.area;
        else if (cell.protected) areas.protected += cell.area;
        else areas[cell.zoneId] += cell.area;
      }
      // Achieved GFA comes from the PROGRAM (designed buildings), not from a
      // blanket land×ratio — the zoning ratios stay as caps checked below.
      const edif = {
        Z1: builtOf('hotel') + builtOf('spa'),
        Z2: residencesBuilt(),
        Z3: builtOf('vpp'),
        Z4: builtOf('equestrian'),
      };
      const totalEdif = achievedBuilt();
      const law = planning.legal.cessions;
      const greenProvided = areas.Z5 + areas.protected + areas.path;
      const greenRequired = (totalEdif / 100) * law.greenMinM2per100m2Built;
      const vppShare = edif.Z2 + edif.Z3 > 0 ? edif.Z3 / (edif.Z2 + edif.Z3) : 0;
      const parkingProvided = (areas.parking + parkingBasementM2) / law.parkingSpaceM2;
      const parkingRequired = parkingRequiredM2 / law.parkingSpaceM2;
      // Open (unsealed) land: site minus building footprints and hard
      // circulation. Villa gardens and the dehesa count as open; paths are
      // permeable; basement parking sits under the core's footprint. Lane
      // cells count 60% sealed — an ~8 m cell carries a ~5 m carriageway,
      // the rest is verge.
      // Residences count HALF-sealed: single-storey units on stilts (deck:
      // no excavation, craned modules) — the ground beneath stays permeable.
      const footprints = PROG.items.reduce(
        (s, item) => s + (item.id === 'residences' ? residencesBuilt() * 0.5 : builtOf(item.id) / item.floors), 0);
      const sealed = footprints + 0.6 * (areas.road + areas.street) + areas.parking;
      const openShare = 1 - sealed / siteArea;
      const hotelProg = progItem('hotel');
      const program = [
        { name: `Hotel · ${hotelProg.keys} keys`, phase: hotelProg.phase, targetM2: hotelProg.builtM2, achievedM2: builtOf('hotel') },
        { name: 'Spa & restaurante', phase: progItem('spa').phase, targetM2: progItem('spa').builtM2, achievedM2: builtOf('spa') },
        ...mix.map((m) => ({
          name: `${m.type} ×${m.count}`, phase: 'P1',
          targetUnits: m.count, achievedUnits: m.placed,
          targetM2: m.count * m.builtM2, achievedM2: m.placed * m.builtM2,
        })),
        { name: 'VPP', phase: progItem('vpp').phase, targetM2: progItem('vpp').builtM2, achievedM2: builtOf('vpp') },
        { name: 'Ecuestre', phase: progItem('equestrian').phase, targetM2: progItem('equestrian').builtM2, achievedM2: builtOf('equestrian') },
      ].map((p) => ({ ...p, ok: p.achievedM2 >= p.targetM2 * 0.95 }));
      const ledger = {
        siteArea,
        totalEdif,
        rows: [
          { name: 'Hotel (Z1)', area: claimed.hotel, pct: claimed.hotel / siteArea, edif: builtOf('hotel') },
          { name: 'Spa & rest. (Z1)', area: claimed.spa, pct: claimed.spa / siteArea, edif: builtOf('spa') },
          { name: 'Villas (Z2)', area: areas.Z2, pct: areas.Z2 / siteArea, edif: edif.Z2 },
          { name: 'VPP (Z3)', area: areas.Z3, pct: areas.Z3 / siteArea, edif: edif.Z3 },
          { name: 'Ecuestre (Z4)', area: areas.Z4, pct: areas.Z4 / siteArea, edif: edif.Z4 },
          { name: 'Dehesa / verde (Z5)', area: areas.Z5, pct: areas.Z5 / siteArea },
          { name: 'Franja perimetral', area: areas.protected, pct: areas.protected / siteArea },
          { name: 'Viario (vial + calles)', area: areas.road + areas.street, pct: (areas.road + areas.street) / siteArea },
          { name: 'Sendas peatonales', area: areas.path, pct: areas.path / siteArea },
          { name: 'Aparcamiento superficie', area: areas.parking, pct: areas.parking / siteArea },
        ],
        program,
        checks: [
          { label: `Verde ≥ ${law.greenMinM2per100m2Built} m²/100 m² edif.`, value: `${Math.round(greenProvided).toLocaleString('en')} m²`, required: `${Math.round(greenRequired).toLocaleString('en')} m²`, ok: greenProvided >= greenRequired },
          { label: `VPP ≥ ${law.vppMinShareOfResidentialEdif * 100}% edif. residencial`, value: `${(vppShare * 100).toFixed(0)}%`, required: `${law.vppMinShareOfResidentialEdif * 100}%`, ok: vppShare >= law.vppMinShareOfResidentialEdif },
          { label: `Aparcamiento ≥ ${law.parkingSpacesPer100m2Built} pl/100 m² (sót.+sup.)`, value: `${Math.round(parkingProvided)} pl`, required: `${Math.round(parkingRequired)} pl`, ok: parkingProvided >= parkingRequired },
          { label: `Suelo abierto ≥ ${PROG.openShareMin * 100}%`, value: `${(openShare * 100).toFixed(0)}%`, required: `${PROG.openShareMin * 100}%`, ok: openShare >= PROG.openShareMin },
          { label: 'Pendiente vial ppal. ≤ 10%', value: `máx ${roadMaxGrade.toFixed(1)}%`, required: '10%', ok: roadMaxGrade <= 10 },
          { label: 'Pendiente calles ≤ 16%', value: `máx ${streetMaxGrade.toFixed(1)}%`, required: '16%', ok: streetMaxGrade <= 16 },
        ],
        viario: { roadLenM, roadAvgGrade, roadMaxGrade, streetMaxGrade },
      };

      // Phase filter: show one phase full-strength, dim the landscape, ghost
      // the rest. 'all' restores every base style.
      const setPhase = (p) => {
        for (const e of rendered) {
          if (p === 'all' || e.phase === p) e.layer.setStyle(e.style);
          else if (e.phase === null) {
            e.layer.setStyle({ ...e.style, fillOpacity: (e.style.fillOpacity ?? 0.2) * 0.5, opacity: 0.4 });
          } else {
            e.layer.setStyle({ ...e.style, fillOpacity: 0.05, opacity: 0.1 });
          }
        }
      };

      // --- 10. On-map summary control: cuadro, checks, export buttons. ------
      control = L.control({ position: 'bottomleft' });
      control.onAdd = () => {
        const el = L.DomUtil.create('div', 'mp-summary');
        el.style.cssText = 'background:rgba(17,24,39,.92);color:#e5e7eb;padding:10px 12px;border-radius:8px;font:11px/1.5 system-ui;max-width:260px;box-shadow:0 2px 10px rgba(0,0,0,.4)';
        const rows = ledger.rows.filter((row) => row.area > 0).map((row) =>
          `<tr><td>${row.name}</td><td style="text-align:right">${Math.round(row.area).toLocaleString('en')}</td><td style="text-align:right">${(row.pct * 100).toFixed(1)}%</td></tr>`).join('');
        const checks = ledger.checks.map((check) =>
          `<div>${check.ok ? '✅' : '❌'} ${check.label}: <b>${check.value}</b> / req. ${check.required}</div>`).join('');
        const programRows = ledger.program.map((p) => {
          const val = p.targetUnits != null
            ? `${p.achievedUnits}/${p.targetUnits} uds`
            : `${Math.round(p.achievedM2).toLocaleString('en')}/${Math.round(p.targetM2).toLocaleString('en')} m²`;
          return `<div>${p.ok ? '✅' : '◐'} ${p.name} <span style="color:#9ca3af">(${p.phase})</span>: <b>${val}</b></div>`;
        }).join('');
        const v = ledger.viario;
        const inp = (f, val, w = 44) =>
          `<input data-f="${f}" type="number" value="${val}" min="0" style="width:${w}px;background:#111827;color:#e5e7eb;border:1px solid #4b5563;border-radius:4px;padding:1px 3px">`;
        const baseIt = (id) => planning.program.items.find((x) => x.id === id);
        const curMix = Object.fromEntries(mix.map((m) => [m.type, m.count]));
        el.innerHTML =
          `<b>Cuadro de superficies</b> · ${Math.round(siteArea).toLocaleString('en')} m²` +
          `<table style="border-collapse:collapse;width:100%;margin:4px 0">${rows}</table>` +
          `<div style="margin:4px 0">Edificabilidad total: <b>${Math.round(totalEdif).toLocaleString('en')} m²</b></div>` +
          `<div style="margin:2px 0;color:#9ca3af">Vial ppal. ${Math.round(v.roadLenM)} m · pdte. media ${v.roadAvgGrade.toFixed(1)}% · máx ${v.roadMaxGrade.toFixed(1)}% · calles máx ${v.streetMaxGrade.toFixed(1)}%</div>` +
          `<div style="margin:4px 0;border-top:1px solid #374151;padding-top:4px"><b>Programa ${progOverride ? '(editado)' : 'v0.4'} — objetivo → logrado</b>${programRows}</div>` +
          `${checks}` +
          `<div style="margin-top:6px"><b>Fase:</b> ` +
          ['all', 'P1', 'P2', 'P3'].map((p) =>
            `<button data-ph="${p}" style="margin-right:4px">${p === 'all' ? 'Todo' : p}</button>`).join('') +
          `</div>` +
          `<details style="margin-top:6px"><summary style="cursor:pointer"><b>Editar programa</b></summary>` +
          `<div style="display:grid;grid-template-columns:auto auto;gap:3px 6px;margin:6px 0;align-items:center">` +
          `<span>Hotel (keys)</span>${inp('keys', PROG.items.find((x) => x.id === 'hotel').keys)}` +
          `<span>Spa+rest. (m²)</span>${inp('spa', Math.round(PROG.items.find((x) => x.id === 'spa').builtM2), 56)}` +
          `<span>Echo (uds)</span>${inp('echo', curMix.Echo)}` +
          `<span>Duo (uds)</span>${inp('duo', curMix.Duo)}` +
          `<span>Grand (uds)</span>${inp('grand', curMix.Grand)}` +
          `<span>VPP (m²)</span>${inp('vpp', Math.round(PROG.items.find((x) => x.id === 'vpp').builtM2), 56)}` +
          `</div>` +
          `<button data-x="rebuild">Recalcular plan</button> <button data-x="reset">Base v0.4</button>` +
          `</details>` +
          `<div style="margin-top:6px;display:flex;gap:6px">` +
          `<button data-x="geojson">GeoJSON</button><button data-x="dxf">DXF (UTM30)</button><button data-x="csv">Cuadro CSV</button></div>` +
          `<div style="color:#9ca3af;margin-top:4px">Parámetros: ${planning.legal.cessions.source}. Zonas: hipótesis de trabajo.</div>`;
        L.DomEvent.disableClickPropagation(el);
        el.addEventListener('click', (ev) => {
          const kind = ev.target?.dataset?.x;
          if (kind === 'geojson') download('boalo-masterplan.geojson', 'application/geo+json', cellsToGeoJSON(cells, rings, { rc: rcUsed, site_m2: Math.round(siteArea) }));
          if (kind === 'dxf') download('boalo-masterplan-utm30.dxf', 'application/dxf', cellsToDXF(cells, lotExports, rings));
          if (kind === 'csv') download('boalo-cuadro-superficies.csv', 'text/csv', ledgerToCSV(ledger));
          if (kind === 'reset') build();
          if (kind === 'rebuild') {
            // Clone the BASE brief and patch it from the form; derived land
            // needs scale at the base built:land ratios.
            const val = (f) => Math.max(0, parseFloat(el.querySelector(`input[data-f="${f}"]`)?.value) || 0);
            const ov = JSON.parse(JSON.stringify(planning.program));
            const it = (id) => ov.items.find((x) => x.id === id);
            const keys = Math.max(1, Math.round(val('keys')));
            const hb = baseIt('hotel');
            it('hotel').keys = keys;
            it('hotel').builtM2 = Math.round(keys * (hb.builtM2 / hb.keys));
            it('hotel').landM2 = Math.round(keys * (hb.landM2 / hb.keys));
            const sb = baseIt('spa');
            it('spa').builtM2 = val('spa');
            it('spa').landM2 = Math.max(200, Math.round(val('spa') * (sb.landM2 / sb.builtM2)));
            const vb = baseIt('vpp');
            it('vpp').builtM2 = val('vpp');
            it('vpp').landM2 = Math.max(200, Math.round(val('vpp') * (vb.landM2 / vb.builtM2)));
            const m = (t) => it('residences').unitMix.find((x) => x.type === t);
            m('Echo').count = Math.round(val('echo'));
            m('Duo').count = Math.round(val('duo'));
            m('Grand').count = Math.round(val('grand'));
            build(ov);
          }
          const ph = ev.target?.dataset?.ph;
          if (ph) {
            setPhase(ph);
            el.querySelectorAll('button[data-ph]').forEach((btn) => {
              btn.style.fontWeight = btn.dataset.ph === ph ? '700' : '400';
            });
          }
        });
        return el;
      };
      const attachControl = () => { if (group._map) control.addTo(group._map); };
      group.on('add', attachControl);
      group.on('remove', () => control.remove());
      attachControl(); // layer may already be on the map (async build)

      console.info('[microparcels]', cells.length, 'cells;', lots.size, 'villa lots;',
        'mix:', mix.map((m) => `${m.type} ${m.placed}/${m.count}`).join(' '), '| counts:', counts,
        '| terrain:', source, '| parcel:', rcUsed ?? 'footprint', `| site ${Math.round(siteArea)} m²`,
        '| edif', Math.round(totalEdif), 'm² | program:', ledger.program.map((p) => `${p.name}=${p.ok ? 'ok' : 'short'}`).join(', '),
        '| checks:', ledger.checks.map((c) => `${c.label}=${c.ok}`).join(', '));
    };
    // 'add' fires when the layer is toggled on (main.js instantiates then
    // addTo). Build there — one build per activation — and re-lay whenever a
    // protected-land layer adds/retracts an exclusion while we're on the map.
    let onMap = false;
    protectedStore.subscribe(() => { if (onMap) build(); });
    group.on('add', () => { onMap = true; build(); });
    group.on('remove', () => { onMap = false; });

    return group;
  },
};
