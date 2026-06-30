import L from 'leaflet';

// Reliable "tap or click" on the map.
//
// On iOS Safari, Leaflet's `map.on('click')` only fires on a *double* tap when a
// custom tile layer is on the map (Leaflet #8236) — so a single tap on overlays
// like the land-classification raster never opens the info popup. We work around
// it by detecting the tap from raw touch events and synthesising the same
// `{ latlng }` event Leaflet would. Mouse clicks keep flowing through
// `map.on('click')`; a short cooldown drops the synthetic click the browser
// fires right after a handled tap so the handler never runs twice.
//
// Returns an unbind function (call it on layer remove).
export function onMapTap(map, handler) {
  const container = map.getContainer();
  const MOVE_TOL = 10; // px — anything beyond this is a pan, not a tap
  const TAP_MAX_MS = 700; // longer presses are long-taps / context menus
  let lastTapAt = 0;
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let moved = false;

  const onClick = (e) => {
    // Ignore the ghost click the browser emits just after a handled tap.
    if (Date.now() - lastTapAt < TAP_MAX_MS) return;
    handler(e);
  };

  const onTouchStart = (ev) => {
    if (ev.touches.length !== 1) { moved = true; return; } // multi-touch = gesture
    const t = ev.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    startAt = Date.now();
    moved = false;
  };

  const onTouchMove = (ev) => {
    const t = ev.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - startX) > MOVE_TOL || Math.abs(t.clientY - startY) > MOVE_TOL) {
      moved = true;
    }
  };

  const onTouchEnd = (ev) => {
    if (moved || ev.changedTouches.length !== 1) return;
    if (Date.now() - startAt > TAP_MAX_MS) return;
    lastTapAt = Date.now();
    const latlng = map.mouseEventToLatLng(ev.changedTouches[0]);
    handler({ latlng, originalEvent: ev });
  };

  map.on('click', onClick);
  container.addEventListener('touchstart', onTouchStart, { passive: true });
  container.addEventListener('touchmove', onTouchMove, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    map.off('click', onClick);
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
  };
}
