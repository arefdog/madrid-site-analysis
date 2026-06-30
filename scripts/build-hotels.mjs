#!/usr/bin/env node
// Hotel concentration pipeline — OpenStreetMap (Overpass), Comunidad de Madrid.
//
// Fetches every tourism=hotel in the region, assigns each to its municipality
// (point-in-polygon against data/madrid-municipios.geojson), and writes
// data/hotels.json keyed by INE code: { count, named, stars:{1..5} }.
// Free + region-wide. Run: npm run data:hotels

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw', 'osm-hotels.json');
const MUNI = join(ROOT, 'data', 'madrid-municipios.geojson');
const OUT = join(ROOT, 'data', 'hotels.json');

const QUERY = `[out:json][timeout:90];
area["name"="Comunidad de Madrid"]["admin_level"="4"]->.a;
( node["tourism"="hotel"](area.a); way["tourism"="hotel"](area.a); );
out tags center;`;

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function loadHotels() {
  if (await exists(RAW)) return JSON.parse(await readFile(RAW, 'utf8'));
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: QUERY });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const data = await res.json();
  await mkdir(dirname(RAW), { recursive: true });
  await writeFile(RAW, JSON.stringify(data));
  return data;
}

// Ray-casting point-in-polygon (handles Polygon + MultiPolygon).
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPolygon(x, y, poly) { // poly = array of rings; first is outer
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false; // holes
  return true;
}
function locate(x, y, features) {
  for (const f of features) {
    const g = f.geometry;
    if (g.type === 'Polygon' && inPolygon(x, y, g.coordinates)) return f.properties.code;
    if (g.type === 'MultiPolygon' && g.coordinates.some((p) => inPolygon(x, y, p))) return f.properties.code;
  }
  return null;
}

async function main() {
  const hotels = (await loadHotels()).elements;
  const geo = JSON.parse(await readFile(MUNI, 'utf8'));
  const values = {};
  let placed = 0;
  for (const h of hotels) {
    const lat = h.lat ?? h.center?.lat;
    const lon = h.lon ?? h.center?.lon;
    if (lat == null || lon == null) continue;
    const code = locate(lon, lat, geo.features);
    if (!code) continue;
    placed++;
    const v = (values[code] ??= { count: 0, named: 0, stars: {} });
    v.count++;
    if (h.tags?.name) v.named++;
    const s = h.tags?.stars;
    if (s && /^[1-5]$/.test(s)) v.stars[s] = (v.stars[s] || 0) + 1;
  }
  await writeFile(OUT, JSON.stringify({
    meta: {
      indicator: 'Hotel count per municipality',
      source: 'OpenStreetMap (tourism=hotel) via Overpass',
      note: 'Star ratings present on a subset of hotels.',
      generated: new Date().toISOString().slice(0, 10),
    },
    values,
  }));
  console.log(`Placed ${placed}/${hotels.length} hotels into ${Object.keys(values).length} municipalities -> ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
