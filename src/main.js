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
const isTouchDevice = () => (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0));
const touch = isTouchDevice();
const map = L.map('map', {
  center: MAP.center,
  zoom: MAP.zoom,
  minZoom: MAP.minZoom,
  maxZoom: MAP.maxZoom,
  // Map rotation. On desktop: Shift-drag to rotate + a draggable compass
  // (bottom-right). On touch: rotation starts OFF (north-locked) so two-finger
  // gestures only pan/zoom; the compass button (bottom-right) toggles two-finger
  // rotation on/off. See the custom control below.
  rotate: true,
  touchRotate: !touch, // desktop on (no touch anyway); mobile starts locked
  shiftKeyRotate: true,
  rotateControl: touch ? false : { closeOnZeroBearing: false, position: 'bottomright' },
});
window.__map = map; // debug/automation handle

// Touch devices: a simple on/off compass bottom-right. Tap to enable two-finger
// rotation (arrow shows bearing), tap again to disable and snap back to north.
// Overrides leaflet-rotate's 3-state cycle so there's no device-orientation mode.
if (touch) {
  const RotateToggle = L.Control.Rotate.extend({
    _cycleState() {
      const m = this._map;
      if (!m) return;
      if (m.touchRotate.enabled()) {
        m.touchRotate.disable();
        m.setBearing(0);
      } else {
        m.touchRotate.enable();
      }
      this._restyle();
    },
  });
  new RotateToggle({ closeOnZeroBearing: false, position: 'bottomright' }).addTo(map);
}

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

// Activate default layers first so the panel reflects their state, then render
// (otherwise default-on layers show on the map but read as unchecked).
layers.filter((l) => l.enabled).forEach((l) => toggle(l, true));
render();
}
