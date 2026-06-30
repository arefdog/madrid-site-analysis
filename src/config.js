// Global app configuration. Tweak map defaults and external data sources here
// so individual layer modules stay focused on rendering.

export const MAP = {
  center: [40.45, -3.7], // Comunidad de Madrid, roughly centred
  zoom: 9,
  minZoom: 7,
  maxZoom: 19,
};

// External data sources. Tile URLs and GeoJSON endpoints live here so they can
// be swapped (e.g. self-hosted, API-keyed, or local /data files) in one place.
export const SOURCES = {
  tiles: {
    light: {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: '© OpenStreetMap, © CARTO',
      maxZoom: 20,
    },
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '© OpenTopoMap (CC-BY-SA)',
      maxZoom: 17,
    },
    satellite: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri World Imagery',
      maxZoom: 19,
    },
    transit: {
      url: 'https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png',
      attribution: 'OpenRailwayMap (CC-BY-SA)',
      maxZoom: 19,
    },
    hillshade: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Esri — Hillshade (USGS, NASA, NGA)',
      maxZoom: 16,
    },
  },
  // Point-elevation API for click-to-query (EU-DEM 25m covers all of Spain).
  // Free, rate-limited to ~1 req/s — fine for interactive clicks.
  elevation: 'https://api.opentopodata.org/v1/eudem25m?locations={lat},{lng}',
  // WMS services (raster overlays drawn server-side).
  wms: {
    cadastre: {
      url: 'https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx',
      layers: 'Catastro',
      attribution: 'Dirección General del Catastro (España)',
    },
    landcover: {
      url: 'https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WMSServer',
      layers: '12', // CLC 2018 raster
      attribution: 'Copernicus CORINE Land Cover 2018 (EEA)',
    },
  },
  // ArcGIS dynamic MapServers rendered via REST export tiles.
  arcgis: {
    landClass: {
      url: 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/CLASES_DE_SUELO/MapServer',
      layers: 'show:0',
      // Layer 0 exposes the planning class in this field — used by click-to-query.
      classField: 'ClaseSuelo',
      attribution: 'SIU — Min. de Vivienda y Agenda Urbana (clasificación del suelo)',
    },
  },
  // Catastro reverse-geocode: lat/lng -> cadastral reference + address.
  // Returns XML, CORS-enabled. {x}=lng, {y}=lat in EPSG:4326.
  cadastreByCoord:
    'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X={x}&Coordenada_Y={y}',
  // Public web sheet for a parcel (developers open this for the official record).
  cadastreSheet: 'https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat={rc}',
  // Municipality boundaries are vendored in /data/madrid-municipios.geojson and
  // imported directly by the purchasing-power layer (no external runtime fetch).
};
