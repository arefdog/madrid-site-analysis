#!/usr/bin/env node
// Income data pipeline (scaffold).
//
// Goal: replace the placeholder values in data/income.json with real figures
// from INE's "Atlas de Distribución de Renta de los Hogares" — average net
// income per household, keyed by municipality (and ideally census section).
//
// INE publishes this as downloadable tables (CSV/Excel) and via the JSON-stat
// API. The exact table id changes per release, so this script is intentionally
// a stub: fill in SOURCE_URL and the row mapping, then run `npm run data:income`.
//
// Steps to implement:
//   1. Download the source table into data/raw/ (gitignored).
//   2. Parse rows -> { [municipalityName]: incomeValue }.
//      Normalise names to match the boundary GeoJSON (see src/config.js featureName).
//   3. Write data/income.json with updated `values` and `meta.lastUpdated`.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'income.json');

const SOURCE_URL = ''; // TODO: INE table / JSON-stat endpoint

async function main() {
  if (!SOURCE_URL) {
    console.error('No SOURCE_URL set yet. Open scripts/fetch-income.mjs and wire the INE dataset.');
    console.error('Until then, data/income.json holds illustrative placeholder values.');
    process.exitCode = 1;
    return;
  }
  // const raw = await (await fetch(SOURCE_URL)).text();
  // const values = parse(raw);
  // await writeFile(OUT, JSON.stringify({ meta: {...}, values }, null, 2));
  console.log('Wrote', OUT);
}

main();
