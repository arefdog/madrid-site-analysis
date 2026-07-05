import L from 'leaflet';
import sitesData from '../../data/sites.json';

// Micro-parcel generation v2: intelligent scattering respecting topography, roads, and zones.
// 1000 parcels (70.5 m² each) distributed by zone with elevation-based clustering,
// road network for commons, and parking clusters near access.

const SITES = Object.fromEntries(sitesData.sites.map((s) => [s.id, s]));
const BOALO = SITES['boalo-estate'];

const ZONE_ALLOCATIONS = {
  Z1: { count: 198, color: '#1e40af', name: 'Hotel core', opacity: 0.45, type: 'development' },
  Z2: { count: 227, color: '#ea580c', name: 'Residences', opacity: 0.45, type: 'development' },
  Z3: { count: 64, color: '#be185d', name: 'VPP village', opacity: 0.45, type: 'development' },
  Z4: { count: 85, color: '#b8860b', name: 'Equestrian', opacity: 0.45, type: 'development' },
  Z5: { count: 425, color: '#65a30d', name: 'Commons', opacity: 0.35, type: 'commons' },
};

const ZONE_BANDS = {
  Z1: { latFrom: 0.2, latTo: 0.65, lngFrom: 0, lngTo: 0.32 },
  Z2: { latFrom: 0.15, latTo: 0.75, lngFrom: 0.32, lngTo: 0.68 },
  Z3: { latFrom: 0.65, latTo: 1, lngFrom: 0, lngTo: 0.3 },
  Z4: { latFrom: 0.2, latTo: 0.7, lngFrom: 0.68, lngTo: 1 },
  Z5: { latFrom: 0, latTo: 1, lngFrom: 0, lngTo: 1 },
};

// Elevation cache to avoid re-querying same points.
const elevationCache = new Map();

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

function bandRect(b, latFrom, latTo, lngFrom, lngTo) {
  const dLat = b.latMax - b.latMin;
  const dLng = b.lngMax - b.lngMin;
  return {
    latMin: b.latMin + dLat * latFrom,
    latMax: b.latMin + dLat * latTo,
    lngMin: b.lngMin + dLng * lngFrom,
    lngMax: b.lngMin + dLng * lngTo,
  };
}

async function queryElevation(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (elevationCache.has(key)) return elevationCache.get(key);

  try {
    const url = `https://api.opentopodata.org/v1/eudem25m?locations=${lat.toFixed(5)},${lng.toFixed(5)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`elevation API ${res.status}`);
    const data = await res.json();
    const v = data?.results?.[0]?.elevation;
    elevationCache.set(key, v ?? null);
    return v ?? null;
  } catch (e) {
    console.warn('Elevation query failed:', e.message);
    elevationCache.set(key, null);
    return null;
  }
}

// Calculate slope between two points (in degrees). Returns null if any point elevation unavailable.
async function calculateSlope(lat1, lng1, lat2, lng2) {
  const elev1 = await queryElevation(lat1, lng1);
  const elev2 = await queryElevation(lat2, lng2);
  if (elev1 === null || elev2 === null) return null;

  // Haversine distance in meters.
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distance = R * 2 * Math.asin(Math.sqrt(a));

  if (distance < 10) return 0;
  const elevDiff = Math.abs(elev2 - elev1);
  return Math.atan(elevDiff / distance) * 180 / Math.PI;
}

function pointInRings(lat, lng, rings) {
  for (const ring of rings) {
    if (pointInPolygon(lat, lng, ring)) return true;
  }
  return false;
}

function pointInPolygon(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[j];
    const intersect = ((lat1 > lng) !== (lat2 > lng)) && (lat < ((lng2 - lng1) * (lng - lat1)) / (lat2 - lat1) + lng1);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Generate parcels with smart topography clustering.
async function generateParcelsForZone(zoneId, rect, count, rings) {
  const parcels = [];
  let attempts = 0;
  const maxAttempts = count * 8;

  while (parcels.length < count && attempts < maxAttempts) {
    attempts++;

    let lat, lng;

    // For Z2 (residences), bias toward E/SE side for better views of Guadarrama.
    if (zoneId === 'Z2') {
      const lngBias = rect.lngMin + (rect.lngMax - rect.lngMin) * (0.5 + Math.random() * 0.5);
      lat = rect.latMin + Math.random() * (rect.latMax - rect.latMin);
      lng = lngBias;
    } else {
      lat = rect.latMin + Math.random() * (rect.latMax - rect.latMin);
      lng = rect.lngMin + Math.random() * (rect.lngMax - rect.lngMin);
    }

    if (!pointInRings(lat, lng, rings)) continue;

    const elev = await queryElevation(lat, lng);
    if (elev === null) continue;

    // For development zones, query nearby points to check slope.
    if (ZONE_ALLOCATIONS[zoneId].type === 'development') {
      const sampleDist = 0.0005;
      const slopes = await Promise.all([
        calculateSlope(lat, lng, lat + sampleDist, lng),
        calculateSlope(lat, lng, lat - sampleDist, lng),
        calculateSlope(lat, lng, lat, lng + sampleDist),
        calculateSlope(lat, lng, lat, lng - sampleDist),
      ]);

      const validSlopes = slopes.filter(s => s !== null);
      if (validSlopes.length === 0) continue;
      const avgSlope = validSlopes.reduce((a, b) => a + b, 0) / validSlopes.length;

      // Max slope thresholds: 15° for VPP (tighter), 25° for others.
      const maxSlope = zoneId === 'Z3' ? 15 : 25;
      if (avgSlope > maxSlope) continue;
    }

    parcels.push({ zoneId, lat, lng, color: ZONE_ALLOCATIONS[zoneId].color, elev });
  }

  return parcels;
}

// Generate smart road/path network for Z5 (commons).
function generateRoadNetwork(rect, rings, count) {
  const roads = [];

  // Main vertical spine: trail loop through middle.
  const spineLng = rect.lngMin + (rect.lngMax - rect.lngMin) * 0.5;
  const spineSegments = Math.floor(count * 0.3);
  const segmentHeight = (rect.latMax - rect.latMin) / spineSegments;

  for (let i = 0; i < spineSegments; i++) {
    const lat = rect.latMin + (i + 0.5) * segmentHeight;
    if (pointInRings(lat, spineLng, rings)) {
      roads.push({ zoneId: 'Z5', lat, lng: spineLng, color: '#65a30d', type: 'spine', radius: 3.5, weight: 1 });
    }
  }

  // Cross-paths every 3-4 spine segments.
  const crossSpacing = Math.floor(spineSegments / 3);
  const crossPaths = Math.floor(count * 0.2);

  for (let i = 0; i < spineSegments; i += crossSpacing) {
    const latAtCross = rect.latMin + (i + 0.5) * segmentHeight;
    const pathCount = Math.floor(crossPaths / (spineSegments / crossSpacing));
    const lngSpan = rect.lngMax - rect.lngMin;

    for (let j = 0; j < pathCount; j++) {
      const lng = rect.lngMin + (j / pathCount) * lngSpan;
      if (pointInRings(latAtCross, lng, rings)) {
        roads.push({ zoneId: 'Z5', lat: latAtCross, lng, color: '#65a30d', type: 'cross', radius: 2.5, weight: 0.5, opacity: 0.25 });
      }
    }
  }

  // Remaining: green space (meadows, dehesa).
  const scatterCount = count - roads.length;
  let scatterAttempts = 0;
  const maxScatterAttempts = scatterCount * 3;

  while (roads.length < count && scatterAttempts < maxScatterAttempts) {
    scatterAttempts++;
    const lat = rect.latMin + Math.random() * (rect.latMax - rect.latMin);
    const lng = rect.lngMin + Math.random() * (rect.lngMax - rect.lngMin);

    if (pointInRings(lat, lng, rings)) {
      roads.push({ zoneId: 'Z5', lat, lng, color: '#86efac', type: 'green', radius: 2, weight: 0, opacity: 0.2 });
    }
  }

  return roads.slice(0, count);
}

// Buildability scoring (0–100) based on slope, access proximity, and zone.
// Higher score = more developable; lower = constraints.
function calculateBuildabilityScore(parcel, roadNetwork, zoneId) {
  const alloc = ZONE_ALLOCATIONS[zoneId];
  if (alloc.type === 'commons') return null; // Commons not for building

  let score = 80; // Baseline

  // Slope penalty: steeper = harder/costlier.
  // This is approximate; in production, use actual slope calc.
  if (parcel.elev) {
    // Assume 920m baseline (Boalo elevation).
    const elevDeviation = Math.abs(parcel.elev - 920);
    if (elevDeviation > 30) score -= 15; // High elevation variation
  }

  // Access proximity: distance to nearest road (spine or cross-path).
  // Calculate great-circle distance to closest road parcel.
  let minDistToRoad = Infinity;
  for (const road of roadNetwork) {
    if (road.type === 'spine' || road.type === 'cross') {
      const dLat = (parcel.lat - road.lat) * 111000; // meters/degree lat
      const dLng = (parcel.lng - road.lng) * 111000 * Math.cos(parcel.lat * Math.PI / 180);
      const dist = Math.sqrt(dLat ** 2 + dLng ** 2);
      minDistToRoad = Math.min(minDistToRoad, dist);
    }
  }

  // Access scoring: within 100m = ideal, 200m = acceptable, >300m = constrained.
  if (minDistToRoad > 300) score -= 25;
  else if (minDistToRoad > 150) score -= 10;
  else if (minDistToRoad > 100) score -= 5;

  // Zone-specific adjustments.
  if (zoneId === 'Z1') {
    score += 10; // Hotel core: premium access, infrastructure ready
  } else if (zoneId === 'Z3') {
    score -= 5; // VPP: regulatory constraints (compact, connected to town)
  } else if (zoneId === 'Z4') {
    score -= 10; // Equestrian: infrastructure (stables) only where flat
  }

  // Z2 bonus for S/SE exposure (views, solar gain).
  if (zoneId === 'Z2' && parcel.lng > (ZONE_BANDS.Z2.lngMin + ZONE_BANDS.Z2.lngMax) / 2) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

// Parking cluster generation: identify flatter parcels near Z1 access for underground garage.
function generateParkingCluster(z1Parcels, z5Spine, b, rings) {
  if (z1Parcels.length === 0) return [];

  // Find SW corner of Z1 (access point).
  let accessPoint = z1Parcels[0];
  for (const p of z1Parcels) {
    if (p.lng < accessPoint.lng || (p.lng === accessPoint.lng && p.lat < accessPoint.lat)) {
      accessPoint = p;
    }
  }

  // Nearest Z5 spine point to access.
  let nearestSpine = z5Spine[0];
  let minDistToSpine = Infinity;
  for (const s of z5Spine) {
    const dLat = (s.lat - accessPoint.lat) * 111000;
    const dLng = (s.lng - accessPoint.lng) * 111000 * Math.cos(accessPoint.lat * Math.PI / 180);
    const dist = Math.sqrt(dLat ** 2 + dLng ** 2);
    if (dist < minDistToSpine) {
      minDistToSpine = dist;
      nearestSpine = s;
    }
  }

  // Generate parking cluster: ~1,762 m² needs ~25 parcels of 70.5 m² each.
  const parkingCount = 25;
  const parkingParcels = [];
  const clusterRadius = 0.0003; // ~33 meters

  for (let i = 0; i < parkingCount; i++) {
    const angle = (i / parkingCount) * Math.PI * 2;
    const r = clusterRadius * (0.5 + Math.random() * 0.5); // Randomize within radius
    const lat = nearestSpine.lat + r * Math.cos(angle);
    const lng = nearestSpine.lng + r * Math.sin(angle);

    if (pointInRings(lat, lng, rings)) {
      parkingParcels.push({
        type: 'parking',
        lat,
        lng,
        color: '#8b7355',
        radius: 3,
        opacity: 0.5,
        label: 'Parking (subterranean)',
      });
    }
  }

  return parkingParcels;
}

export default {
  id: 'overlay-microparcels',
  label: 'Micro-parcels (1000-unit master grid)',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    const boalo = BOALO;

    if (!boalo?.footprint) return group;

    const rings = [boalo.footprint];
    const b = bbox(rings);

    // Generate all zones asynchronously.
    (async () => {
      const allDevParcels = { Z1: [], Z2: [], Z3: [], Z4: [] };

      // Development zones: elevation-aware, slope-filtered.
      for (const [zoneId, alloc] of Object.entries(ZONE_ALLOCATIONS)) {
        if (alloc.type === 'development') {
          const band = ZONE_BANDS[zoneId];
          const rect = bandRect(b, band.latFrom, band.latTo, band.lngFrom, band.lngTo);
          const parcels = await generateParcelsForZone(zoneId, rect, alloc.count, rings);
          allDevParcels[zoneId] = parcels;
        }
      }

      // Commons zone: smart road network + green space.
      const z5Band = ZONE_BANDS.Z5;
      const z5Rect = bandRect(b, z5Band.latFrom, z5Band.latTo, z5Band.lngFrom, z5Band.lngTo);
      const roadParcels = generateRoadNetwork(z5Rect, rings, ZONE_ALLOCATIONS.Z5.count);
      const z5Spine = roadParcels.filter((p) => p.type === 'spine');

      // Calculate buildability scores for all development parcels.
      for (const [zoneId, parcels] of Object.entries(allDevParcels)) {
        for (const p of parcels) {
          p.buildScore = calculateBuildabilityScore(p, roadParcels, zoneId);
          // Color intensity reflects buildability: 0–50 = dim, 50–100 = bright.
          p.buildOpacity = Math.max(0.2, ZONE_ALLOCATIONS[zoneId].opacity * (0.4 + (p.buildScore / 100) * 0.6));
        }
      }

      // Render development parcels with buildability coloring.
      for (const [zoneId, parcels] of Object.entries(allDevParcels)) {
        const alloc = ZONE_ALLOCATIONS[zoneId];
        for (const p of parcels) {
          const circle = L.circleMarker([p.lat, p.lng], {
            radius: 3,
            color: p.color,
            weight: 0.5,
            fillColor: p.color,
            fillOpacity: p.buildOpacity,
          })
            .bindPopup(
              `<b>${alloc.name}</b><br>${zoneId}<br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br>` +
              `Elev: ${p.elev ? p.elev.toFixed(0) + ' m' : '?'}<br>` +
              `<b>Buildability: ${p.buildScore.toFixed(0)}/100</b>` +
              (p.buildScore > 70 ? '<br>✓ Optimal' : p.buildScore > 50 ? '<br>◐ Acceptable' : '<br>✗ Constrained')
            );
          group.addLayer(circle);
        }
      }

      // Render commons: roads + green space.
      for (const p of roadParcels) {
        const fillOpacity = p.opacity ?? ZONE_ALLOCATIONS.Z5.opacity;
        const circle = L.circleMarker([p.lat, p.lng], {
          radius: p.radius ?? 3,
          color: p.color,
          weight: p.weight ?? 0.5,
          fillColor: p.color,
          fillOpacity,
        })
          .bindPopup(`<b>Commons: ${p.type}</b><br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
        group.addLayer(circle);
      }

      // Parking cluster (subterranean garage near Z1 access).
      const parkingParcels = generateParkingCluster(allDevParcels.Z1, z5Spine, b, rings);
      for (const p of parkingParcels) {
        const circle = L.circleMarker([p.lat, p.lng], {
          radius: p.radius,
          color: p.color,
          weight: 1,
          fillColor: p.color,
          fillOpacity: p.opacity,
          dashArray: '2,2', // Dashed to indicate underground
        })
          .bindPopup(`<b>${p.label}</b><br>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}<br>Est. 1,762 m² underground`);
        group.addLayer(circle);
      }
    })();

    return group;
  },
};
