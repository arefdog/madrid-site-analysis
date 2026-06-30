import { GROUPS } from '../layers/index.js';
import { getStrings } from '../i18n.js';

// Builds the control panel from the layer registry + i18n strings.
// ctx = { lang, activeIds:Set<string>, onToggle(layer,on), onLang(nextLang) }
// Base-group layers behave as radios (mutually exclusive).

export function buildPanel(el, layers, ctx) {
  const s = getStrings(ctx.lang);
  el.innerHTML = `
    <div class="phead">
      <div>
        <h1>${s.title}</h1>
        <div class="sub">${s.subtitle}</div>
      </div>
      <button class="lang" type="button" title="Language">${ctx.lang === 'en' ? 'ES' : 'EN'}</button>
    </div>
    ${GROUPS.map((g) => groupHtml(g, layers, s, ctx.activeIds)).join('')}
    <div class="note">${s.note}</div>`;

  el.querySelector('.lang').addEventListener('click', () => ctx.onLang(ctx.lang === 'en' ? 'es' : 'en'));

  el.querySelectorAll('input[data-layer]').forEach((input) => {
    input.addEventListener('change', () => {
      const layer = layers.find((l) => l.id === input.dataset.layer);
      if (input.type === 'radio') {
        layers.filter((l) => l.group === 'base').forEach((l) => ctx.onToggle(l, l.id === layer.id));
      } else {
        ctx.onToggle(layer, input.checked);
      }
    });
  });
}

function groupHtml(group, layers, s, activeIds) {
  const items = layers.filter((l) => l.group === group.id);
  if (!items.length) return '';
  return `
    <div class="group">
      <h2>${s.groups[group.id] || group.id}</h2>
      ${items.map((l) => rowHtml(group, l, s, activeIds)).join('')}
    </div>`;
}

function rowHtml(group, layer, s, activeIds) {
  const str = s.layers[layer.id] || {};
  const label = str.label || layer.label;
  const on = activeIds.has(layer.id);
  const type = group.id === 'base' ? 'radio' : 'checkbox';
  const name = group.id === 'base' ? 'name="base"' : '';
  const legend = str.legend
    ? `<div class="legend" data-legend="${layer.id}" ${on ? '' : 'hidden'}>${str.legend}</div>`
    : '';
  return `
    <label class="row">
      <input type="${type}" ${name} data-layer="${layer.id}" ${on ? 'checked' : ''}> ${label}
    </label>
    ${legend}`;
}

export function setLegendVisible(el, layerId, visible) {
  const legend = el.querySelector(`[data-legend="${layerId}"]`);
  if (legend) legend.hidden = !visible;
}
