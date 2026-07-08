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
    // Official hydrography of the river-basin plans (Planes Hidrológicos
    // 2022-2027) — the exact cartography the water authorities (Confederación
    // Hidrográfica del Tajo / MITECO) plan against. Two services: the stream
    // network (every río/arroyo) and surface water-body polygons (reservoirs,
    // lakes). Note: despite the INSPIRE-style layer name, RedHidro2027 serves
    // the red hidrográfica line network.
    hydroNetwork: {
      url: 'https://wms.mapama.gob.es/sig/Agua/PHC/RedHidro2027',
      layers: 'HY.PhysicalWaters.Waterbodies',
      attribution: 'MITECO — Red hidrográfica, Planes Hidrológicos 2022-2027',
    },
    hydroWaterBodies: {
      url: 'https://wms.mapama.gob.es/sig/agua/PHC/MasasAguaSupP2027',
      layers: 'AM.WaterBodyForWFD',
      attribution: 'MITECO — Masas de agua superficial, PH 2022-2027',
    },
    // SNCZI flood zones (MITECO): modelled fluvial flood extents for 100- and
    // 500-year return periods. This is the official dataset behind
    // "zona inundable" constraints on a plot.
    floodZones: {
      url: 'https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones',
      layers: 'NZ.Flood.FluvialT500,NZ.Flood.FluvialT100',
      attribution: 'MITECO — SNCZI zonas inundables',
    },
  },
  // Constraint-verification services (live queries from the browser). Layer
  // names are NOT hardcoded — the constraints layer reads each service's
  // GetCapabilities and uses whatever layers it advertises, so exact layer
  // naming drift on the server side degrades gracefully. Each source lists
  // candidate endpoints; the first one whose capabilities parse wins.
  constraints: {
    // Espacios Naturales Protegidos (incl. Parque Regional Cuenca Alta del
    // Manzanares — the PRCAM overlay that likely covers the Boalo parcel).
    enp: {
      candidates: [
        'https://wms.mapama.gob.es/sig/Biodiversidad/ENP/wms.aspx',
      ],
      attribution: 'MITECO — Espacios Naturales Protegidos',
    },
    // Red Natura 2000 (ZEC/LIC + ZEPA) — the EU-level protection overlay.
    redNatura: {
      candidates: [
        'https://wms.mapama.gob.es/sig/Biodiversidad/RedNatura/wms.aspx',
        'https://wms.mapama.gob.es/sig/Biodiversidad/RedNaturaLIC/wms.aspx',
        'https://wms.mapama.gob.es/sig/Biodiversidad/RedNaturaZEPA/wms.aspx',
      ],
      attribution: 'MITECO — Red Natura 2000',
    },
    // Vías pecuarias (Comunidad de Madrid, IDEM/PLANEA) — endpoint naming on
    // idem.madrid.org shifts between publications, hence several candidates.
    viasPecuarias: {
      candidates: [
        'https://idem.madrid.org/geosgis/services/medio_ambiente/WMS_VIAS_PECUARIAS/MapServer/WmsServer',
        'https://idem.madrid.org/geosgis/services/planea/WMS_VIAS_PECUARIAS/MapServer/WmsServer',
        'https://idem.madrid.org/geosgis/services/medioambiente/VIAS_PECUARIAS/MapServer/WMSServer',
      ],
      attribution: 'Comunidad de Madrid — Vías Pecuarias (IDEM)',
    },
  },
  // Tier-1 protected-land layers: viewable WMS overlays AND queryable WFS so
  // the geometry can be carved out of the buildable footprint. Each source
  // lists candidate WMS + WFS endpoints (naming drifts across publications);
  // the layer probes GetCapabilities and uses whatever answers. `carve: true`
  // means polygons that intersect the parcel feed the pixel engine's
  // exclusion set (no development), matching the legal effect.
  protectedLand: {
    zfp: {
      label: 'Zona de flujo preferente / DPH',
      carve: true,
      color: '#0ea5e9',
      law: 'RDPH art. 9bis/9ter — prohibición de nueva edificación en ZFP; servidumbre 5 m + policía 100 m',
      // SNCZI publishes via the IDEE INSPIRE risk service (same host the flood
      // layer already uses successfully) and MITECO's own SIG.
      wms: ['https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones',
        'https://wms.mapama.gob.es/sig/Agua/ZonasInundables/wms.aspx'],
      wfs: ['https://servicios.idee.es/wfs-inspire/riesgos-naturales/inundaciones',
        'https://wfs.mapama.gob.es/sig/Agua/ZonasInundables/wfs.aspx'],
      attribution: 'MITECO / IDEE — SNCZI Zona de Flujo Preferente / DPH',
    },
    viasPecuarias: {
      label: 'Vías pecuarias',
      carve: true,
      color: '#16a34a',
      law: 'Ley 3/1995 — dominio público, anchura legal (cañada 75 m … vereda 20 m); no edificable',
      // MITECO national service (confirmed) + CM IDEM (host moved to
      // idem.comunidad.madrid/geoidem/<Service>/{wms|ows}).
      wms: ['https://wms.mapama.gob.es/sig/Biodiversidad/ViasPecuarias/wms.aspx',
        'https://idem.comunidad.madrid/geoidem/ViasPecuarias/wms',
        'https://idem.comunidad.madrid/geoidem/MedioAmbiente/wms'],
      wfs: ['https://wfs.mapama.gob.es/sig/Biodiversidad/ViasPecuarias/wfs.aspx',
        'https://idem.comunidad.madrid/geoidem/ViasPecuarias/ows',
        'https://idem.comunidad.madrid/geoidem/MedioAmbiente/ows'],
      attribution: 'MITECO / CM IDEM — Vías Pecuarias',
    },
    montesPreservados: {
      label: 'Montes preservados',
      carve: true,
      color: '#4d7c0f',
      law: 'Ley 16/1995 Forestal CM — masas de encina/dehesa del anexo; tala/edificación restringidas',
      wms: ['https://idem.comunidad.madrid/geoidem/Montes/wms',
        'https://idem.comunidad.madrid/geoidem/MedioAmbiente/wms',
        'https://idem.comunidad.madrid/geoidem/Zonas/wms'],
      wfs: ['https://idem.comunidad.madrid/geoidem/Montes/ows',
        'https://idem.comunidad.madrid/geoidem/MedioAmbiente/ows',
        'https://idem.comunidad.madrid/geoidem/Zonas/ows'],
      attribution: 'Comunidad de Madrid IDEM — Montes Preservados (Ley 16/1995)',
    },
    hic: {
      label: 'Hábitat 6310 (dehesa)',
      carve: false,
      color: '#ca8a04',
      law: 'Directiva 92/43 — hábitat prioritario; desencadena evaluación ambiental',
      wms: ['https://wms.mapama.gob.es/sig/Biodiversidad/HIC/wms.aspx',
        'https://wms.mapama.gob.es/sig/Biodiversidad/TiposHabitat/wms.aspx'],
      wfs: ['https://wfs.mapama.gob.es/sig/Biodiversidad/HIC/wfs.aspx'],
      attribution: 'MITECO — Tipos de Hábitat de Interés Comunitario',
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
  // Catastro INSPIRE WFS: exact parcel polygon (GML) for a cadastral reference.
  // Same host as cadastreByCoord, CORS-enabled.
  cadastreParcelWfs:
    'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature&STOREDQUERIE_ID=GetParcel&srsname=EPSG::4326&refcat={rc}',
  // Municipality boundaries are vendored in /data/madrid-municipios.geojson and
  // imported directly by the purchasing-power layer (no external runtime fetch).
};
