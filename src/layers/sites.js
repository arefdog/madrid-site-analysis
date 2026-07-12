import L from 'leaflet';
import { SOURCES } from '../config.js';
import { CLASS_COLORS } from './landClass.js';
import sitesData from '../../data/sites.json';
import scores from '../../data/scores.json';

// Identified sites — every plot in data/sites.json follows the same report
// schema and renders through the same template below: compact popup on the
// map, full standardized report in an overlay. Parcel outlines are fetched
// at runtime from the Catastro INSPIRE WFS (official geometry, keyed by
// cadastral reference); the hand-drawn footprint is an offline fallback.

const STYLE_EXACT = { color: '#d97706', weight: 2, fillColor: '#f59e0b', fillOpacity: 0.25 };
const STYLE_APPROX = { color: '#d97706', weight: 2, dashArray: '6 4', fillColor: '#f59e0b', fillOpacity: 0.12 };

const SITES = sitesData.sites;

const dash = (v) => (v == null || v === '' ? '—' : v);
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

function modelReadout(muniCode) {
  const v = scores.values?.[muniCode];
  if (!v) return '—';
  const p = v.parts || {};
  return `<b>${v.score}/100</b> — nature ${p.nature} · access ${p.access} · ` +
    `exclusivity ${p.exclusivity} · income ${p.income} · ${v.elev} m · ${v.distMadrid} km from Madrid`;
}

function row(label, value) {
  return `<div class="sr-row"><span>${label}</span><div>${value}</div></div>`;
}

function section(title, body) {
  return `<div class="sr-section"><h4>${title}</h4>${body}</div>`;
}

// Official land-class chip, colored like the Land classification layer.
function classChip(cls) {
  const rgb = CLASS_COLORS[cls];
  if (!rgb) return '<i>unverified</i>';
  return `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;` +
    `background:rgb(${rgb.join(',')});border:1px solid rgba(255,255,255,.35);` +
    `margin-right:5px;vertical-align:-1px"></span>${cls.toLowerCase()}`;
}

function classificationHtml(c) {
  if (!c) return '—';
  const items = (c.detail || [])
    .map((d) => `<div><b>${classChip(d.class)}</b>${d.scope ? ` — ${d.scope}` : ''}</div>`)
    .join('');
  return `${items || '—'}${c.basis ? `<div class="sr-note">Basis: ${c.basis}</div>` : ''}`;
}

function catastroLink(rc) {
  return `<a href="${SOURCES.cadastreSheet.replace('{rc}', rc)}" target="_blank" rel="noopener"><code>${rc}</code></a>`;
}

// Cadastre section body — Catastro-sourced, so it is shared verbatim between
// the BYLD report and the public-records report.
function cadastreRows(site) {
  const refs = site.cadastre?.refs || [];
  return refs.length
    ? refs.map((r) => `${r.label} · ${catastroLink(r.rc)} · ${r.areaM2 ? `${num(r.areaM2)} m²` : '—'}`).join('<br>') +
      `<div class="sr-note">Outlines on the map are official Catastro geometry (INSPIRE).</div>`
    : '— <div class="sr-note">No cadastral reference yet — map outline is indicative.</div>';
}

// The standardized report: identical sections and rows for every site, in the
// same order. Missing data renders as an em-dash so gaps stay visible.
export function reportHtml(site) {
  const land = site.land || {};
  const loc = site.location || {};
  const plan = site.planning || {};
  const market = site.market || {};

  const sources = (site.sources || [])
    .map((s) => (s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.label} ↗</a>` : s.label))
    .join(' · ') || '—';

  const distances = (loc.distances || [])
    .map((d) => `${d.label} — ${d.km} km · ${d.time}`)
    .join('<br>') || '—';

  const refRows = cadastreRows(site);

  return `
    <div class="sr-head">
      <h3>${site.name}</h3>
      <div class="sr-sub">${dash(site.municipality)} · ${dash(site.status)}</div>
      <div class="sr-sub">${sources}</div>
    </div>
    ${section('1 · Land', [
      row('Gross surface', `${num(land.grossM2)} m²`),
      row('Parcels', dash(land.parcelCount)),
      row('Classification', dash(land.landClass)),
      row('Orientation', dash(land.orientation)),
      row('Elevation', land.elevationM ? `${land.elevationM} m` : '—'),
      row('Character', dash(land.features)),
    ].join(''))}
    ${section('2 · Location & access', [
      row('Access', dash(loc.accessNote)),
      row('Distances', distances),
    ].join(''))}
    ${section('3 · Cadastre', refRows)}
    ${section('4 · Planning', [
      row('Classification', classificationHtml(plan.classification)),
      row('Instrument', dash(plan.instrument)),
      row('Unit / sector', dash(plan.unit)),
      row('Buildable', plan.buildableM2 ? `${num(plan.buildableM2)} m²` : '—'),
      row('Capacity', dash(plan.capacity)),
      row('Density', dash(plan.density)),
      row('Cessions', dash(plan.cessions)),
      row('Development path', dash(plan.path)),
      row('Constraints', dash(plan.constraints)),
    ].join(''))}
    ${section('5 · Market & model', [
      row('Asking price', market.price ? `€${num(market.price)}` : '—'),
      row('Terms', dash(market.terms)),
      row('€/m²', market.pricePerM2 ? `€${num(market.pricePerM2)}` : '—'),
      row('Comps', dash(market.comps)),
      row('Listing', market.listingUrl
        ? `<a href="${market.listingUrl}" target="_blank" rel="noopener">open listing ↗</a>` : '—'),
      row('Model readout', modelReadout(site.muniCode)),
    ].join(''))}
    ${section('6 · BYLD fit', dash(site.fit))}
    ${section('7 · Masterplan (suggested)', masterplanHtml(site.masterplan))}`;
}

function masterplanHtml(mp) {
  if (!mp) return '—';
  const zones = (mp.zones || []).map((z) =>
    `<div class="sr-row"><span>${z.id} ${z.name}</span><div>` +
    `${z.areaM2 ? `${num(z.areaM2)} m² env` : '—'}${z.builtM2 ? ` · ${num(z.builtM2)} m² built` : ''}<br>` +
    `<span style="opacity:.85">${z.program}</span></div></div>`).join('');
  const mix = (mp.unitMix || []).map((u) => `${u.count} × ${u.type} — ${u.note}`).join('<br>');
  const list = (arr) => (arr || []).map((x) => `• ${x}`).join('<br>');
  return `
    <div class="sr-note" style="margin:0 0 8px">${mp.version || ''}<br>${mp.assumptions || ''}</div>
    ${zones}
    ${row('Unit mix', mix || '—')}
    ${row('Commercial', mp.commercial
      ? `<b>${mp.commercial.thesis}</b><br><br>${mp.commercial.valueLadder}<br><br>Exit: ${mp.commercial.exit}` : '—')}
    ${row('Code basis', list(mp.codeBasis) || '—')}
    ${row('Principles', list(mp.principles) || '—')}
    ${row('Phasing', list(mp.phasing) || '—')}`;
}

// Public-records report: only facts traceable to sources any third party can
// check — official registries (Catastro, SIU, BOCM), published planning
// instruments and open listings — with the source named on every section.
// Nothing from BYLD or the owner: no deck figures, no private terms, no fit,
// no masterplan, no engine score. Authored per site in data/sites.json under
// `publicRecord`; a section with `"cadastre": true` reuses the live Catastro
// rows above.
export function publicReportHtml(site) {
  const pr = site.publicRecord;
  const head = (title, sub) => `
    <div class="sr-head">
      <h3>${title}</h3>
      <div class="sr-sub">${sub}</div>
      <div class="sr-badge">Public sources only · registries, official viewers, open listings · no BYLD or owner input</div>
    </div>`;

  if (!pr) {
    return head(site.name, dash(site.municipality)) +
      section('Cadastre — Catastro (INSPIRE)', cadastreRows(site)) +
      section('Public record', 'No further public-record research on file for this site yet.');
  }

  const value = (r) => {
    if (r.rc) return catastroLink(r.rc);
    if (r.url) return `${r.value} <a href="${r.url}" target="_blank" rel="noopener">↗</a>`;
    return dash(r.value);
  };
  const sections = (pr.sections || []).map((s) => {
    const body = s.cadastre
      ? cadastreRows(site)
      : (s.rows || []).map((r) => row(r.label, value(r))).join('');
    return section(s.title, body + (s.note ? `<div class="sr-note">${s.note}</div>` : ''));
  }).join('');

  return head(pr.title || site.name,
    `${dash(site.municipality)} · public record as consulted ${dash(pr.asOf)}`) + sections;
}

function openReport(site, view = 'byld') {
  closeReport();
  const overlay = document.createElement('div');
  overlay.className = 'sr-overlay';
  overlay.innerHTML = `
    <div class="sr-card">
      <button class="sr-close" title="Close">×</button>
      <div class="sr-tabs">
        <button class="sr-tab" data-view="byld">BYLD report</button>
        <button class="sr-tab" data-view="public">Public record</button>
      </div>
      <div class="sr-body"></div>
    </div>`;
  const card = overlay.querySelector('.sr-card');
  const body = overlay.querySelector('.sr-body');
  const render = (v) => {
    body.innerHTML = v === 'public' ? publicReportHtml(site) : reportHtml(site);
    overlay.querySelectorAll('.sr-tab').forEach((t) => t.classList.toggle('active', t.dataset.view === v));
    card.scrollTop = 0;
  };
  overlay.querySelectorAll('.sr-tab').forEach((t) => t.addEventListener('click', () => render(t.dataset.view)));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeReport(); });
  overlay.querySelector('.sr-close').addEventListener('click', closeReport);
  document.body.appendChild(overlay);
  render(view);
}

function closeReport() {
  document.querySelector('.sr-overlay')?.remove();
}

window.__byldReport = (id, view) => {
  const site = SITES.find((s) => s.id === id);
  if (site) openReport(site, view);
};

function compactPopup(site, parcelLine) {
  const land = site.land || {};
  const v = scores.values?.[site.muniCode];
  return `
    <b>${site.name}</b><br>
    <span style="color:#555">${dash(site.status)}</span><br>
    ${num(land.grossM2)} m² · ${dash(land.landClass)}<br>
    Score ${v ? `<b>${v.score}/100</b>` : '—'} · ${land.elevationM ? `${land.elevationM} m` : '—'}
    ${parcelLine ? `<hr style="margin:6px 0;border:0;border-top:1px solid #ccc">${parcelLine}` : ''}
    <div style="margin-top:8px">
      <button class="sr-open" onclick="__byldReport('${site.id}')">BYLD report</button>
      <button class="sr-open sr-open--alt" onclick="__byldReport('${site.id}','public')">Public record</button>
      ${site.market?.listingUrl
        ? ` <a href="${site.market.listingUrl}" target="_blank" rel="noopener">listing ↗</a>` : ''}
    </div>`;
}

// Pull every <gml:posList> out of an INSPIRE GML response and return Leaflet
// [lat, lng] rings. Axis order varies by server config, so detect it: for
// Spain |lat| ≈ 36–44 always exceeds |lon| ≈ 0–9.
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
        : Math.abs(nums[0]) > Math.abs(nums[1]);
    const ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      ring.push(latFirst ? [nums[i], nums[i + 1]] : [nums[i + 1], nums[i]]);
    }
    rings.push(ring);
  }
  return rings;
}

// Average of a ring's vertices — a point inside compact parcels, used to place
// the marker within the outline (no map needed, unlike Polygon.getCenter()).
function centroid(ring) {
  let lat = 0, lng = 0;
  for (const [a, b] of ring) { lat += a; lng += b; }
  return [lat / ring.length, lng / ring.length];
}

export default {
  id: 'overlay-sites',
  label: 'Identified sites',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    for (const site of SITES) {
      const approx = site.footprint
        ? L.polygon(site.footprint, STYLE_APPROX)
            .bindPopup(compactPopup(site, '<span style="color:#555">Approximate outline</span>'), { maxWidth: 300 })
        : null;
      if (approx) group.addLayer(approx);

      // Keep the marker inside the parcel outline: start at the footprint's
      // centroid (fall back to the given point), then snap into the real
      // Catastro parcel once its exact geometry loads.
      const start = site.footprint ? centroid(site.footprint) : site.location.marker;
      const marker = L.marker(start, { title: site.name })
        .bindPopup(compactPopup(site), { maxWidth: 300 });
      group.addLayer(marker);

      let gotExact = false;
      for (const ref of site.cadastre?.refs || []) {
        fetch(SOURCES.cadastreParcelWfs.replace('{rc}', ref.rc))
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`Catastro ${r.status}`))))
          .then((gml) => {
            const rings = parseGmlRings(gml);
            if (!rings.length) throw new Error('no geometry in response');
            if (!gotExact) {
              gotExact = true;
              if (approx) group.removeLayer(approx);
              marker.setLatLng(centroid(rings[0])); // move pin into the real parcel
            }
            group.addLayer(L.polygon(rings, STYLE_EXACT)
              .bindPopup(compactPopup(site, `${ref.label} · ${catastroLink(ref.rc)}`), { maxWidth: 300 }));
          })
          .catch((e) => console.warn(`[sites] ${ref.rc}:`, e.message));
      }
    }
    return group;
  },
};
