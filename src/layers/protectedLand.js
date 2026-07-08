import L from 'leaflet';
import { SOURCES } from '../config.js';
import planning from '../../data/planning-config.json';
import { getBoaloRings } from './masterplan.js';
import { protectedStore } from './protectedStore.js';

// Tier-1 protected-land layers — the legal exclusions that reshape where the
// masterplan can build. Each config source becomes ONE toggleable overlay:
//
//   • VIEW: a WMS tile overlay so you see the official extent on the map.
//   • CARVE: in parallel a WFS request pulls the actual polygons intersecting
//     the parcel; any that hit push into the shared protectedStore, and the
//     micro-parcel engine re-lays the plan excluding those cells (matching the
//     legal effect — no development on ZFP / vías pecuarias / montes
//     preservados). Toggle the layer off and its carve is retracted.
//
// Sources whose WFS naming has drifted are probed against several candidate
// endpoints; if none answer we still show the WMS view and mark the carve as
// unavailable (never a silent false "clear").

function bboxOf(rings) {
  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const ring of rings) {
    for (const [lat, lng] of ring) {
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lng < lngMin) lngMin = lng;
      if (lng > lngMax) lngMax = lng;
    }
  }
  return { latMin, latMax, lngMin, lngMax };
}

// Ray-casting point-in-ring (ring = [[lat,lng],…]).
function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Do two rings intersect or contain one another? Cheap test good enough to
// decide "does this protected polygon touch the parcel": any vertex of one
// inside the other. (Edge-crossing-only overlaps are rare at this scale.)
function ringsOverlap(a, b) {
  return a.some(([lat, lng]) => pointInRing(lat, lng, b))
    || b.some(([lat, lng]) => pointInRing(lat, lng, a));
}

// GML ring parser tolerant of the three encodings WFS servers use:
// gml:posList (GML3.2), gml:coordinates (GML2), repeated gml:pos. Returns
// [[lat,lng],…] rings, best-effort axis detection (lat within ±90).
function parseWfsRings(gml) {
  const rings = [];
  const push = (nums) => {
    if (nums.length < 6) return;
    const latFirst = Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) > 90 ? true
      : Math.abs(nums[1]) <= 90 && Math.abs(nums[0]) > 90 ? false
        : Math.abs(nums[0]) <= Math.abs(nums[1]);
    const ring = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      ring.push(latFirst ? [nums[i], nums[i + 1]] : [nums[i + 1], nums[i]]);
    }
    if (ring.length >= 3) rings.push(ring);
  };
  for (const m of gml.matchAll(/<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g)) {
    push(m[1].trim().split(/\s+/).map(Number).filter((n) => !Number.isNaN(n)));
  }
  for (const m of gml.matchAll(/<gml:coordinates[^>]*>([\s\S]*?)<\/gml:coordinates>/g)) {
    const nums = m[1].trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
    push(nums);
  }
  return rings;
}

// Resolve a WFS endpoint from candidates + return typeNames it advertises.
async function wfsResolve(candidates) {
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}?service=WFS&request=GetCapabilities`);
      if (!res.ok) continue;
      const text = await res.text();
      const types = [...text.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)]
        .map((m) => m[1].trim())
        .filter((n) => n && !/^[A-Z]{3,4}$/.test(n));
      if (types.length) return { url, types: [...new Set(types)] };
    } catch { /* next candidate */ }
  }
  return null;
}

// Fetch WFS features within the parcel bbox and return rings that overlap it.
async function fetchCarveRings(cfg, parcelRings, parcelBbox) {
  const svc = await wfsResolve(cfg.wfs || []);
  if (!svc) throw new Error('no WFS candidate answered');
  const { latMin, latMax, lngMin, lngMax } = parcelBbox;
  const found = [];
  for (const typeName of svc.types.slice(0, 4)) {
    for (const [ver, bbox] of [
      ['2.0.0', `${latMin},${lngMin},${latMax},${lngMax},urn:ogc:def:crs:EPSG::4326`],
      ['1.1.0', `${lngMin},${latMin},${lngMax},${latMax},EPSG:4326`],
    ]) {
      try {
        const p = new URLSearchParams({
          service: 'WFS', version: ver, request: 'GetFeature',
          [ver.startsWith('2') ? 'typeNames' : 'typeName']: typeName,
          srsName: 'EPSG:4326', bbox, count: '200', maxFeatures: '200',
        });
        const res = await fetch(`${svc.url}?${p}`);
        if (!res.ok) continue;
        const gml = await res.text();
        const rings = parseWfsRings(gml).filter((r) => ringsOverlap(r, parcelRings[0] || r));
        if (rings.length) { found.push(...rings); break; }
      } catch { /* try next version */ }
    }
  }
  return found;
}

function makeLayer(id, cfg) {
  return {
    id: `overlay-prot-${id}`,
    label: `⚖︎ ${cfg.label}`,
    group: 'overlay',
    enabled: false,
    legend: `<div><b>${cfg.label}</b> — ${cfg.law}. Se muestra el ámbito oficial (WMS) y, si el WFS responde, los polígonos que tocan la parcela se ${cfg.carve ? '<b>recortan del plan</b> (el motor de píxeles los excluye)' : 'marcan (sin recorte automático — solo aviso)'}. Contrastar con la ficha municipal.</div>`,
    create() {
      const group = L.layerGroup();
      const badge = L.control({ position: 'topright' });
      // Two independent states so the badge never says "WMS activa" when the
      // WMS view actually failed too.
      const state = { view: '…', carve: '…' };
      badge.onAdd = () => {
        const el = L.DomUtil.create('div', 'prot-badge');
        el.style.cssText = `background:${cfg.color};color:#fff;padding:3px 8px;border-radius:6px;font:11px/1.4 system-ui;box-shadow:0 1px 4px rgba(0,0,0,.35);max-width:250px`;
        badge.refresh = () => {
          el.innerHTML = `<b>${cfg.label}</b><br>vista: ${state.view} · ${cfg.carve ? 'recorte' : 'aviso'}: ${state.carve}`;
        };
        badge.refresh();
        return el;
      };
      const setView = (t) => { state.view = t; if (badge.refresh) badge.refresh(); };
      const setCarve = (t) => { state.carve = t; if (badge.refresh) badge.refresh(); };
      const attachBadge = () => { if (group._map) badge.addTo(group._map); };
      group.on('add', attachBadge);
      group.on('remove', () => {
        badge.remove();
        // Retract this source's carve when the layer is switched off.
        if (cfg.carve) protectedStore.clear(id);
      });

      // 1. WMS view overlay (image tiles — no CORS constraint).
      (async () => {
        for (const url of cfg.wms || []) {
          try {
            const res = await fetch(`${url}?service=WMS&request=GetCapabilities`);
            if (!res.ok) continue;
            const text = await res.text();
            const names = [...new Set([...text.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1].trim()))]
              .filter((n) => n && !/^WMS/i.test(n));
            if (!names.length) continue;
            group.addLayer(L.tileLayer.wms(url, {
              layers: names.slice(0, 6).join(','),
              format: 'image/png', transparent: true, version: '1.1.1',
              opacity: 0.45, attribution: cfg.attribution,
            }));
            setView('✅ activa');
            return;
          } catch { /* next wms candidate */ }
        }
        setView('❌ no disponible');
      })();

      // 2. Carve. Priority order:
      //    a) baked polygons in planning-config (server-side, reliable) — the
      //       engine already carves these; the layer just reports it.
      //    b) live WFS (best-effort; often CORS-blocked from the browser).
      (async () => {
        try {
          const parcelRings = await getBoaloRings();
          if (!parcelRings.length) throw new Error('sin parcela');
          const bbox = bboxOf(parcelRings);

          // (a) Baked polygons tagged with this source id in planning-config.
          const baked = (planning.exclusions?.protectionPolygons ?? [])
            .filter((p) => p && p.source === id && Array.isArray(p.ring));
          if (baked.length) {
            const rings = baked.map((p) => p.ring);
            drawAndCarve(rings, ' (config)');
            return;
          }

          // (b) Live WFS.
          const rings = await fetchCarveRings(cfg, parcelRings, bbox);
          if (!rings.length) {
            setCarve('✳️ sin afección');
            if (cfg.carve) protectedStore.clear(id);
            return;
          }
          drawAndCarve(rings, ' (WFS en vivo)');
        } catch (e) {
          setCarve('❌ WFS no disponible — usa `npm run data:constraints -- --apply`');
          console.warn(`[protectedLand:${id}]`, e.message);
        }
      })();

      function drawAndCarve(rings, srcNote) {
        for (const ring of rings) {
          group.addLayer(L.polygon(ring, {
            color: cfg.color, weight: 2, fillColor: cfg.color, fillOpacity: 0.3,
            dashArray: cfg.carve ? null : '4 3',
          }).bindPopup(`<b>${cfg.label}</b><br>${cfg.law}${cfg.carve ? '<br><b>Recortado del plan.</b>' : '<br>Marcado (sin recorte automático).'}`));
        }
        if (cfg.carve) {
          protectedStore.set(id, rings, cfg.label);
          setCarve(`⚠️ ${rings.length} polígono(s) — recortado${srcNote}`);
        } else {
          setCarve(`⚠️ ${rings.length} polígono(s) — marcado${srcNote}`);
        }
      }

      return group;
    },
  };
}

export default Object.entries(SOURCES.protectedLand).map(([id, cfg]) => makeLayer(id, cfg));
