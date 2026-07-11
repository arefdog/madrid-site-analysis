// Renders a public-records possibilities dossier (data/possibilities.json shape)
// to an HTML string, and exposes the scoped stylesheet the layer injects once.
// Pure — the layer owns the DOM container and click wiring. Mirrors the format
// of the published sample artifact; public records only, no scheme intel.

import { computeVerdict, LEVEL } from './verdict.js';

const CONF = {
  verified: { cls: 'pv-verified', label: 'Verified' },
  medium: { cls: 'pv-caution', label: 'Medium' },
  weak: { cls: 'pv-risk', label: 'Weak' },
  pending: { cls: 'pv-pending', label: 'Pending' },
};
const LEVEL_CLS = {
  [LEVEL.GO]: 'pv-verified',
  [LEVEL.CAUTION]: 'pv-caution',
  [LEVEL.NOGO]: 'pv-risk',
  [LEVEL.PENDING]: 'pv-pending',
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function badge(row) {
  const conf = CONF[row.confidence] || CONF.pending;
  return `<span class="pv-flag ${conf.cls}">${esc(row.flag || conf.label)}</span>`;
}

function rowHtml(r) {
  const val = r.pending
    ? `<span class="pv-pending-val">${esc(r.value)}</span>`
    : `<span class="pv-big">${esc(r.value)}</span>`;
  const note = r.note ? `<span class="pv-note">${esc(r.note)}</span>` : '';
  return `<div class="pv-row"><div class="pv-label">${esc(r.label)}</div><div class="pv-val">${val}${note}</div><div class="pv-badge">${badge(r)}</div></div>`;
}

function section(num, title, rowsHtml, extra = '') {
  return `<section class="pv-block"><div class="pv-bh"><span class="pv-num">${num}</span><h3>${esc(title)}</h3></div>${rowsHtml}${extra}</section>`;
}

function tile(t) {
  return `<div class="pv-tile ${LEVEL_CLS[t.level]}"><p class="pv-k">${esc(t.k)}</p><p class="pv-v">${esc(t.label)}</p><p class="pv-n">${esc(t.note)}</p></div>`;
}

export function renderDossier(rc, record) {
  const id = record.identity || {};
  const verdict = computeVerdict(record.signals || {});
  const tiles = [
    { ...verdict.buildability, k: 'Buildability' },
    { ...verdict.entitlement, k: 'Entitlement risk' },
    { ...verdict.overrides, k: 'Hard overrides' },
  ].map(tile).join('');

  const q1 = (record.canIBuild || []).map(rowHtml).join('');
  const q2 = (record.howMuch || []).map(rowHtml).join('');
  const wp = record.whatPermitted || {};
  const q3 = (wp.rows || []).map(rowHtml).join('');
  const callout = wp.callout ? `<div class="pv-callout"><span>▲ RISK</span><p>${esc(wp.callout)}</p></div>` : '';

  const mk = record.market || {};
  const stats = (mk.stats || []).map((s) =>
    `<div class="pv-stat"><p class="pv-sk">${esc(s.k)}</p><p class="pv-sv ${s.pending ? 'pv-pending-val' : ''}">${esc(s.v)}</p><p class="pv-ss">${esc(s.s || '')}</p></div>`).join('');
  const q4rows = (mk.rows || []).map(rowHtml).join('');

  const coords = Array.isArray(id.coords) ? `${id.coords[0]}, ${id.coords[1]}` : '';
  const area = typeof id.areaM2 === 'number' ? id.areaM2.toLocaleString('en-US') : id.areaM2;

  return `
    <div class="pv-headblock">
      <p class="pv-eyebrow">Parcel possibilities · public records</p>
      <h2>${esc(id.municipality || '')} — ${esc(id.classification || rc)}</h2>
      <div class="pv-id"><b>${esc(rc)}</b> · ${esc(area)} m² · ${esc(id.haM2)} ha · ${esc(coords)} · elev ${esc(id.elevM)} m</div>
    </div>
    <div class="pv-verdict">${tiles}</div>
    ${section('01', 'Can I build here?', q1)}
    ${section('02', 'How much can I build?', q2)}
    ${section('03', 'What does the zoning permit?', q3, callout)}
    ${section('04', "What's the market context?", `<div class="pv-econ">${stats}</div>${q4rows}`)}
    <div class="pv-sources">${esc(record.sources || '')}</div>`;
}

export const POSSIBILITIES_CSS = `
.pv-panel{position:fixed;top:0;right:0;height:100vh;width:min(400px,94vw);z-index:1200;background:#fff;color:#1a1e1b;box-shadow:-8px 0 30px -12px rgba(0,0,0,.35);overflow-y:auto;border-left:1px solid #dbe0d8;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5}
.pv-panel[hidden]{display:none}
.pv-close{position:sticky;top:8px;float:right;margin:8px 8px -30px 0;width:30px;height:30px;border:1px solid #dbe0d8;border-radius:8px;background:#f6f7f4;color:#626c64;font-size:19px;line-height:1;cursor:pointer}
.pv-close:hover{background:#eceee9}
.pv-body{padding:16px 18px 44px}
.pv-loading{padding:48px 0;text-align:center;color:#626c64}
.pv-headblock h2{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-weight:600;font-size:19px;line-height:1.15;margin:2px 0 6px;text-wrap:balance}
.pv-eyebrow{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8a5a24;margin:0 0 8px}
.pv-id{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:#626c64;margin-bottom:14px}
.pv-id b{color:#1a1e1b}
.pv-verdict{display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:4px}
.pv-tile{border:1px solid #dbe0d8;border-left-width:4px;border-radius:10px;padding:10px 12px}
.pv-tile.pv-verified{border-left-color:#2f7a4e}
.pv-tile.pv-caution{border-left-color:#9c6a15}
.pv-tile.pv-risk{border-left-color:#a8403a}
.pv-tile.pv-pending{border-left-color:#6a6f86}
.pv-k{font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#8b948b;margin:0 0 5px}
.pv-v{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;font-size:16px;line-height:1.1;margin:0 0 3px}
.pv-tile.pv-verified .pv-v{color:#2f7a4e}
.pv-tile.pv-caution .pv-v{color:#9c6a15}
.pv-tile.pv-risk .pv-v{color:#a8403a}
.pv-tile.pv-pending .pv-v{color:#5b6072}
.pv-n{font-size:12px;color:#626c64;margin:0}
.pv-block{border-top:1px solid #dbe0d8;margin-top:14px;padding-top:12px}
.pv-bh{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
.pv-num{font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;color:#8a5a24}
.pv-bh h3{font-family:"Iowan Old Style",Palatino,Georgia,serif;font-weight:600;font-size:15px;margin:0}
.pv-row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:9px 0;border-top:1px dashed #e6e9e2}
.pv-row:first-of-type{border-top:0}
.pv-label{grid-column:1;grid-row:1;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#8b948b}
.pv-val{grid-column:1;grid-row:2}
.pv-badge{grid-column:2;grid-row:1/3;align-self:start}
.pv-big{font-family:ui-monospace,Menlo,monospace;font-size:13.5px;font-weight:600;color:#1a1e1b}
.pv-pending-val{font-style:italic;color:#6a6f86}
.pv-note{display:block;color:#626c64;font-size:12.5px;margin-top:3px}
.pv-flag{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:999px;white-space:nowrap}
.pv-flag.pv-verified{color:#2f7a4e;background:#e4f0e7}
.pv-flag.pv-caution{color:#9c6a15;background:#f6ecd6}
.pv-flag.pv-risk{color:#a8403a;background:#f5e0dd}
.pv-flag.pv-pending{color:#5b6072;background:#e8e9f1}
.pv-callout{display:flex;gap:10px;margin-top:12px;padding:11px 13px;border:1px solid #9c6a15;background:#f6ecd6;border-radius:10px}
.pv-callout span{font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:700;color:#9c6a15;flex:none}
.pv-callout p{margin:0;font-size:12.5px}
.pv-econ{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 6px}
.pv-stat{border:1px solid #dbe0d8;border-radius:8px;padding:8px 9px;background:#f6f7f4}
.pv-sk{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8b948b;margin:0 0 4px}
.pv-sv{font-family:ui-monospace,Menlo,monospace;font-size:14px;font-weight:600;margin:0}
.pv-ss{font-size:11px;color:#626c64;margin:2px 0 0}
.pv-sources{margin-top:16px;padding-top:12px;border-top:1px dashed #c4cbc1;font-size:11px;line-height:1.6;color:#8b948b}
.pv-sources a{color:#8a5a24}
@media (max-width:520px){.pv-panel{width:100vw}.pv-econ{grid-template-columns:1fr}}
`;
