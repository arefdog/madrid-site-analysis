// Site features (existing trees & rock outcrops), stored as FRACTIONAL
// positions within the parcel bbox and resolved to lat/lng at runtime against
// the real Catastro geometry — so they always land on the true parcel, never a
// hardcoded footprint. Both the micro-parcel engine (avoid/anchor) and the
// view layer consume resolveFeatures(bbox).
import data from '../../data/boalo-features.json';

export const rawFeatures = data.features ?? [];

// bbox of [[lat,lng],…] rings.
export function bboxOfRings(rings) {
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

// Resolve fractional features to [lat,lng] rings against a parcel bbox.
// frac [fx,fy]: fx 0→1 west→east, fy 0→1 north→south.
export function resolveFeatures(bbox) {
  const { latMin, latMax, lngMin, lngMax } = bbox;
  return rawFeatures.map((f) => ({
    kind: f.kind ?? 'tree',
    role: f.role ?? 'avoid',
    name: f.name ?? '',
    note: f.note ?? '',
    source: f.source ?? '',
    ring: (f.frac ?? []).map(([fx, fy]) => [latMax - fy * (latMax - latMin), lngMin + fx * (lngMax - lngMin)]),
  })).filter((f) => f.ring.length >= 3);
}
