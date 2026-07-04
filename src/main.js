import L from 'leaflet';
import './styles.css';
import { MAP } from './config.js';
import { layers } from './layers/index.js';
import { buildPanel, setLegendVisible } from './ui/panel.js';
import { requireAccess } from './gate.js';
import 'leaflet-rotate';

// Fix Leaflet's default marker icon paths under bundlers.
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

// Gate the app behind the collaborator password before building the map.
requireAccess().then(initApp);

function initApp() {
const map = L.map('map', {
  center: MAP.center,
  zoom: MAP.zoom,
  minZoom: MAP.minZoom,
  maxZoom: MAP.maxZoom,
  // Map rotation + compass control (drag the compass to rotate, click to reset
  // to north). Also two-finger rotate on touch and Shift-drag on desktop.
  rotate: true,
  touchRotate: true,
  shiftKeyRotate: true,
  rotateControl: { closeOnZeroBearing: false, position: 'bottomright' },
});
if (import.meta.env?.DEV) window.__map = map; // dev-only debug handle

// Lazily instantiate each layer's Leaflet object on first activation.
const instances = new Map();
function instanceOf(layer) {
  if (!instances.has(layer.id)) instances.set(layer.id, layer.create(map));
  return instances.get(layer.id);
}

// Track which layers are on so the panel can be re-rendered (e.g. on language
// switch) without losing state.
const activeIds = new Set();
let lang = localStorage.getItem('byld.lang') || 'en';

function toggle(layer, on) {
  const lyr = instanceOf(layer);
  if (on) {
    lyr.addTo(map);
    if (layer.group === 'base' && lyr.bringToBack) lyr.bringToBack();
    activeIds.add(layer.id);
  } else {
    map.removeLayer(lyr);
    activeIds.delete(layer.id);
  }
  setLegendVisible(panelEl, layer.id, on);
}

function render() {
  buildPanel(panelEl, layers, { lang, activeIds, onToggle: toggle, onLang: setLang });
}

function setLang(next) {
  lang = next;
  localStorage.setItem('byld.lang', next);
  render();
}

const panelEl = document.getElementById('panel');
render();

// Activate everything marked enabled by default (base layer first, underneath).
layers.filter((l) => l.enabled).forEach((l) => toggle(l, true));
}
