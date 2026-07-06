// Bake a dense heightmap for the Boalo site into public/terrain/boalo.json.
// Run in CI (workflow "bake-terrain") or locally with open network.
//
// Primary source: IGN PNOA-LiDAR MDT05 (5 m) via the INSPIRE WCS — real
// grading-grade terrain for contour/cut-fill work. If that fails at any step
// the script falls back to the opentopodata EU-DEM 25 m endpoint so CI always
// produces a valid heightmap. The app-side format is fixed regardless:
//   { bbox:{latMin,latMax,lngMin,lngMax}, n, grid[n*n] (row 0 = south), source }
//
// TODO (where covered): switch COVERAGEID to a 2 m MDT02 coverage for the
// Sierra sheets — same code, only the coverage id changes.

import { writeFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

const N = 40; // 40×40 over the parcel (~7 m spacing) — LiDAR earns the density
const MARGIN = 0.0005; // ~55 m beyond the bbox so edge interpolation is covered

const sites = JSON.parse(await readFile(new URL('../data/sites.json', import.meta.url), 'utf8'));
const boalo = sites.sites.find((s) => s.id === 'boalo-estate');
const rc = boalo?.cadastre?.refs?.[0]?.rc;

// --- Parcel bbox (official geometry, footprint fallback). --------------------

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

// --- Sampler A: IGN PNOA-LiDAR MDT05 via INSPIRE WCS (GeoTIFF). --------------

async function sampleIgnLidar(bbox) {
  const { fromArrayBuffer } = await import('geotiff'); // devDependency; CI installs it
  // WCS 2.0.1 GetCoverage, 5 m national coverage in ETRS89 geographic (EPSG:4258
  // ≈ WGS84, cm-level), subset by Lat/Long so no reprojection is needed.
  const url = 'https://servicios.idee.es/wcs-inspire/mdt?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage'
    + '&COVERAGEID=Elevacion4258_5&FORMAT=image/tiff'
    + `&SUBSET=Lat(${bbox.latMin.toFixed(6)},${bbox.latMax.toFixed(6)})`
    + `&SUBSET=Long(${bbox.lngMin.toFixed(6)},${bbox.lngMax.toFixed(6)})`;
  const res = await fetch(url, { headers: { Accept: 'image/tiff' } });
  if (!res.ok) throw new Error(`IGN WCS ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  if (!/tiff/i.test(ct)) throw new Error(`IGN WCS returned ${ct} (likely an exception report)`);
  const buf = await res.arrayBuffer();

  const tiff = await fromArrayBuffer(buf);
  const image = await tiff.getImage();
  const w = image.getWidth(), h = image.getHeight();
  const [minX, minY, maxX, maxY] = image.getBoundingBox(); // lng/lat degrees
  const raster = (await image.readRasters())[0]; // row 0 = north (top-left)
  const nodata = Number(image.getGDALNoData?.() ?? -9999);

  // Bilinear sample the raster at an arbitrary lng/lat.
  const at = (lat, lng) => {
    const fx = ((lng - minX) / (maxX - minX)) * (w - 1);
    const fy = ((maxY - lat) / (maxY - minY)) * (h - 1); // invert: raster top = north
    const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(h - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
    const g = (x, y) => raster[y * w + x];
    const v00 = g(x0, y0), v01 = g(x0 + 1, y0), v10 = g(x0, y0 + 1), v11 = g(x0 + 1, y0 + 1);
    if ([v00, v01, v10, v11].some((v) => v == null || v <= nodata + 1 || v < -1000)) return null;
    return v00 * (1 - tx) * (1 - ty) + v01 * tx * (1 - ty) + v10 * (1 - tx) * ty + v11 * tx * ty;
  };

  const grid = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const lat = bbox.latMin + ((bbox.latMax - bbox.latMin) * i) / (N - 1);
      const lng = bbox.lngMin + ((bbox.lngMax - bbox.lngMin) * j) / (N - 1);
      const v = at(lat, lng);
      if (v == null) throw new Error(`IGN nodata at grid ${i},${j}`);
      grid.push(v);
    }
  }
  return { grid, source: `IGN PNOA-LiDAR MDT05 (5 m), ${N}×${N} resample` };
}

// --- Sampler B: opentopodata EU-DEM 25 m (fallback). ------------------------

async function sampleEuDem(bbox) {
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
    if (!res.ok) throw new Error(`EU-DEM ${res.status} at batch ${off / 100}`);
    const data = await res.json();
    for (const r of data.results) {
      if (r.elevation == null) throw new Error(`null elevation at ${JSON.stringify(r.location)}`);
      grid.push(r.elevation);
    }
    if (off + 100 < pts.length) await new Promise((r) => setTimeout(r, 1100));
  }
  return { grid, source: `EU-DEM 25 m, ${N}×${N} baked grid` };
}

// --- Run. -------------------------------------------------------------------

const bbox = await parcelBbox().catch((e) => {
  console.warn('Catastro unavailable, using footprint bbox:', e.message);
  return fallbackBbox();
});

let sampled;
try {
  sampled = await sampleIgnLidar(bbox);
  console.log('Terrain source: IGN PNOA-LiDAR MDT05');
} catch (e) {
  console.warn('IGN LiDAR unavailable, falling back to EU-DEM:', e.message);
  sampled = await sampleEuDem(bbox);
}

const out = {
  bbox, n: N, grid: sampled.grid,
  source: sampled.source,
  bakedAt: new Date().toISOString(),
  rc: rc ?? null,
};
await mkdir(new URL('../public/terrain/', import.meta.url), { recursive: true });
await writeFile(new URL('../public/terrain/boalo.json', import.meta.url), JSON.stringify(out));
console.log(`Baked ${sampled.grid.length} samples (${sampled.source}) for bbox`, bbox);
