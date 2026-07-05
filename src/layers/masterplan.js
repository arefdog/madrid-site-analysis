import L from 'leaflet';
import { SOURCES } from '../config.js';

// Masterplan visualization: zones (roads, residential, hotel, green), topographic context,
// phasing gates, and CTE compliance overlays for each identified site.
// Click zones to view area, program, building code constraints, and gate status.

const ZONE_COLORS = {
  roads: '#4a5568',          // Charcoal gray
  residential: '#f97316',    // Orange
  hotel: '#1e40af',          // Deep blue
  vpp: '#ec4899',            // Pink (affordable housing)
  equestrian: '#d4af37',     // Gold
  green: '#86efac',          // Pale green / dehesa
};

const ZONE_STYLES = {
  roads: { color: '#2d3748', weight: 3, fillColor: ZONE_COLORS.roads, fillOpacity: 0.6 },
  residential: { color: '#ea580c', weight: 2, fillColor: ZONE_COLORS.residential, fillOpacity: 0.5 },
  hotel: { color: '#1e40af', weight: 2, fillColor: ZONE_COLORS.hotel, fillOpacity: 0.45 },
  vpp: { color: '#be185d', weight: 2, fillColor: ZONE_COLORS.vpp, fillOpacity: 0.4 },
  equestrian: { color: '#b8860b', weight: 2, fillColor: ZONE_COLORS.equestrian, fillOpacity: 0.35 },
  green: { color: '#65a30d', weight: 1.5, fillColor: ZONE_COLORS.green, fillOpacity: 0.25, dashArray: '4 2' },
};

// Zone geometry for Colmenarejo (U.E. 18, 40.5587°N, 4.0076°W)
// Footprint: 40.5586–40.5561°N, -4.0075–-4.0028°W
function colmenarejo() {
  const baseN = 40.5587;
  const baseW = -4.0076;
  const dN = 0.003;  // ~300 m
  const dW = 0.0035; // ~300 m

  // Z1: Villa parcels (central, along sewer axis)
  const z1 = [
    [baseN - 0.0005, baseW],
    [baseN - 0.0005, baseW + dW * 0.7],
    [baseN - dN * 0.6, baseW + dW * 0.7],
    [baseN - dN * 0.6, baseW],
  ];

  // Z2: Shared entry & services (NW corner, road junction)
  const z2 = [
    [baseN, baseW],
    [baseN, baseW + dW * 0.25],
    [baseN - dN * 0.15, baseW + dW * 0.25],
    [baseN - dN * 0.15, baseW],
  ];

  // Z3: Green edge (northern buffer toward Galapagar)
  const z3 = [
    [baseN - dN * 0.6, baseW],
    [baseN - dN * 0.6, baseW + dW],
    [baseN - dN, baseW + dW],
    [baseN - dN, baseW],
  ];

  return { z1, z2, z3 };
}

// Zone geometry for Boalo (70,484 m², 40.7167°N, 3.9°W)
// Footprint: 40.7178–40.7156°N, -3.9018–-3.8982°W
// Elevations: 906 m (entry) to 1008 m (plateau)
function boalo() {
  const baseN = 40.7167;
  const baseW = -3.9;
  const dN = 0.005;  // ~500 m N-S
  const dW = 0.004;  // ~350 m E-W

  // Z1: Arrival & core (hotel/spa, western edge near access, compact)
  const z1 = [
    [baseN + dN * 0.2, baseW - dW * 0.4],
    [baseN + dN * 0.2, baseW - dW * 0.15],
    [baseN - dN * 0.1, baseW - dW * 0.15],
    [baseN - dN * 0.1, baseW - dW * 0.4],
  ];

  // Z2: Residence contours (mid-slope, S/SE facing, scattered)
  const z2 = [
    [baseN + dN * 0.15, baseW - dW * 0.2],
    [baseN + dN * 0.15, baseW + dW * 0.2],
    [baseN - dN * 0.05, baseW + dW * 0.2],
    [baseN - dN * 0.05, baseW - dW * 0.2],
  ];

  // Z3: VPP village edge (corner nearest village, NW)
  const z3 = [
    [baseN + dN * 0.25, baseW - dW * 0.35],
    [baseN + dN * 0.25, baseW - dW * 0.2],
    [baseN + dN * 0.1, baseW - dW * 0.2],
    [baseN + dN * 0.1, baseW - dW * 0.35],
  ];

  // Z4: Equestrian & farm meadow (east, flat)
  const z4 = [
    [baseN + dN * 0.1, baseW + dW * 0.15],
    [baseN + dN * 0.1, baseW + dW * 0.35],
    [baseN - dN * 0.15, baseW + dW * 0.35],
    [baseN - dN * 0.15, baseW + dW * 0.15],
  ];

  // Z5: Dehesa commons (majority, surrounding all zones)
  const z5 = [
    [baseN + dN * 0.35, baseW - dW * 0.45],
    [baseN + dN * 0.35, baseW + dW * 0.4],
    [baseN - dN * 0.3, baseW + dW * 0.4],
    [baseN - dN * 0.3, baseW - dW * 0.45],
  ];

  return { z1, z2, z3, z4, z5 };
}

function zonePopup(zone, site) {
  const phaseBadge = zone.phaseGate
    ? `<div style="background:#fca5a5;color:#7f1d1d;padding:4px 8px;border-radius:4px;font-size:11px;margin:8px 0"><b>${zone.phaseGate}</b></div>`
    : '';

  const cteLink = `<div style="margin-top:6px;font-size:11px;color:#666">
    <code style="font-size:10px;color:#888">${zone.cteRef}</code>
  </div>`;

  return `
    <div style="font-size:12px;max-width:220px">
      <b>${zone.name}</b> (${zone.id})
      <div style="color:#555;font-size:11px;margin:4px 0">
        ${zone.areaM2.toLocaleString('en')} m² · ${zone.builtM2 ? `${zone.builtM2.toLocaleString('en')} m² built` : 'Open space'}
      </div>
      <div style="margin:6px 0;line-height:1.4;font-size:11px">
        ${zone.program}
      </div>
      ${phaseBadge}
      ${cteLink}
    </div>`;
}

function createZoneLayer(name, zones, siteId) {
  const group = L.layerGroup();

  for (const [zoneKey, zoneGeom] of Object.entries(zones)) {
    const zone = zoneGeom._data; // Extract zone metadata
    const poly = L.polygon(zoneGeom._coords, ZONE_STYLES[zoneGeom._type] || ZONE_STYLES.green);

    poly.bindPopup(zonePopup(zone, siteId), { maxWidth: 240 });
    group.addLayer(poly);
  }

  return group;
}

function colmenarejo_zones() {
  const { z1, z2, z3 } = colmenarejo();

  return {
    z1_villas: {
      _coords: z1,
      _type: 'residential',
      _data: {
        id: 'Z1',
        name: 'Villa parcels',
        areaM2: 4700,
        builtM2: 1160,
        program: '4 parcels of 1,150–1,250 m² each fronting the Cerca del Pino sewer axis. Duo Lounge or Grand modular villas, ~290 m² per unit, 2 floors + bajo cubierta (6.5 m eaves max).',
        phaseGate: null,
        cteRef: 'CTE DB-SE, DB-HE, DB-SI; NNSS Colmenarejo 1996 ocupación 25%, edificabilidad 0.25 m²/m²',
      },
    },
    z2_entry: {
      _coords: z2,
      _type: 'roads',
      _data: {
        id: 'Z2',
        name: 'Shared entry & services',
        areaM2: 550,
        builtM2: 0,
        program: 'Common drive from Calle del Pisuerga (6 m width, CTE § 3.2.2 taper 25 m). Utilities corridor; bin/parking pocket at entry.',
        phaseGate: null,
        cteRef: 'CTE § 3.2.2 (road access), § 4.3 (accessibility ≤8% grade)',
      },
    },
    z3_green: {
      _coords: z3,
      _type: 'green',
      _data: {
        id: 'Z3',
        name: 'Green edge (cession)',
        areaM2: 3948,
        builtM2: 0,
        program: 'Zona-verde cession to municipality (outside sale). Native oak/pine buffer toward Galapagar. Stormwater detention: 200 m² basin, 0.3 m depth.',
        phaseGate: null,
        cteRef: 'CTE § 3.3.4 (stormwater capture), Ley 9/2001 § 9 (cessions)',
      },
    },
  };
}

function boalo_zones() {
  const { z1, z2, z3, z4, z5 } = boalo();

  return {
    z1_core: {
      _coords: z1,
      _type: 'hotel',
      _data: {
        id: 'Z1',
        name: 'Arrival & core',
        areaM2: 14000,
        builtM2: 12158,
        program: '44-key landscape hotel (5,286 m²) + spa & restaurant (5,110 m²) + subterranean parking (1,762 m²). Screened by stone walls; defensible high ground at plateau (965–980 m).',
        phaseGate: 'P2 CONDITIONAL: Sector approval by Consejería Medio Ambiente (PNSG overlay). Status: pending. Gate: written Resolución required.',
        cteRef: 'NNSS El Boalo 1997/98, PNSG PRUG/ZPP overlays, CTE DB-SI (wildfire), CTE § 3.1 (water reserve)',
      },
    },
    z2_residential: {
      _coords: z2,
      _type: 'residential',
      _data: {
        id: 'Z2',
        name: 'Residence contours',
        areaM2: 16000,
        builtM2: 5392,
        program: '~27 branded residences (Echo, Duo, Grand) on S/SE contours at 920–950 m, 25–40 m spacing. Modular prefab on stilts, no excavation. Defensible positioning.',
        phaseGate: 'P1 ACTIVE: Municipal confirmation of residential classification + utility easements. Est. 6–9 months. Gate: confirmed in writing by Ayuntamiento.',
        cteRef: 'NNSS height max 9 m (2–2.5 stories), CTE DB-HR (fire), wildland-urban interface § 2.1 (50 m clearance)',
      },
    },
    z3_vpp: {
      _coords: z3,
      _type: 'vpp',
      _data: {
        id: 'Z3',
        name: 'VPP village edge',
        areaM2: 4500,
        builtM2: 3524,
        program: 'Regulated housing (3,524 m²) as compact 2–3 storey piece on village edge. Connected to town, VPP reserve = 39.5% of residential component (compliant Ley 9/2001).',
        phaseGate: 'P3 GATED: Conditional on VPP instrument finalization; delivery per sector conditions.',
        cteRef: 'Ley 9/2001 § 4 (VPP ≥30% residential edificability), CM height 6.5–7 m rural estate standard',
      },
    },
    z4_equestrian: {
      _coords: z4,
      _type: 'equestrian',
      _data: {
        id: 'Z4',
        name: 'Equestrian & farm meadow',
        areaM2: 6000,
        builtM2: 300,
        program: 'Equestrian centre + kitchen garden on flat east meadow (elev. 920–940 m). Light timber structures only; low footprint.',
        phaseGate: 'P3: Conditional on Phase 2 core approval.',
        cteRef: 'CTE structural codes for timber pavilions; wildfire defensibility zoning',
      },
    },
    z5_dehesa: {
      _coords: z5,
      _type: 'green',
      _data: {
        id: 'Z5',
        name: 'Dehesa commons',
        areaM2: 52863,
        builtM2: 0,
        program: '75% of parcel held open: trail loop on stone-wall spines, ponds (water reserve for hydrants), dark-sky zones. Managed grazing; no lighting beyond bollards. Protected landscape.',
        phaseGate: 'P0 FOUNDATIONAL: Verify PNSG protected-land status + obtain favorable Consejería opinion. Est. 12–18 months. Gate: written classification as "compatible secondary use".',
        cteRef: 'PRCAM PORN (Parque Regional zoning), P.N. Guadarrama PRUG/ZPP buffers, CTE wildland-urban interface § 2.1',
      },
    },
  };
}

function createSiteLayer(siteId, zones) {
  const group = L.layerGroup();

  for (const [zoneKey, zone] of Object.entries(zones)) {
    const style = ZONE_STYLES[zone._type] || ZONE_STYLES.green;
    const poly = L.polygon(zone._coords, style);
    poly.bindPopup(zonePopup(zone._data, siteId), { maxWidth: 240 });
    group.addLayer(poly);
  }

  return group;
}

export default {
  id: 'overlay-masterplan',
  label: 'Masterplan zones',
  group: 'overlay',
  enabled: false,
  create() {
    const masterplanGroup = L.layerGroup();

    // Colmenarejo zones
    const colmenarejo_z = colmenarejo_zones();
    const colmenarejo_layer = createSiteLayer('colmenarejo-ue18', colmenarejo_z);
    masterplanGroup.addLayer(colmenarejo_layer);

    // Boalo zones
    const boalo_z = boalo_zones();
    const boalo_layer = createSiteLayer('boalo-estate', boalo_z);
    masterplanGroup.addLayer(boalo_layer);

    return masterplanGroup;
  },
};
