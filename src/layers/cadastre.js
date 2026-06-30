import L from 'leaflet';
import { SOURCES } from '../config.js';

// Cadastral parcels (Catastro WMS) + click-to-inspect site info.
// Clicking a point resolves its cadastral reference, address and a link to the
// official Catastro sheet — the starting point for any plot due-diligence.

function parseCadastre(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const text = (tag) => doc.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  const err = text('des');
  if (err) return { error: err };
  const pc1 = text('pc1');
  const pc2 = text('pc2');
  return { rc: pc1 + pc2, address: text('ldt') };
}

async function siteInfo(lat, lng) {
  const url = SOURCES.cadastreByCoord.replace('{x}', lng.toFixed(7)).replace('{y}', lat.toFixed(7));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Catastro ${res.status}`);
  return parseCadastre(await res.text());
}

function popupHtml(info, lat, lng) {
  if (info.error) {
    return `No cadastral parcel here<br><span style="color:#888">${info.error}</span>`;
  }
  const sheet = SOURCES.cadastreSheet.replace('{rc}', info.rc);
  return `
    <b>Cadastral reference</b><br>
    <code>${info.rc}</code><br>
    ${info.address ? `<div style="margin-top:4px">${info.address}</div>` : ''}
    <div style="margin-top:6px">
      <a href="${sheet}" target="_blank" rel="noopener">Official Catastro record ↗</a>
    </div>
    <span style="color:#888">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>`;
}

export default {
  id: 'overlay-cadastre',
  label: 'Cadastral parcels (zoning / plots)',
  group: 'overlay',
  enabled: false,
  legend: `<div>Plot &amp; building boundaries. <b>Click a parcel</b> for its cadastral reference, address and official record. Best at street zoom.</div>`,
  create(map) {
    const w = SOURCES.wms.cadastre;
    const wms = L.tileLayer.wms(w.url, {
      layers: w.layers,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: w.attribution,
      opacity: 0.8,
    });
    const group = L.layerGroup([wms]);

    const onClick = async (e) => {
      const { lat, lng } = e.latlng;
      const popup = L.popup({ maxWidth: 260 })
        .setLatLng(e.latlng)
        .setContent('Looking up parcel…')
        .openOn(map);
      try {
        popup.setContent(popupHtml(await siteInfo(lat, lng), lat, lng));
      } catch (err) {
        popup.setContent(`Lookup failed<br><span style="color:#888">${err.message}</span>`);
      }
    };

    group.on('add', () => map.on('click', onClick));
    group.on('remove', () => { map.off('click', onClick); map.closePopup(); });
    return group;
  },
};
