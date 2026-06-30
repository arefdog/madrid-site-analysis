# Madrid Site Analysis — BYLD

Interactive map to screen plots and areas across the **Comunidad de Madrid** for
development potential: purchasing power, public transport, roads, topography and
(planned) buildable-land / zoning.

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:4601
npm run build        # production bundle -> dist/
```

## Architecture

The app is a Vite + vanilla-JS Leaflet map. The core idea is a **layer
registry**: every map layer is a self-contained descriptor, and the control
panel + toggle wiring are generated from it. Adding a dataset does not touch the
map or UI code.

```
madrid-site-analysis/
├─ index.html              # minimal shell (#map + #panel)
├─ vite.config.js
├─ data/
│  └─ income.json          # purchasing-power values + metadata (placeholder)
├─ scripts/
│  └─ fetch-income.mjs     # data pipeline stub (INE income)
└─ src/
   ├─ main.js              # map bootstrap, lazy layer activation
   ├─ config.js            # map defaults + external data sources (tiles, boundaries)
   ├─ styles.css
   ├─ ui/panel.js          # builds the panel from the registry
   └─ layers/
      ├─ index.js          # ← the registry (edit this to add a layer)
      ├─ base.js           # street / topo / satellite base maps
      ├─ purchasingPower.js# income choropleth
      ├─ transport.js      # rail/metro overlay
      ├─ topography.js     # hillshade / slope
      └─ plots.js          # drawn candidate plots (saved to localStorage)
```

### Adding a layer

1. Create `src/layers/myLayer.js` default-exporting a descriptor:

   ```js
   export default {
     id: 'overlay-zoning',
     label: 'Buildable land / zoning',
     group: 'overlay',          // 'base' | 'overlay' | 'workspace'
     enabled: false,
     legend: '<div>…</div>',    // optional HTML
     create(map) { return L.geoJSON(/* … */); },  // return a Leaflet layer
   };
   ```

2. Import it in `src/layers/index.js` and add it to the `layers` array.

`create(map)` may return a `LayerGroup` and fill it asynchronously (see
`purchasingPower.js`) so toggles stay instant while data loads.

## Data roadmap

Layers ship with public tiles / placeholder data first, then get wired to
authoritative sources:

| Layer | Status | Real source |
|-------|--------|-------------|
| Purchasing power | placeholder values | INE *Atlas de Distribución de Renta de los Hogares* (census-section) |
| Cadastral parcels + site info | **live** | Catastro WMS + reverse-geocode (cadastral ref, address, official sheet) |
| Land use / land cover | **live** | Copernicus CORINE 2018 (greenfield vs. built) |
| Topography | **live** | Esri hillshade + EU-DEM 25 m point elevation |
| Land classification (urbano/urbanizable/rústico) | **live** | SIU *Clases de Suelo* (Min. Vivienda) — ArcGIS export tiles |
| Transport access | rail tiles only | CRTM stations + walk/drive isochrones (OpenRouteService) |
| Slope classes | not started | Derive classified slope bands from EU-DEM |

### Language toggle

The panel has an **EN/ES** button (top-right). All labels and legends live in
[`src/i18n.js`](src/i18n.js) keyed by layer id — add both languages there when
you add a layer. Choice is saved to the browser.

### Developer site info

With **Cadastral parcels** on, clicking a plot resolves its **cadastral
reference** and address from Catastro and links to the official record — the
handle for ownership, built area and use lookups. Combine with the elevation
click (Topography) and the income choropleth for a fast first-pass site read.

Run data pipelines from `scripts/` (e.g. `npm run data:income`). Raw downloads
go to `data/raw/` (gitignored); the app consumes processed JSON/GeoJSON in
`data/`.

> ⚠️ `data/income.json` currently holds **illustrative placeholder** income
> figures — ranked plausibly but not authoritative. Replace before using for
> decisions.
