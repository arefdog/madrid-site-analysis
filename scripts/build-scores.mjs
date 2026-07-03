#!/usr/bin/env node
// Attractiveness Score pipeline — composite 0–100 per municipality, tuned for a
// LUXURY WELLNESS RETREAT + BRANDED VILLAS thesis.
//
// Factors (each normalised 0–100 across the region, then weighted):
//   income       purchasing power / luxury buyer depth   INE
//   nature       elevation (sierra setting, views)       OpenTopoData
//   access       reachable from Madrid but not urban     centroid distance
//   exclusivity  low hotel/urban density (calm)          OSM hotels (inverse)
//   premiumHosp  proven luxury market (4–5★ hotels)       OSM hotels
//
// Weights reflect the thesis: wealth + nature + reachable seclusion dominate.
// Run: npm run data:scores

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => JSON.parse(readFileSyncWrap(p));
import { readFileSync } from 'node:fs';
function readFileSyncWrap(p) { return readFileSync(join(ROOT, p), 'utf8'); }

const WEIGHTS = { income: 0.10, nature: 0.50, access: 0.35, exclusivity: 0.05, premiumHosp: 0 };
const MADRID = [40.4168, -3.7038]; // Puerta del Sol
const ACCESS_PEAK_KM = 32;          // sweet spot: reachable, not in the city
const ACCESS_SIGMA = 22;
// Wellness siting favours accessible mid-sierra altitude, not the highest peaks:
// score nature as a sweet-spot around ~900 m rather than "higher is better".
const NATURE_PEAK_M = 900;
const NATURE_SIGMA_M = 200;

const toRad = (d) => (d * Math.PI) / 180;
function haversine([la1, lo1], [la2, lo2]) {
  const R = 6371, dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function centroid(geom) {
  const ring = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
  let x = 0, y = 0;
  for (const [lon, lat] of ring) { x += lon; y += lat; }
  return [y / ring.length, x / ring.length]; // [lat, lon]
}
const minmax = (vals) => {
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
};

async function elevations(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const locs = batch.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join('|');
    const res = await fetch(`https://api.opentopodata.org/v1/eudem25m?locations=${locs}`);
    if (!res.ok) throw new Error(`OpenTopoData ${res.status}`);
    const data = await res.json();
    out.push(...data.results.map((x) => x.elevation ?? 0));
    if (i + 100 < points.length) await new Promise((s) => setTimeout(s, 1200)); // rate limit
  }
  return out;
}

async function main() {
  const geo = JSON.parse(readFileSyncWrap('data/madrid-municipios.geojson'));
  const income = JSON.parse(readFileSyncWrap('data/income.json')).values;
  const hotels = JSON.parse(readFileSyncWrap('data/hotels.json')).values;

  const rows = geo.features.map((f) => {
    const c = centroid(f.geometry);
    const h = hotels[f.properties.code];
    const premium = h ? (h.stars['4'] || 0) + (h.stars['5'] || 0) : 0;
    return {
      code: f.properties.code, name: f.properties.name, c,
      income: income[f.properties.code] ?? null,
      distMadrid: haversine(MADRID, c),
      hotelCount: h?.count || 0,
      premium,
    };
  });

  console.log('Fetching elevations…');
  const elev = await elevations(rows.map((x) => x.c));
  rows.forEach((x, i) => { x.elev = elev[i]; });

  // Normalisers
  const nIncome = minmax(rows.filter((x) => x.income != null).map((x) => x.income));
  const nExcl = minmax(rows.map((x) => 1 / (1 + x.hotelCount)));
  const nHosp = minmax(rows.map((x) => x.premium));
  const accessRaw = (d) => Math.exp(-(((d - ACCESS_PEAK_KM) / ACCESS_SIGMA) ** 2)) * 100;
  // Nature as a wellness sweet-spot: accessible mid-sierra altitude scores best.
  const natureRaw = (m) => Math.exp(-(((m - NATURE_PEAK_M) / NATURE_SIGMA_M) ** 2)) * 100;

  const values = {};
  for (const x of rows) {
    const parts = {
      income: x.income == null ? 0 : Math.round(nIncome(x.income)),
      nature: Math.round(natureRaw(x.elev)),
      access: Math.round(accessRaw(x.distMadrid)),
      exclusivity: Math.round(nExcl(1 / (1 + x.hotelCount))),
      premiumHosp: Math.round(nHosp(x.premium)),
    };
    const score = Math.round(
      Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0)
    );
    values[x.code] = { score, parts, elev: Math.round(x.elev), distMadrid: Math.round(x.distMadrid) };
  }

  await writeFile(join(ROOT, 'data/scores.json'), JSON.stringify({
    meta: {
      model: 'Luxury wellness retreat + branded villas',
      weights: WEIGHTS,
      factors: 'income, nature(sweet-spot altitude ~900m), access(distance sweet-spot ~32km), exclusivity(low hotel density), premiumHosp(4-5★)',
      note: 'Nature and access are scored as wellness sweet-spots (accessible mid-sierra, ~30 min out) rather than "more is better". Scores are relative rankings within the region (0–100), not absolute.',
      generated: new Date().toISOString().slice(0, 10),
    },
    values,
  }));
  const top = Object.entries(values).sort((a, b) => b[1].score - a[1].score).slice(0, 8);
  const nameOf = Object.fromEntries(rows.map((x) => [x.code, x.name]));
  console.log('Top areas:');
  for (const [code, v] of top) console.log(`  ${nameOf[code].padEnd(24)} ${v.score}  (inc ${v.parts.income} nat ${v.parts.nature} acc ${v.parts.access} exc ${v.parts.exclusivity})`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
