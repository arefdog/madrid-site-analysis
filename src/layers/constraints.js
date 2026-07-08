import L from 'leaflet';
import { SOURCES } from '../config.js';
import { CLASS_COLORS } from './landClass.js';
import { getBoaloRings } from './masterplan.js';
import { download } from './exports.js';

// Constraint verification — the layer that settles the working assumptions.
//
// Everything else in this app models what COULD be built; this layer asks the
// authoritative services what is actually ALLOWED, live from the browser:
//
//   1. SIU (Min. Vivienda) `identify` at a grid of sample points across the
//      parcel → the formal land classification (urbano / urbanizable / SNU),
//      the single fact that gates the whole Boalo program. Sample dots are
//      drawn in the SIU class colors; any SNU/protected polygons returned by
//      the service are captured for export.
//   2. Espacios Naturales Protegidos (MITECO WMS) → is the parcel inside the
//      PRCAM (Parque Regional Cuenca Alta del Manzanares)? Boundary tiles are
//      overlaid and the space name is read with GetFeatureInfo.
//   3. Red Natura 2000 (MITECO WMS) → ZEC/ZEPA overlap, same mechanism.
//   4. Vías pecuarias (Comunidad de Madrid IDEM WMS) → droving-road corridors
//      with legal width that cannot be built on.
//   5. Red hidrográfica (MITECO WMS) → arroyos at/near the parcel (DPH: 5 m
//      servidumbre + 100 m policía de aguas).
//
// Results land in a verdict card with per-source status. Findings download as
// JSON, and captured protection polygons download pre-formatted for
// `planning-config.json → exclusions.protectionPolygons`, which the
// micro-parcel engine carves around (point-in-polygon).
//
// Layer names are never hardcoded for the WMS sources: each service's
// GetCapabilities is parsed and whatever layers it advertises are used, so
// server-side renames degrade to a "sin capa" status instead of breaking.

const STATUS = { pending: '…', ok: '✅', hit: '⚠️', none: '✳️', error: '❌' };

function esc(v) {
  return String(v).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

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

// Interior sample points: centroid-ish grid clipped to the parcel.
function samplePoints(rings, n = 4) {
  const b = bboxOf(rings);
  const pts = [];
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      const lat = b.latMin + ((b.latMax - b.latMin) * i) / (n + 1);
      const lng = b.lngMin + ((b.lngMax - b.lngMin) * j) / (n + 1);
      if (rings.some((ring) => pointInRing(lat, lng, ring))) pts.push([lat, lng]);
    }
  }
  return pts;
}

// --- SIU identify (same API the land-class click uses). ----------------------

async function siuIdentify(lat, lng) {
  const s = SOURCES.arcgis.landClass;
  const d = 0.0009;
  const params = new URLSearchParams({
    f: 'json',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'top:0',
    tolerance: '3',
    mapExtent: [lng - d, lat - d, lng + d, lat + d].join(','),
    imageDisplay: '256,256,96',
    returnGeometry: 'true',
  });
  const res = await fetch(`${s.url}/identify?${params.toString()}`);
  if (!res.ok) throw new Error(`SIU ${res.status}`);
  const data = await res.json();
  const result = data?.results?.[0];
  if (!result?.attributes) return null;
  const direct = result.attributes[s.classField];
  const raw = direct != null
    ? direct
    : Object.values(result.attributes).find((v) => CLASS_COLORS[String(v).toUpperCase()]);
  return {
    cls: raw != null ? String(raw).toUpperCase() : null,
    attrs: result.attributes,
    geometry: result.geometry, // esri polygon {rings: [[x,y],…]} in EPSG:4326
  };
}

// --- Generic WMS helpers (capabilities-driven). -------------------------------

async function wmsResolve(candidates) {
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}?service=WMS&request=GetCapabilities`);
      if (!res.ok) continue;
      const text = await res.text();
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      // Every named layer the service advertises (skip the root container).
      const names = [...doc.querySelectorAll('Layer > Name')]
        .map((n) => n.textContent.trim())
        .filter(Boolean);
      const queryable = [...doc.querySelectorAll('Layer[queryable="1"] > Name')]
        .map((n) => n.textContent.trim())
        .filter(Boolean);
      if (names.length) return { url, layers: [...new Set(names)], queryable: [...new Set(queryable.length ? queryable : names)] };
    } catch { /* next candidate */ }
  }
  return null;
}

// GetFeatureInfo at a point (WMS 1.1.1 — sane axis order). Tries JSON, falls
// back to plain text; returns a short list of "name-ish" strings.
async function wmsFeatureInfo(svc, lat, lng, radiusDeg = 0.002) {
  const bbox = [lng - radiusDeg, lat - radiusDeg, lng + radiusDeg, lat + radiusDeg].join(',');
  const layers = svc.queryable.slice(0, 6).join(',');
  const base = new URLSearchParams({
    service: 'WMS', version: '1.1.1', request: 'GetFeatureInfo',
    layers, query_layers: layers, styles: '',
    srs: 'EPSG:4326', bbox, width: '101', height: '101', x: '50', y: '50',
    feature_count: '10', format: 'image/png',
  });
  for (const infoFormat of ['application/json', 'text/plain']) {
    try {
      base.set('info_format', infoFormat);
      const res = await fetch(`${svc.url}?${base.toString()}`);
      if (!res.ok) continue;
      const text = await res.text();
      if (infoFormat === 'application/json') {
        const data = JSON.parse(text);
        const names = (data.features || []).map((f) => {
          const p = f.properties || {};
          return p.NOMBRE || p.nombre || p.SITE_NAME || p.NOM_ENP || p.name
            || Object.values(p).find((v) => typeof v === 'string' && v.length > 3);
        }).filter(Boolean);
        return [...new Set(names)];
      }
      // text/plain: pull "field = value" lines that look like names.
      const names = [...text.matchAll(/(?:NOMBRE|SITE_?NAME|NOM\w*|DENOMINA\w*)\s*[:=]\s*'?([^'\n;]+)/gi)]
        .map((m) => m[1].trim()).filter((v) => v && v.length > 3);
      if (names.length) return [...new Set(names)];
      // Non-empty structured text with no recognizable field still means a hit.
      if (/=/.test(text) && text.trim().length > 20) return ['(objeto sin nombre — ver informe)'];
      return [];
    } catch { /* try next format */ }
  }
  throw new Error('GetFeatureInfo failed');
}

// --- The layer. ----------------------------------------------------------------

export default {
  id: 'overlay-constraints',
  label: 'Constraint check (live)',
  group: 'overlay',
  enabled: false,
  create() {
    const group = L.layerGroup();
    const report = {
      generated: new Date().toISOString(),
      parcel: null,
      sources: {},
      protectionPolygons: [],
    };
    const rows = new Map(); // source id -> {label, status, detail}
    let control = null;

    const setRow = (id, label, status, detail) => {
      rows.set(id, { label, status, detail });
      if (control?.refresh) control.refresh();
    };

    // Verdict card (bottom-right, next to nothing else).
    control = L.control({ position: 'bottomright' });
    control.onAdd = () => {
      const el = L.DomUtil.create('div', 'constraints-card');
      el.style.cssText = 'background:rgba(17,24,39,.94);color:#e5e7eb;padding:10px 12px;border-radius:8px;font:11px/1.5 system-ui;max-width:300px;box-shadow:0 2px 10px rgba(0,0,0,.4)';
      control.refresh = () => {
        const body = [...rows.values()].map((r) =>
          `<div style="margin:2px 0">${STATUS[r.status]} <b>${esc(r.label)}</b>${r.detail ? `<br><span style="color:#9ca3af;margin-left:18px">${r.detail}</span>` : ''}</div>`).join('');
        el.innerHTML =
          '<b>Comprobación urbanística — consulta en vivo</b>' +
          `<div style="color:#9ca3af;margin-bottom:4px">Parcela ${esc(report.parcel ?? '…')} · fuentes oficiales, ${new Date().toLocaleDateString('es-ES')}</div>` +
          body +
          '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
          '<button data-x="report">Informe JSON</button>' +
          (report.protectionPolygons.length
            ? `<button data-x="polys">protectionPolygons (${report.protectionPolygons.length})</button>` : '') +
          '</div>' +
          '<div style="color:#9ca3af;margin-top:4px">⚠️ = protección detectada · ✳️ = sin afección en los puntos consultados · ❌ = servicio no disponible. Contrastar siempre con la ficha NNSS municipal.</div>';
      };
      control.refresh();
      L.DomEvent.disableClickPropagation(el);
      el.addEventListener('click', (ev) => {
        const kind = ev.target?.dataset?.x;
        if (kind === 'report') {
          download('boalo-constraints.json', 'application/json', JSON.stringify(report, null, 2));
        }
        if (kind === 'polys') {
          download('boalo-protection-polygons.json', 'application/json', JSON.stringify({
            _instructions: 'Paste into data/planning-config.json → exclusions.protectionPolygons. Each entry is a [lat,lng] ring; the micro-parcel engine excludes every cell inside them.',
            protectionPolygons: report.protectionPolygons,
          }, null, 2));
        }
      });
      return el;
    };
    const attach = () => { if (group._map) control.addTo(group._map); };
    group.on('add', attach);
    group.on('remove', () => control.remove());

    (async () => {
      const rings = await getBoaloRings();
      if (!rings.length) {
        setRow('parcel', 'Parcela', 'error', 'Sin geometría (Catastro no disponible)');
        return;
      }
      report.parcel = '1683501VL2018S (El Boalo)';
      const b = bboxOf(rings);
      const centroid = [(b.latMin + b.latMax) / 2, (b.lngMin + b.lngMax) / 2];
      const pts = samplePoints(rings);
      attach();

      // 1. SIU classification at every sample point.
      setRow('siu', 'SIU — clasificación del suelo', 'pending');
      (async () => {
        try {
          const results = await Promise.all(pts.map(async ([lat, lng]) => {
            try { return { lat, lng, hit: await siuIdentify(lat, lng) }; } catch { return { lat, lng, hit: undefined }; }
          }));
          const classCount = {};
          let failures = 0;
          for (const { lat, lng, hit } of results) {
            if (hit === undefined) { failures++; continue; }
            const cls = hit?.cls ?? 'SIN DATO';
            classCount[cls] = (classCount[cls] || 0) + 1;
            const rgb = CLASS_COLORS[cls];
            group.addLayer(L.circleMarker([lat, lng], {
              radius: 6, weight: 2, color: '#111',
              fillColor: rgb ? `rgb(${rgb})` : '#999', fillOpacity: 0.95,
            }).bindPopup(`<b>SIU:</b> ${esc(cls)}<br>${esc(JSON.stringify(hit?.attrs ?? {}).slice(0, 300))}`));
            // Capture protected/SNU polygons for the engine.
            if (hit?.geometry?.rings && /NO URBANIZABLE|PROTE/i.test(cls)) {
              for (const ring of hit.geometry.rings) {
                const latlng = ring.map(([x, y]) => [y, x]);
                if (!report.protectionPolygons.some((p) => p.length === latlng.length && p[0][0] === latlng[0][0])) {
                  report.protectionPolygons.push(latlng);
                }
              }
            }
          }
          report.sources.siu = { classCount, samples: results.length, failures };
          if (failures === results.length) throw new Error('all failed');
          const summary = Object.entries(classCount)
            .sort((p, q) => q[1] - p[1])
            .map(([cls, n]) => `${esc(cls)} (${n}/${pts.length})`).join(' · ');
          const protectedHit = Object.keys(classCount).some((cls) => /NO URBANIZABLE|PROTE/i.test(cls));
          setRow('siu', 'SIU — clasificación del suelo', protectedHit ? 'hit' : 'ok', summary);
        } catch {
          report.sources.siu = { error: 'unreachable' };
          setRow('siu', 'SIU — clasificación del suelo', 'error', 'Servicio no disponible desde este navegador');
        }
      })();

      // 2-4. WMS overlays + point queries: ENP (PRCAM), Red Natura, vías pecuarias.
      const wmsSources = [
        { id: 'enp', label: 'ENP — PRCAM / parques', cfg: SOURCES.constraints.enp, opacity: 0.45 },
        { id: 'natura', label: 'Red Natura 2000 (ZEC/ZEPA)', cfg: SOURCES.constraints.redNatura, opacity: 0.35 },
        { id: 'vp', label: 'Vías pecuarias (CM)', cfg: SOURCES.constraints.viasPecuarias, opacity: 0.6 },
      ];
      for (const src of wmsSources) {
        setRow(src.id, src.label, 'pending');
        (async () => {
          try {
            const svc = await wmsResolve(src.cfg.candidates);
            if (!svc) throw new Error('no candidate answered');
            group.addLayer(L.tileLayer.wms(svc.url, {
              layers: svc.layers.slice(0, 6).join(','),
              format: 'image/png', transparent: true, version: '1.1.1',
              opacity: src.opacity, attribution: src.cfg.attribution,
            }));
            const names = await wmsFeatureInfo(svc, centroid[0], centroid[1]);
            report.sources[src.id] = { url: svc.url, layers: svc.layers, hits: names };
            setRow(src.id, src.label, names.length ? 'hit' : 'none',
              names.length ? names.map(esc).join(' · ') : 'Sin afección en el centroide');
          } catch (e) {
            report.sources[src.id] = { error: String(e.message || e) };
            setRow(src.id, src.label, 'error', 'Servicio no disponible desde este navegador');
          }
        })();
      }

      // 5. Arroyos: hydrographic network within ~200 m of the parcel centre
      // and edge midpoints (DPH: 5 m servidumbre + 100 m policía de aguas).
      setRow('hydro', 'Red hidrográfica (DPH)', 'pending');
      (async () => {
        try {
          const svc = {
            url: SOURCES.wms.hydroNetwork.url,
            queryable: [SOURCES.wms.hydroNetwork.layers],
          };
          const probes = [centroid,
            [b.latMin, centroid[1]], [b.latMax, centroid[1]],
            [centroid[0], b.lngMin], [centroid[0], b.lngMax]];
          const all = [];
          let okProbes = 0;
          for (const [lat, lng] of probes) {
            try {
              all.push(...await wmsFeatureInfo(svc, lat, lng, 0.002));
              okProbes++;
            } catch { /* keep probing */ }
          }
          // Zero successful probes = the service is down, NOT "no streams" —
          // a false negative here would hide a DPH constraint.
          if (!okProbes) throw new Error('unreachable');
          const names = [...new Set(all)];
          report.sources.hydro = { hits: names };
          setRow('hydro', 'Red hidrográfica (DPH)', names.length ? 'hit' : 'none',
            names.length
              ? `${names.map(esc).join(' · ')} — DPH: 5 m servidumbre / 100 m policía`
              : 'Ningún cauce en los puntos consultados (±200 m)');
        } catch {
          report.sources.hydro = { error: 'unreachable' };
          setRow('hydro', 'Red hidrográfica (DPH)', 'error', 'Servicio no disponible desde este navegador');
        }
      })();
    })();

    return group;
  },
};
