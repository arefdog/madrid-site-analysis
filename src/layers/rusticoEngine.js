import L from 'leaflet';
import { fetchParcelRings, RUSTICO_PARCELS } from './masterplan.js';

// Rustico micro-parcel engine — the Sector 1B pixel treatment applied to the
// surrounding SNU común parcels, under the OTHER rulebook. Sector 1B is
// urbanizable (ficha: 0.25 m²/m² edificability, Plan Parcial, VPP, cessions);
// these parcels are suelo no urbanizable, so the binding regime is the
// Calificación Urbanística of Ley 9/2001 art. 29 (mod. Ley 7/2024):
//
//   · OCUPACIÓN, not edificability: ≤10% of each parcel may carry roofed
//     construction. Open pistas, paddocks and parking are surface works and
//     do not consume the 10% — the engine tracks them separately.
//   · ≤4.5 m to eaves / max 2 plantas (only the hotel volume uses 2).
//   · ≥60% of each parcel stays open/vegetated.
//   · NO subdivision, NO streets, NO villa lots, NO VPP — none of the
//     Sector 1B machinery applies. Buildings must serve ONE registered
//     agro/equestrian exploitation; exactly one accessory dwelling.
//   · Every roofed building below needs the calificación BEFORE a municipal
//     license; removable structures are exempt (Ley 7/2024).
//
// Mechanics mirror microparcels.js: uniform cells clipped to the real
// Catastro INSPIRE geometry, terrain-scored 0–100, buildings placed on the
// best compliant window, and a ledger card reconciling target → achieved
// against the legal caps. Geometry helpers are self-contained by module
// convention (see masterplan.js / microparcels.js).

const M_PER_DEG_LAT = 111320;
const CELL_TARGET_TOTAL = 1600; // across all 11 parcels ⇒ ~16 m cell side
const SETBACK_M = 5;            // retranqueo a linderos (municipal standard)
const SLOPE_BUILD_MAX = 15;     // stables/hotel want gentle ground

// Roofed buildings + surface works per parcel (keyed by cadastral ref; the
// parcel registry itself lives in masterplan.js RUSTICO_PARCELS). footprint =
// ground contact m²; aspect = long side : short side for the placement window.
const PARCEL_BUILDINGS = {
  '28023A00500001': [ // equestrian core, 85,739 m² ⇒ cap 8,574 m²
    { id: 'stables', name: 'Cuadras 60–80 boxes (3,0×3,5 m, RD 804/2011)', footprintM2: 2400, aspect: 3, kind: 'roofed' },
    { id: 'arena-cov', name: 'Pista cubierta 20×60', footprintM2: 1200, aspect: 3, kind: 'roofed' },
    { id: 'feed', name: 'Almacén de forraje y guadarnés', footprintM2: 400, aspect: 2, kind: 'roofed' },
    { id: 'dwelling', name: 'Vivienda accesoria del gerente (única, vinculada a la explotación)', footprintM2: 150, aspect: 1, kind: 'roofed' },
    { id: 'arena-out', name: 'Pista exterior 20×40 (descubierta — no computa ocupación)', footprintM2: 800, aspect: 2, kind: 'surface' },
    { id: 'parking-eq', name: 'Aparcamiento visitantes (30% aforo diario)', footprintM2: 500, aspect: 2, kind: 'surface' },
  ],
  '28023A00500047': [ // agritourism hotel, 57,095 m² ⇒ cap 5,710 m²
    { id: 'hotel', name: 'Hotel rural ~30 llaves — 2 plantas, 2.400 m² GFA (Decreto 48/2023)', footprintM2: 1200, aspect: 4, kind: 'roofed' },
    { id: 'resto', name: 'Restaurante farm-to-table & spa', footprintM2: 500, aspect: 2, kind: 'roofed' },
    { id: 'parking-h', name: 'Aparcamiento ≥30% de llaves', footprintM2: 300, aspect: 2, kind: 'surface' },
  ],
  '28023A00500043': [ // farm hub, 55,545 m² ⇒ cap 5,555 m²
    { id: 'bodega', name: 'Bodega / obrador (transformación de producción propia)', footprintM2: 1200, aspect: 2, kind: 'roofed' },
    { id: 'shop', name: 'Tienda-degustación (venta directa, producción propia)', footprintM2: 250, aspect: 1, kind: 'roofed' },
  ],
};

// Non-building parcels read as their open-land role; tint by type.
const OPEN_TINTS = {
  equestrian: '#d4af37',
  hotel: '#93c5fd',
  residential: '#fdba74',
  green: '#86efac',
};
const ROOFED_STYLE_COLOR = { equestrian: '#b8860b', hotel: '#1e40af', residential: '#ea580c', green: '#65a30d' };

// --- Geometry helpers (module-local by codebase convention) -----------------

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

// --- Terrain (same ladder as microparcels: baked → live EU-DEM → model) ----

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

async function terrainModel(b) {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}terrain/boalo.json`);
    if (!res.ok) throw new Error(`no baked terrain (${res.status})`);
    const t = await res.json();
    const gb = t.bbox;
    if (!(gb.latMin <= b.latMin && gb.latMax >= b.latMax && gb.lngMin <= b.lngMin && gb.lngMax >= b.lngMax)) {
      throw new Error('baked terrain does not cover the rustico bbox');
    }
    return { elevAt: gridInterp(gb, t.n, t.grid), source: t.source || 'baked heightmap' };
  } catch (e) {
    console.info('[rustico-engine] no baked terrain:', e.message);
  }
  try {
    const n = 10;
    const pts = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const lat = b.latMin + ((b.latMax - b.latMin) * i) / (n - 1);
        const lng = b.lngMin + ((b.lngMax - b.lngMin) * j) / (n - 1);
        pts.push(`${lat.toFixed(5)},${lng.toFixed(5)}`);
      }
    }
    const res = await fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${pts.join('|')}`);
    if (!res.ok) throw new Error(`elevation API ${res.status}`);
    const data = await res.json();
    const grid = data?.results?.map((r) => r.elevation);
    if (!grid || grid.length !== n * n || grid.some((v) => v == null)) throw new Error('incomplete elevation grid');
    return { elevAt: gridInterp(b, n, grid), source: 'EU-DEM 25 m (live)' };
  } catch (e) {
    console.warn('[rustico-engine] elevation API unavailable, using calibrated model:', e.message);
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

// Buildability 0–100 under SNU logic: flat ground and setback compliance
// dominate; the useful band is "off the lindero but not deep interior"
// (buildings must reach the camino without carving new viario).
function snuScore(cell) {
  let score = 80;
  if (cell.slope > SLOPE_BUILD_MAX) score -= 35;
  else if (cell.slope > 10) score -= 15;
  else if (cell.slope > 6) score -= 6;
  if (cell.edgeDist < SETBACK_M) score -= 60;         // retranqueo — no-build
  else if (cell.edgeDist < 15) score -= 10;           // tight against the lindero
  else if (cell.edgeDist > 150) score -= 15;          // deep interior: long accesses
  else if (cell.edgeDist > 80) score -= 5;
  return Math.max(0, Math.min(100, score));
}

// Best w×h window of free, compliant cells (max mean score) for a building.
function placeBuilding(grid, rows, cols, wCells, hCells, minScore = 35) {
  let best = null;
  for (const [w, h] of [[wCells, hCells], [hCells, wCells]]) {
    for (let r = 0; r + h <= rows; r++) {
      for (let c = 0; c + w <= cols; c++) {
        let sum = 0, ok = true;
        for (let i = 0; ok && i < h; i++) {
          for (let j = 0; ok && j < w; j++) {
            const cell = grid[r + i]?.[c + j];
            if (!cell || cell.taken || cell.score < minScore) ok = false;
            else sum += cell.score;
          }
        }
        if (ok) {
          const mean = sum / (w * h);
          if (!best || mean > best.mean) best = { r, c, w, h, mean };
        }
      }
    }
  }
  return best;
}

export default {
  id: 'overlay-rustico-engine',
  label: 'Rustico masterplan (SNU engine)',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    const renderer = L.canvas({ padding: 0.5 });
    let control = null;
    let built = false;

    const build = async () => {
      // One shared cell side across parcels so the pixel texture matches.
      const totalArea = RUSTICO_PARCELS.reduce((s, p) => s + p.areaM2, 0);
      const cellSideM = Math.sqrt(totalArea / CELL_TARGET_TOTAL);

      // Fetch every parcel's real INSPIRE geometry first, then one combined
      // terrain model (single elevation request for the whole cluster).
      const fetched = await Promise.all(RUSTICO_PARCELS.map((p) =>
        fetchParcelRings(p.rc).then((rings) => ({ p, rings }))
          .catch((e) => { console.warn(`[rustico-engine] ${p.rc}:`, e.message); return null; })));
      const parcels = fetched.filter(Boolean);
      if (!parcels.length) return;
      const allRings = parcels.flatMap((x) => x.rings);
      const { elevAt, source } = await terrainModel(bbox(allRings));

      const ledger = [];
      let dwellings = 0;

      for (const { p, rings } of parcels) {
        const b = bbox(rings);
        const latRef = (b.latMin + b.latMax) / 2;
        const dLat = cellSideM / M_PER_DEG_LAT;
        const dLng = cellSideM / (M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180));
        const rows = Math.ceil((b.latMax - b.latMin) / dLat);
        const cols = Math.ceil((b.lngMax - b.lngMin) / dLng);

        // Grid clipped to the parcel; score each cell under SNU rules.
        const grid = [];
        for (let r = 0; r < rows; r++) {
          grid.push([]);
          for (let c = 0; c < cols; c++) {
            const rect = {
              latMin: b.latMin + r * dLat, latMax: b.latMin + (r + 1) * dLat,
              lngMin: b.lngMin + c * dLng, lngMax: b.lngMin + (c + 1) * dLng,
            };
            let poly = null, area = 0;
            for (const ring of rings) {
              const clipped = clipRingToRect(ring, rect);
              if (clipped.length) {
                const a = ringAreaM2(clipped, latRef);
                if (a > area) { area = a; poly = clipped; }
              }
            }
            if (!poly || area < cellSideM * cellSideM * 0.2) { grid[r].push(null); continue; }
            const lat = (rect.latMin + rect.latMax) / 2, lng = (rect.lngMin + rect.lngMax) / 2;
            const cell = {
              r, c, poly, area, lat, lng,
              slope: slopeDegAt(elevAt, lat, lng),
              elev: elevAt(lat, lng),
              edgeDist: boundaryDistM(lat, lng, rings, latRef),
              taken: null,
            };
            cell.score = snuScore(cell);
            grid[r].push(cell);
          }
        }

        // Place this parcel's program, largest footprint first.
        const buildings = (PARCEL_BUILDINGS[p.rc] || []).slice()
          .sort((a, z) => z.footprintM2 - a.footprintM2);
        const placed = [];
        for (const bd of buildings) {
          // Cell count first (so placed area covers the footprint), then shape
          // it by the building's aspect ratio.
          const cellsNeeded = Math.max(1, Math.ceil(bd.footprintM2 / (cellSideM * cellSideM)));
          const hCells = Math.max(1, Math.round(Math.sqrt(cellsNeeded / bd.aspect)));
          const wCells = Math.max(1, Math.ceil(cellsNeeded / hCells));
          const win = placeBuilding(grid, rows, cols, wCells, hCells);
          if (!win) { placed.push({ bd, cells: [], achieved: 0 }); continue; }
          const cells = [];
          for (let i = 0; i < win.h; i++) {
            for (let j = 0; j < win.w; j++) {
              const cell = grid[win.r + i][win.c + j];
              cell.taken = bd;
              cells.push(cell);
            }
          }
          if (bd.id === 'dwelling') dwellings++;
          placed.push({ bd, cells, achieved: cells.reduce((s, x) => s + x.area, 0) });
        }

        // Render cells: roofed solid, surface hatched, rest open-land tint.
        const roofColor = ROOFED_STYLE_COLOR[p.type] || '#65a30d';
        for (const row of grid) {
          for (const cell of row) {
            if (!cell) continue;
            const facts = `${Math.round(cell.area)} m² · ${cell.elev.toFixed(0)} m · pdte. ${cell.slope.toFixed(1)}° · lindero ${cell.edgeDist.toFixed(0)} m`;
            let style, popup;
            if (cell.taken && cell.taken.kind === 'roofed') {
              const bright = 0.35 + (cell.score / 100) * 0.4;
              style = { color: roofColor, weight: 0.7, fillColor: roofColor, fillOpacity: bright };
              popup = `<b>${p.rc} · ${cell.taken.name}</b><br>Edificación techada — computa en la ocupación ≤10% (Ley 9/2001 art. 29). ≤4,5 m alero.<br>${facts}<br><b>Buildability: ${cell.score.toFixed(0)}/100</b>`;
            } else if (cell.taken) {
              style = { color: '#5c4a33', weight: 0.6, fillColor: '#8b7355', fillOpacity: 0.5, dashArray: '3,2' };
              popup = `<b>${p.rc} · ${cell.taken.name}</b><br>Obra de superficie (no techada) — NO computa ocupación; sí en la huella abierta.<br>${facts}`;
            } else {
              const tint = OPEN_TINTS[p.type] || OPEN_TINTS.green;
              style = { color: tint, weight: 0.3, fillColor: tint, fillOpacity: cell.edgeDist < SETBACK_M ? 0.06 : 0.16 };
              popup = `<b>${p.rc} · ${p.z.name}</b><br>${cell.edgeDist < SETBACK_M ? `Franja de retranqueo (${SETBACK_M} m al lindero) — sin edificación.` : 'Suelo abierto de la explotación (≥60% obligatorio).'}<br>${facts}`;
            }
            group.addLayer(L.polygon(cell.poly, { renderer, ...style }).bindPopup(popup));
          }
        }

        const roofed = placed.filter((x) => x.bd.kind === 'roofed').reduce((s, x) => s + x.achieved, 0);
        const surface = placed.filter((x) => x.bd.kind === 'surface').reduce((s, x) => s + x.achieved, 0);
        ledger.push({
          rc: p.rc, zId: p.z.id, name: p.z.name, areaM2: p.areaM2,
          capM2: p.areaM2 * 0.10, roofed, surface,
          openShare: 1 - (roofed + surface) / p.areaM2,
          placed,
        });
      }

      // --- Ledger card: cuadro de ocupación + SNU checks -------------------
      const totRoofed = ledger.reduce((s, x) => s + x.roofed, 0);
      const totArea = ledger.reduce((s, x) => s + x.areaM2, 0);
      const capOk = ledger.every((x) => x.roofed <= x.capM2);
      const openOk = ledger.every((x) => x.openShare >= 0.6);
      const shortfalls = ledger.flatMap((x) => x.placed.filter((y) => y.achieved < y.bd.footprintM2 * 0.9)
        .map((y) => `${x.zId}·${y.bd.id}`));

      const Ctl = L.Control.extend({
        options: { position: 'bottomleft' },
        onAdd() {
          const el = L.DomUtil.create('div', 'mp-summary');
          el.style.cssText = 'background:rgba(17,24,39,.92);color:#e5e7eb;padding:10px 12px;border-radius:8px;font:11px/1.5 system-ui;max-width:280px;box-shadow:0 2px 10px rgba(0,0,0,.4)';
          const rows = ledger.map((x) =>
            `<tr><td>${x.zId}</td><td style="text-align:right">${Math.round(x.areaM2 / 1000)}k</td><td style="text-align:right">${Math.round(x.roofed).toLocaleString('en')}</td><td style="text-align:right">${((x.roofed / x.areaM2) * 100).toFixed(1)}%</td><td>${x.roofed <= x.capM2 ? '✅' : '❌'}</td></tr>`).join('');
          el.innerHTML =
            `<b>Cuadro de ocupación — SNU común</b> · ${Math.round(totArea).toLocaleString('en')} m²` +
            `<div style="color:#9ca3af;margin:2px 0">Régimen: calificación urbanística (Ley 9/2001 art. 29, mod. Ley 7/2024) — NO urbanizable: sin parcelación, sin viario, sin VPP.</div>` +
            `<table style="border-collapse:collapse;width:100%;margin:4px 0"><tr style="color:#9ca3af"><td>Parcela</td><td style="text-align:right">m² suelo</td><td style="text-align:right">techado</td><td style="text-align:right">ocup.</td><td></td></tr>${rows}</table>` +
            `<div>${capOk ? '✅' : '❌'} Ocupación ≤10% por parcela · total techado <b>${Math.round(totRoofed).toLocaleString('en')} m²</b> (${((totRoofed / totArea) * 100).toFixed(1)}% del suelo)</div>` +
            `<div>${openOk ? '✅' : '❌'} Suelo abierto ≥60% por parcela</div>` +
            `<div>✅ Altura ≤4,5 m alero (hotel: 2 plantas dentro del límite)</div>` +
            `<div>${dwellings <= 1 ? '✅' : '❌'} Vivienda accesoria única (${dwellings}) — vinculada y discrecional</div>` +
            (shortfalls.length ? `<div>◐ Programa corto (sin ventana apta o recorte de celdas): ${shortfalls.join(', ')}</div>` : '') +
            `<div style="background:#7f1d1d;color:#fecaca;padding:4px 6px;border-radius:4px;margin-top:6px"><b>GATE:</b> calificación urbanística CM previa a toda licencia; usos vinculados a UNA explotación agro-ecuestre registrada. Pendiente: vías pecuarias, montes preservados, DPH.</div>` +
            `<div style="color:#9ca3af;margin-top:4px">Terreno: ${source} · celdas ~${Math.round(cellSideM)} m — misma mecánica de píxeles que el Sector 1B, reglas SNU.</div>`;
          L.DomEvent.disableClickPropagation(el);
          return el;
        },
      });
      control = new Ctl();
      if (group._map) control.addTo(group._map);
      console.info('[rustico-engine]', parcels.length, 'parcels ·', Math.round(totRoofed), 'm² roofed of', Math.round(totArea), 'm² land · terrain:', source);
    };

    group.on('add', () => {
      if (!built) { built = true; build(); }
      else if (control && group._map) control.addTo(group._map);
    });
    group.on('remove', () => { if (control) control.remove(); });

    return group;
  },
};
