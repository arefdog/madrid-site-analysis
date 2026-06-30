import L from 'leaflet';

// Renders an ArcGIS dynamic MapServer as Leaflet tiles via the REST `export`
// endpoint. Used for services whose WMS is disabled but whose REST export works
// (e.g. SIU clasificación del suelo). Tiles load as <img>, so no CORS needed.
//
//   serviceUrl: '.../MapServer'
//   options.layers: ArcGIS layer spec, e.g. 'show:0'
const ExportTileLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const size = this.getTileSize();
    const nw = coords.scaleBy(size);
    const se = nw.add(size);
    const min = L.CRS.EPSG3857.project(this._map.unproject(nw, coords.z));
    const max = L.CRS.EPSG3857.project(this._map.unproject(se, coords.z));
    const params = new URLSearchParams({
      bbox: [min.x, max.y, max.x, min.y].join(','),
      bboxSR: '3857',
      imageSR: '3857',
      size: `${size.x},${size.y}`,
      format: 'png32',
      transparent: 'true',
      dpi: '96',
      f: 'image',
    });
    // dynamicLayers lets us override the server's symbology; otherwise show the
    // default layer. Kept compact — this host caps query strings at ~2 KB.
    if (this.options.dynamicLayers) {
      params.set('dynamicLayers', JSON.stringify(this.options.dynamicLayers));
    } else {
      params.set('layers', this.options.arcgisLayers);
    }
    return `${this.options.serviceUrl}/export?${params.toString()}`;
  },
});

export function arcgisExportLayer(serviceUrl, options = {}) {
  return new ExportTileLayer('', {
    serviceUrl,
    arcgisLayers: options.layers || 'show:0',
    dynamicLayers: options.dynamicLayers || null,
    opacity: options.opacity ?? 0.6,
    attribution: options.attribution,
    tileSize: 256,
  });
}
