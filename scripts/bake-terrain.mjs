// Bake a dense heightmap for the Boalo site into public/terrain/boalo.json.
// Run in CI (workflow_dispatch "bake-terrain") or locally with open network.
//
// Samples a 20×20 grid (~15 m spacing) over the parcel bbox + margin from the
// opentopodata EU-DEM 25 m endpoint, split into ≤100-location requests, 1 s
// apart (public API limits). TODO: switch the sampler to IGN MDT02/05 LiDAR
// (WCS GetCoverage → GeoTIFF) for true 2–5 m terrain; the app-side format
// stays the same, only this script changes.

import { writeFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const N = 20;
const MARGIN = 0.0004; // ~45 m beyond the parcel bbox so interpolation covers edges

const sites = JSON.parse(await readFile(new URL('../data/sites.json', import.meta.url), 'utf8'));
const boalo = sites.sites.find((s) => s.id === 'boalo-estate');
const rc = boalo?.cadastre?.refs?.[0]?.rc;

async function parcelBbox() {
  const url = `https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature&STOREDQUERIE_ID=GetParcel&srsname=EPSG::4326&refcat=${rc}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catastro ${res.status}`);
  const gml = await res.text();
  const nums = [...gml.matchAll(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)]
    .flatMap((m) => m[1].trim().split(/\s+/).map(Number))
    .filter((n) => !Number.isNaN(n));
  if (nums.length < 6) throw new Error('no geometry');
  const lats = [], lngs = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const [a, b] = [nums[i], nums[i + 1]];
    const latFirst = Math.abs(a) <= 90 && Math.abs(b) > 90 ? true : Math.abs(a) > Math.abs(b);
    lats.push(latFirst ? a : b);
    lngs.push(latFirst ? b : a);
  }
  return {
    latMin: Math.min(...lats) - MARGIN, latMax: Math.max(...lats) + MARGIN,
    lngMin: Math.min(...lngs) - MARGIN, lngMax: Math.max(...lngs) + MARGIN,
  };
}

function fallbackBbox() {
  const fp = boalo.footprint;
  const lats = fp.map((p) => p[0]), lngs = fp.map((p) => p[1]);
  return {
    latMin: Math.min(...lats) - MARGIN, latMax: Math.max(...lats) + MARGIN,
    lngMin: Math.min(...lngs) - MARGIN, lngMax: Math.max(...lngs) + MARGIN,
  };
}

const bbox = await parcelBbox().catch((e) => {
  console.warn('Catastro unavailable, using footprint bbox:', e.message);
  return fallbackBbox();
});

const pts = [];
for (let i = 0; i < N; i++) {
  for (let j = 0; j < N; j++) {
    const lat = bbox.latMin + ((bbox.latMax - bbox.latMin) * i) / (N - 1);
    const lng = bbox.lngMin + ((bbox.lngMax - bbox.lngMin) * j) / (N - 1);
    pts.push(`${lat.toFixed(6)},${lng.toFixed(6)}`);
  }
}

const grid = [];
for (let off = 0; off < pts.length; off += 100) {
  const batch = pts.slice(off, off + 100);
  const url = `https://api.opentopodata.org/v1/eudem25m?locations=${batch.join('|')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`elevation API ${res.status} at batch ${off / 100}`);
  const data = await res.json();
  for (const r of data.results) {
    if (r.elevation == null) throw new Error(`null elevation at ${JSON.stringify(r.location)}`);
    grid.push(r.elevation);
  }
  if (off + 100 < pts.length) await new Promise((r) => setTimeout(r, 1100));
}

const out = {
  bbox, n: N, grid,
  source: `EU-DEM 25 m, ${N}×${N} baked grid`,
  bakedAt: new Date().toISOString(),
  rc: rc ?? null,
};
await mkdir(new URL('../public/terrain/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/terrain/boalo.json', import.meta.url), JSON.stringify(out));
console.log(`Baked ${grid.length} samples for bbox`, bbox);
