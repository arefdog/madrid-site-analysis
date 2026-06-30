#!/usr/bin/env node
// Short-term-rental (STR) data pipeline — Inside Airbnb, Madrid.
//
// Downloads the latest Inside Airbnb summary listings + neighbourhood
// boundaries, aggregates per barrio, and writes a single merged GeoJSON
// (data/airbnb-madrid.geojson) the app loads directly. Free + open data.
//
// Revenue/occupancy use the "San Francisco model" (Inside Airbnb's own method):
// bookings are estimated from review volume.
//   booked_nights ≈ reviews_per_month × 12 × avg_stay / review_rate, capped.
//
// Run: npm run data:airbnb   (set DATE below to the current release)

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATE = '2026-03-24';
const BASE = `https://data.insideairbnb.com/spain/comunidad-de-madrid/madrid/${DATE}/visualisations`;
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'data', 'airbnb-madrid.geojson');

const REVIEW_RATE = 0.5; // share of stays that leave a review
const AVG_STAY = 3;      // nights per booking (Madrid ~ short trips)
const OCC_CAP = 0.70;    // realistic max occupancy

async function exists(p) { try { await stat(p); return true; } catch { return false; } }
async function fetchText(url, cache) {
  const f = join(RAW, cache);
  if (await exists(f)) return readFile(f, 'utf8');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  await mkdir(RAW, { recursive: true });
  await writeFile(f, text);
  return text;
}

// Minimal RFC-4180 CSV parser (handles quoted fields with commas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

async function main() {
  const rows = parseCsv(await fetchText(`${BASE}/listings.csv`, 'airbnb-listings.csv'));
  const head = rows[0];
  const col = Object.fromEntries(head.map((h, i) => [h, i]));
  const byNb = {};
  for (const r of rows.slice(1)) {
    const nb = r[col.neighbourhood];
    if (!nb) continue;
    const price = Number(r[col.price]);
    const rpm = Number(r[col.reviews_per_month]) || 0;
    (byNb[nb] ??= { prices: [], revenues: [], occ: [], n: 0 });
    byNb[nb].n++;
    const bucket = byNb[nb];
    let occ = null;
    if (Number.isFinite(price) && price > 0) {
      bucket.prices.push(price);
      const bookedNights = Math.min((rpm * 12 * AVG_STAY) / REVIEW_RATE, 365 * OCC_CAP);
      occ = bookedNights / 365;
      bucket.occ.push(occ);
      bucket.revenues.push(Math.round(price * bookedNights));
    }
  }

  const geo = JSON.parse(await fetchText(`${BASE}/neighbourhoods.geojson`, 'airbnb-neighbourhoods.geojson'));
  for (const f of geo.features) {
    const s = byNb[f.properties.neighbourhood];
    f.properties = {
      neighbourhood: f.properties.neighbourhood,
      district: f.properties.neighbourhood_group,
      listings: s?.n || 0,
      medianPrice: s ? median(s.prices) : null,
      estOccupancy: s && s.occ.length ? Math.round(median(s.occ.map((x) => x * 100))) : null,
      estAnnualRevenue: s ? median(s.revenues) : null,
    };
  }
  geo.meta = {
    source: `Inside Airbnb — Madrid, ${DATE}`,
    sourceUrl: 'https://insideairbnb.com/get-the-data/',
    method: 'San Francisco model (occupancy from review volume); medians per barrio.',
    note: 'Estimates, not booked figures. Madrid municipality only.',
  };
  await writeFile(OUT, JSON.stringify(geo));
  console.log(`Wrote ${geo.features.length} barrios -> ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
