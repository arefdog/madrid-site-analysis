import L from 'leaflet';
import { SOURCES } from '../config.js';
import data from '../../data/possibilities.json';
import { renderDossier, POSSIBILITIES_CSS } from '../possibilities/render.js';

// Parcel possibilities — the product's headline feature.
// Click any parcel: resolve its cadastral reference via Catastro (same source as
// the cadastre layer), match a compiled public-records dossier, and render the
// synthesized buildability verdict into a slide-in panel. Parcels without a
// compiled dossier fall back to a plain cadastral-lookup card.

let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = POSSIBILITIES_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}

function parseRC(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const text = (tag) => doc.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  if (text('des')) return null; // Catastro error / no parcel
  return (text('pc1') + text('pc2')) || null;
}

async function resolveRC(lat, lng) {
  const url = SOURCES.cadastreByCoord.replace('{x}', lng.toFixed(7)).replace('{y}', lat.toFixed(7));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catastro ${res.status}`);
  return parseRC(await res.text());
}

function buildPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'pv-panel';
  wrap.setAttribute('hidden', '');
  wrap.innerHTML = '<button class="pv-close" type="button" aria-label="Close">×</button><div class="pv-body"></div>';
  wrap.querySelector('.pv-close').addEventListener('click', () => wrap.setAttribute('hidden', ''));
  document.body.appendChild(wrap);
  return wrap;
}

export default {
  id: 'workspace-possibilities',
  label: 'Parcel possibilities (click a plot)',
  group: 'overlay',
  enabled: false,
  legend: '<div><b>Click any parcel</b> for its public-records buildability dossier — classification, overrides, permitted uses and market context, each with a confidence flag. Compiled dossiers exist for identified sites; other parcels show the cadastral lookup.</div>',
  create(map) {
    ensureStyles();
    const panel = buildPanel();
    const body = panel.querySelector('.pv-body');
    const parcels = data.parcels || {};

    const show = (html) => { body.innerHTML = html; body.scrollTop = 0; panel.removeAttribute('hidden'); };

    const onClick = async (e) => {
      const { lat, lng } = e.latlng;
      show('<div class="pv-loading">Resolving parcel…</div>');
      try {
        const rc = await resolveRC(lat, lng);
        if (rc && parcels[rc]) {
          show(renderDossier(rc, parcels[rc]));
        } else if (rc) {
          const sheet = SOURCES.cadastreSheet.replace('{rc}', rc);
          show(`<div class="pv-headblock"><p class="pv-eyebrow">Parcel possibilities · public records</p><h2>${rc}</h2><div class="pv-id">No dossier compiled for this parcel yet.</div></div><div class="pv-sources">Cadastral lookup only. <a href="${sheet}" target="_blank" rel="noopener">Official Catastro record ↗</a></div>`);
        } else {
          show(`<div class="pv-headblock"><h2>No parcel here</h2><div class="pv-id">Catastro returned no parcel at ${lat.toFixed(5)}, ${lng.toFixed(5)}.</div></div>`);
        }
      } catch (err) {
        show(`<div class="pv-headblock"><h2>Lookup failed</h2><div class="pv-id">${err.message}</div></div>`);
      }
    };

    const group = L.layerGroup([]);
    group.on('add', () => { map.on('click', onClick); });
    group.on('remove', () => { map.off('click', onClick); panel.setAttribute('hidden', ''); });
    return group;
  },
};
