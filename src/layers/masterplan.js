import L from 'leaflet';
import { SOURCES } from '../config.js';
import { parseGmlRings } from './sites.js';
import sitesData from '../../data/sites.json';

// Masterplan zones drawn on the REAL parcel geometry. Each site's outline is
// fetched from the Catastro INSPIRE WFS (same endpoint as the sites layer);
// program zones are then carved out of that outline by clipping it against
// band rectangles, so every zone edge on the perimeter follows the official
// cadastral boundary. If Catastro is unreachable, the hand-drawn footprint
// from sites.json is used as the clipping subject instead.

const ZONE_STYLES = {
  roads: { color: '#2d3748', weight: 3, fillColor: '#4a5568', fillOpacity: 0.6 },
  residential: { color: '#ea580c', weight: 2, fillColor: '#f97316', fillOpacity: 0.5 },
  hotel: { color: '#1e40af', weight: 2, fillColor: '#1e40af', fillOpacity: 0.45 },
  vpp: { color: '#be185d', weight: 2, fillColor: '#ec4899', fillOpacity: 0.4 },
  equestrian: { color: '#b8860b', weight: 2, fillColor: '#d4af37', fillOpacity: 0.35 },
  green: { color: '#65a30d', weight: 1.5, fillColor: '#86efac', fillOpacity: 0.25, dashArray: '4 2' },
};

const SITES = Object.fromEntries(sitesData.sites.map((s) => [s.id, s]));

// ---------------------------------------------------------------------------
// Polygon clipping (Sutherland–Hodgman against an axis-aligned rectangle).
// Rings are [lat, lng] arrays; rects are {latMin, latMax, lngMin, lngMax}.

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

// A rect spanning the given fractions of the bbox (lat 0 = south, lng 0 = west).
function band(b, latFrom, latTo, lngFrom, lngTo) {
  const dLat = b.latMax - b.latMin;
  const dLng = b.lngMax - b.lngMin;
  return {
    latMin: b.latMin + dLat * latFrom,
    latMax: b.latMin + dLat * latTo,
    lngMin: b.lngMin + dLng * lngFrom,
    lngMax: b.lngMin + dLng * lngTo,
  };
}

// ---------------------------------------------------------------------------

function zonePopup(z) {
  const gate = z.phaseGate
    ? `<div style="background:#fca5a5;color:#7f1d1d;padding:4px 8px;border-radius:4px;font-size:11px;margin:8px 0"><b>${z.phaseGate}</b></div>`
    : '';
  return `
    <div style="font-size:12px;max-width:230px">
      <b>${z.name}</b> (${z.id})
      <div style="color:#555;font-size:11px;margin:4px 0">
        ${z.areaM2.toLocaleString('en')} m² · ${z.builtM2 ? `${z.builtM2.toLocaleString('en')} m² built` : 'open space'}
      </div>
      <div style="margin:6px 0;line-height:1.4;font-size:11px">${z.program}</div>
      ${gate}
      <div style="margin-top:6px;font-size:10px;color:#888"><code>${z.cteRef}</code></div>
    </div>`;
}

// Boalo — one large parcel carved into program bands. Fractions are placed by
// the design logic: VPP at the NW corner nearest the village road, hotel core
// hugging the western access edge, residences on the S/SE mid-slope contours,
// equestrian meadow on the flat east, dehesa commons = the whole remainder.
const BOALO_BANDS = [
  { latFrom: 0, latTo: 1, lngFrom: 0, lngTo: 1, type: 'green', z: {
    id: 'Z5', name: 'Dehesa commons', areaM2: 52863, builtM2: 0,
    program: '75% of the parcel held open: trail loop on the stone-wall spines, pozas path, water reserve for hydrants, dark-sky zone. Managed grazing; no lighting beyond bollards.',
    phaseGate: 'P0 FOUNDATIONAL: verify PRCAM/PNSG protected-land status; obtain favorable Consejería opinion (est. 12–18 months).',
    cteRef: 'PRCAM PORN · P.N. Guadarrama PRUG/ZPP · CTE DB-SI wildland-urban interface',
  } },
  { latFrom: 0.65, latTo: 1, lngFrom: 0, lngTo: 0.3, type: 'vpp', z: {
    id: 'Z3', name: 'VPP village edge', areaM2: 4500, builtM2: 3524,
    program: 'Regulated housing as a compact 2–3 storey piece on the corner nearest the village/road — connected to town, not embedded in the resort core. 39.5% of the residential component.',
    phaseGate: 'P3 GATED: delivery per instrument conditions.',
    cteRef: 'Ley 9/2001 (VPP ≥30% of residential edificability) · NNSS El Boalo heights',
  } },
  { latFrom: 0.2, latTo: 0.65, lngFrom: 0, lngTo: 0.32, type: 'hotel', z: {
    id: 'Z1', name: 'Arrival & core', areaM2: 14000, builtM2: 12158,
    program: '44-key landscape hotel + spa & farm-to-table restaurant + subterranean parking. Compact cluster at the western access, screened by the first stone wall.',
    phaseGate: 'P2 CONDITIONAL: hotel/spa only upon sector approval (Consejería de Medio Ambiente, PNSG overlay).',
    cteRef: 'NNSS El Boalo 1997/98 · sector ordinance required for hotel volume · CTE DB-SI water reserve',
  } },
  { latFrom: 0.15, latTo: 0.75, lngFrom: 0.32, lngTo: 0.68, type: 'residential', z: {
    id: 'Z2', name: 'Residence contours', areaM2: 16000, builtM2: 5392,
    program: '~27 branded residences (Echo / Duo / Grand) on S/SE contour lines at 25–40 m spacing, single storey on stilts, no fences, no excavation.',
    phaseGate: 'P1 ACTIVE: precedent-scale residential first (15–25 units near village edge) — funds the hold.',
    cteRef: 'NNSS B+1 / ~6.5–7 m unifamiliar heights · CTE all DBs · defensible-space strip per unit',
  } },
  { latFrom: 0.2, latTo: 0.7, lngFrom: 0.68, lngTo: 1, type: 'equestrian', z: {
    id: 'Z4', name: 'Equestrian & farm meadow', areaM2: 6000, builtM2: 300,
    program: 'Equestrian centre + kitchen garden on the flat east meadow; light timber structures only.',
    phaseGate: 'P3: activation after core phases.',
    cteRef: 'CTE timber structural DBs · wildfire defensibility',
  } },
];

// Colmenarejo — the villa lots ARE the cadastral parcels, so each fetched
// parcel is rendered in its program color directly (no banding needed).
const COLMENAREJO_URBAN = {
  id: 'Z1', name: 'Villa parcel (candidate lot)', areaM2: 4700, builtM2: 1160,
  program: 'U.E. 18 lot fronting the Cerca del Pino sewer axis — candidate for a BYLD Duo Lounge / Grand 2-storey modular villa (~290 m² over 2 floors, 900 m²+ garden). Sale portion is a subset of the unit — confirm against nota simple + segregation licence.',
  phaseGate: null,
  cteRef: 'NNSS 1996 Zona 03 grado 3º: ≥1,000 m² · frente ≥20 m · ocupación ≤25% · 0.25 m²/m² · 6.50 m cornisa · retranqueos 4/4/3',
};
const COLMENAREJO_RUSTIC = {
  id: 'Z3', name: 'Green edge (rústico)', areaM2: 3948, builtM2: 0,
  program: 'Edge parcel in suelo no urbanizable toward the Galapagar dehesa — borrowed landscape for the villas; the unit’s 3,948 m² zona-verde cession lands nearby «entre calles».',
  phaseGate: null,
  cteRef: 'SNU — no edificability · Ley 9/2001 cessions per ficha U.E. 18',
};

export function fetchParcelRings(rc) {
  return fetch(SOURCES.cadastreParcelWfs.replace('{rc}', rc))
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Catastro ${r.status}`))))
    .then((gml) => {
      const rings = parseGmlRings(gml);
      if (!rings.length) throw new Error('no geometry');
      return rings;
    });
}

// Single source of truth for the Boalo site geometry, shared by every layer
// that draws on the estate (masterplan zones, micro-parcels). Memoized so the
// WFS is hit once; resolves to the official parcel rings or, failing that,
// the hand-drawn footprint.
let boaloRingsPromise = null;
export function getBoaloRings() {
  if (!boaloRingsPromise) {
    const boalo = SITES['boalo-estate'];
    const rc = boalo?.cadastre?.refs?.[0]?.rc;
    boaloRingsPromise = (rc ? fetchParcelRings(rc) : Promise.reject(new Error('no rc')))
      .catch((e) => {
        console.warn('[boalo] Catastro unavailable, using footprint:', e.message);
        return boalo?.footprint ? [boalo.footprint] : [];
      });
  }
  return boaloRingsPromise;
}

function addBoaloZones(group, rings) {
  const b = bbox(rings);
  for (const spec of BOALO_BANDS) {
    const rect = band(b, spec.latFrom, spec.latTo, spec.lngFrom, spec.lngTo);
    const clipped = rings.map((ring) => clipRingToRect(ring, rect)).filter((r) => r.length);
    if (!clipped.length) continue;
    group.addLayer(L.polygon(clipped, ZONE_STYLES[spec.type])
      .bindPopup(zonePopup(spec.z), { maxWidth: 250 }));
  }
}

export default {
  id: 'overlay-masterplan',
  label: 'Masterplan zones',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();

    // --- Boalo: shared site geometry, banded into zones. ------------------
    getBoaloRings().then((rings) => { if (rings.length) addBoaloZones(group, rings); });

    // --- Colmenarejo: color each real parcel by its program role. --------
    const colme = SITES['colmenarejo-ue18'];
    let anyParcel = false;
    for (const ref of colme?.cadastre?.refs || []) {
      const rustic = /^\d{5}[A-Z]/.test(ref.rc); // rústico format: 5-digit municipality code + sector letter
      const meta = rustic ? COLMENAREJO_RUSTIC : COLMENAREJO_URBAN;
      fetchParcelRings(ref.rc)
        .then((rings) => {
          anyParcel = true;
          const z = { ...meta, areaM2: ref.areaM2 || meta.areaM2, name: `${meta.name} · ${ref.label}` };
          group.addLayer(L.polygon(rings, ZONE_STYLES[rustic ? 'green' : 'residential'])
            .bindPopup(zonePopup(z), { maxWidth: 250 }));
        })
        .catch((e) => console.warn(`[masterplan] ${ref.rc}:`, e.message));
    }
    // Fallback footprint if no parcel loads (offline): one residential blob.
    setTimeout(() => {
      if (!anyParcel && colme?.footprint) {
        group.addLayer(L.polygon(colme.footprint, ZONE_STYLES.residential)
          .bindPopup(zonePopup(COLMENAREJO_URBAN), { maxWidth: 250 }));
      }
    }, 8000);

    return group;
  },
};
