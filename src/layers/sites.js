import L from 'leaflet';
import { SOURCES } from '../config.js';

// Identified sites — listings/parcels we have pinned down, with their planning
// facts. Parcel outlines are fetched at runtime from the Catastro INSPIRE WFS
// (exact official geometry, keyed by cadastral reference); a hand-drawn
// approximate footprint is kept only as an offline fallback.

const STYLE_EXACT = { color: '#d97706', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.25 };
const STYLE_APPROX = { color: '#d97706', weight: 2, dashArray: '6 4', fillColor: '#f59e0b', fillOpacity: 0.12 };

const SITES = [
  {
    id: 'boalo-estate',
    name: 'Boalo — BYLD landscape estate',
    // Marker from the BYLD Boalo deck cover (40.7167 N, 3.9000 W); the
    // outline comes from the parcel's official Catastro geometry.
    marker: [40.7167, -3.9],
    refs: [
      { rc: '1683501VL2018S', label: 'Parcela catastral · 70,484 m²' },
    ],
    footprint: [
      [40.7178, -3.9018],
      [40.7176, -3.8982],
      [40.7156, -3.8984],
      [40.7158, -3.902],
    ],
    facts: `
      <b>Boalo — BYLD landscape estate</b><br>
      <span style="color:#555">BYLD deck · May 2026 · under reservation</span>
      <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
      <b>70,484 m²</b> · single contiguous parcel, one owner · southern edge of El Boalo<br>
      920 m elevation · S/SE orientation · 0 km to the P.N. de Guadarrama buffer<br>
      Program (17,621 m² buildable · 25%): residences 5,392 m² · hotel 5,286 m² (44 keys) ·
      spa + restaurant 5,110 m² · VPP 3,524 m² · parking 1,762 m²<br>
      Dehesa &amp; trails kept open: 52,863 m² (75% of parcel)<br>
      <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
      <span style="color:#555">Map readout: El Boalo scores <b>90/100</b> (nature 100 · access 100 ·
      income 34 · exclusivity 33) · ~29 min from Madrid (M-607/A-6).</span>`,
  },
  {
    id: 'colmenarejo-ue18',
    name: 'U.E. 18 «Colonia de Santiago» — Colmenarejo',
    // Access corner: Camino de la Fuente Elvira × Calle del Pisuerga.
    marker: [40.5587, -4.0076],
    // Cadastral references from the listing's parcel plan: 12 urban plots
    // (PARCELA 01–12) + the rústico parcel. The two zona-verde parcels
    // (1,952.60 + 2,043.27 m²) had no legible reference on the plan.
    refs: [
      { rc: '4707410VK1940N', label: 'Parcela 01 · 1,219.75 m²' },
      { rc: '4707409VK1940N', label: 'Parcela 02 · 1,053.38 m²' },
      { rc: '4707408VK1940N', label: 'Parcela 03 · 1,049.88 m²' },
      { rc: '4807708VK1940N', label: 'Parcela 04 · 1,009.23 m²' },
      { rc: '4807707VK1940N', label: 'Parcela 05 · 1,008.27 m²' },
      { rc: '4807706VK1940N', label: 'Parcela 06 · 1,004.09 m²' },
      { rc: '4807705VK1940N', label: 'Parcela 07 · 1,002.26 m²' },
      { rc: '4806107VK1940N', label: 'Parcela 08 · 1,554.02 m²' },
      { rc: '4606512VK1940N', label: 'Parcela 09 · 1,118.27 m²' },
      { rc: '4606511VK1940N', label: 'Parcela 10 · 1,224.99 m²' },
      { rc: '4606507VK1940N', label: 'Parcela 11 · 1,023.86 m²' },
      { rc: '4606506VK1940N', label: 'Parcela 12 · 1,011.64 m²' },
      { rc: '28061A02200075', label: 'Parcela rústica 28061A02200075' },
    ],
    // Offline fallback only (±50 m): E–W block cluster SE of the Fuente
    // Elvira × Pisuerga junction, per the relative positions encoded in the
    // manzana numbers (46065 → 47074 → 48077/48061, each ~100 m apart E) and
    // the listing aerial (field between C. del Pisuerga and C. del Ter, with
    // the rústico parcel running E into the dehesa).
    footprint: [
      [40.5586, -4.0075],
      [40.5578, -4.004],
      [40.557, -4.0028],
      [40.5561, -4.0037],
      [40.5566, -4.006],
      [40.5572, -4.007],
    ],
    facts: `
      <b>U.E. 18 «Colonia de Santiago» — Colmenarejo</b><br>
      <a href="https://www.idealista.com/inmueble/111936104/" target="_blank" rel="noopener">idealista listing 111936104 ↗</a>
      <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
      <b>27,122 m²</b> gross · execution unit in <b>suelo urbano</b> (NNSS Colmenarejo 1996)<br>
      Max <b>18 homes</b> · 7 homes/ha · low-density single-family (Zona 03 gr. 3º)<br>
      Cessions: road network + 3,948 m² green space (Zona 07 gr. 1º)<br>
      Development: Estudio de Detalle + urbanisation project · <i>compensación</i>, private initiative<br>
      <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
      <span style="color:#555">Map readout: Colmenarejo scores <b>86/100</b> (nature 87 · access 98 ·
      exclusivity 100 · income 34) · ~830 m elevation · ~29 km from Madrid.</span>`,
  },
];

// Pull every <gml:posList> out of an INSPIRE GML response and return Leaflet
// [lat, lng] rings. Axis order varies by server config, so detect it: the
// coordinate in [-90, 90] that pairs with one outside that range is the lat.
export function parseGmlRings(gml) {
  const rings = [];
  const re = /<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g;
  let m;
  while ((m = re.exec(gml))) {
    const nums = m[1].trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length < 6) continue;
    const latFirst = Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) > 90
      ? true
      : Math.abs(nums[1]) <= 90 && Math.abs(nums[0]) > 90
        ? false
        : Math.abs(nums[0]) > Math.abs(nums[1]); // Spain: |lat| ≈ 36–44 > |lon| ≈ 0–9
    const ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      ring.push(latFirst ? [nums[i], nums[i + 1]] : [nums[i + 1], nums[i]]);
    }
    rings.push(ring);
  }
  return rings;
}

function parcelPopup(site, ref) {
  const sheet = SOURCES.cadastreSheet.replace('{rc}', ref.rc);
  return `
    ${site.facts}
    <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
    ${ref.label}<br><code>${ref.rc}</code> ·
    <a href="${sheet}" target="_blank" rel="noopener">Catastro record ↗</a><br>
    <span style="color:#555">Outline: official Catastro geometry (INSPIRE).</span>`;
}

export default {
  id: 'overlay-sites',
  label: 'Identified sites',
  group: 'overlay',
  enabled: true,
  create() {
    const group = L.layerGroup();
    for (const site of SITES) {
      const approx = L.polygon(site.footprint, STYLE_APPROX).bindPopup(
        `${site.facts}<hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
         <span style="color:#555">Approximate outline — exact Catastro geometry unavailable.</span>`,
        { maxWidth: 340 },
      );
      group.addLayer(approx);
      group.addLayer(L.marker(site.marker, { title: site.name })
        .bindPopup(site.facts, { maxWidth: 340 }));

      let gotExact = false;
      for (const ref of site.refs) {
        fetch(SOURCES.cadastreParcelWfs.replace('{rc}', ref.rc))
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Catastro ${r.status}`))))
          .then((gml) => {
            const rings = parseGmlRings(gml);
            if (!rings.length) throw new Error('no geometry in response');
            if (!gotExact) { gotExact = true; group.removeLayer(approx); }
            group.addLayer(L.polygon(rings, STYLE_EXACT)
              .bindPopup(parcelPopup(site, ref), { maxWidth: 340 }));
          })
          .catch((e) => console.warn(`[sites] ${ref.rc}:`, e.message));
      }
    }
    return group;
  },
};
