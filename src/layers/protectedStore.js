// Shared runtime protection registry.
//
// The Tier-1 protected-land layers (protectedLand.js) fetch legal exclusion
// geometry — ZFP/DPH, vías pecuarias, montes preservados — live over WFS.
// When one resolves polygons that intersect the parcel, it pushes them here;
// the micro-parcel engine merges this store with the static
// planning-config.json exclusions and carves the matching cells out. Toggling
// a layer on/off adds/removes its contribution and notifies the engine to
// re-lay the plan, so the masterplan reacts to real protected land live.
//
// Keyed by source id so each layer owns (and can retract) exactly its rings.

const bySource = new Map(); // sourceId -> { rings: [[lat,lng],…][], label }
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* a bad listener never blocks the others */ }
  }
}

export const protectedStore = {
  // Replace a source's contribution (empty array retracts it).
  set(sourceId, rings, label) {
    if (rings && rings.length) bySource.set(sourceId, { rings, label });
    else bySource.delete(sourceId);
    notify();
  },
  clear(sourceId) {
    if (bySource.delete(sourceId)) notify();
  },
  // All protection rings currently contributed, flattened.
  allRings() {
    return [...bySource.values()].flatMap((s) => s.rings);
  },
  sources() {
    return [...bySource.entries()].map(([id, s]) => ({ id, label: s.label, count: s.rings.length }));
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
