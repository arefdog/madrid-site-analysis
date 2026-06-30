#!/usr/bin/env node
// Income data pipeline — regenerates data/income.json from INE.
//
// Source: INE table 31097 "Indicadores de renta media y mediana"
//   (Atlas de Distribución de Renta de los Hogares), municipality level.
// Indicator used: "Renta neta media por hogar" (net average household income),
// latest available year, filtered to province 28 (Comunidad de Madrid).
// Keyed by INE municipality code, which joins to data/madrid-municipios.geojson.
//
// Run: npm run data:income
// The 33 MB source CSV is cached in data/raw/ (gitignored) and reused.

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw', 'ine-31097.csv');
const OUT = join(ROOT, 'data', 'income.json');
const SOURCE_URL = 'https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31097.csv?nocab=1';
const INDICATOR = 'Renta neta media por hogar';
const PROVINCE = '28'; // Comunidad de Madrid

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function loadCsv() {
  if (await exists(RAW)) return new TextDecoder('latin1').decode(await readFile(RAW));
  console.log('Downloading INE table 31097 (~33 MB)…');
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`INE download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(RAW), { recursive: true });
  await writeFile(RAW, buf);
  return new TextDecoder('latin1').decode(buf);
}

function parse(csv) {
  const rows = csv.split('\n').slice(1); // drop header
  const byYear = {}; // year -> { code -> value }
  for (const line of rows) {
    const [mun, distrito, seccion, indicador, periodo, total] = line.split(';');
    if (!mun || distrito || seccion) continue;      // municipality totals only
    if (indicador !== INDICATOR) continue;
    if (!mun.startsWith(PROVINCE)) continue;          // Madrid province
    const value = Number(String(total).replace(/\./g, '').trim());
    if (!Number.isFinite(value)) continue;
    const code = mun.slice(0, 5);
    (byYear[periodo] ??= {})[code] = value;
  }
  const year = Object.keys(byYear).sort().at(-1);
  return { year, values: byYear[year] };
}

async function main() {
  const { year, values } = parse(await loadCsv());
  const out = {
    meta: {
      indicator: 'Renta neta media por hogar (net average household income)',
      unit: 'EUR/year',
      year,
      source: 'INE — Atlas de Distribución de Renta de los Hogares, table 31097',
      sourceUrl: 'https://ine.es/jaxiT3/Tabla.htm?t=31097',
      keyedBy: 'INE municipality code (joins data/madrid-municipios.geojson)',
      generated: new Date().toISOString().slice(0, 10),
    },
    values,
  };
  await writeFile(OUT, JSON.stringify(out, null, 0));
  console.log(`Wrote ${Object.keys(values).length} municipalities for ${year} -> ${OUT}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
