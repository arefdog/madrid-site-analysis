import { CLASS_COLORS } from './layers/landClass.js';

// All user-facing text, in English and Spanish. The panel renders from here,
// keyed by layer id, with an EN/ES toggle. Adding a layer? Add its label (and
// optional legend) under `layers` in both languages.

const sw = (rgb) =>
  `<span style="display:inline-block;width:11px;height:11px;border-radius:2px;background:rgb(${rgb});border:1px solid rgba(255,255,255,.35);vertical-align:-1px"></span>`;

const C = CLASS_COLORS;

// Income choropleth scale (shared between languages).
const ppScale = `
  <div class="scale">
    <span style="background:#fde0dd"></span><span style="background:#fbb4b9"></span>
    <span style="background:#fa9fb5"></span><span style="background:#dd3497"></span><span style="background:#7a0177"></span>
  </div>`;

function landClassLegend(lang) {
  const t = lang === 'es'
    ? { u: 'Urbano', uc: 'consolidado', un: 'no consolidado',
        z: 'Urbanizable', zd: 'delimitado', zn: 'no delimitado',
        r: 'Rústico (no urbanizable)', rn: 'suelo no urbanizable', rs: 'sistemas generales',
        click: '<b>Haz clic</b> en el mapa para ver la clase de suelo en ese punto.' }
    : { u: 'Urbano (urban / built)', uc: 'consolidated', un: 'undeveloped',
        z: 'Urbanizable (developable)', zd: 'delimited', zn: 'non-delimited',
        r: 'Rústico (rural / non-developable)', rn: 'non-developable land', rs: 'public systems & other',
        click: '<b>Click the map</b> to read the land class at that point.' };
  return `
    <div style="line-height:1.7">
      <div><b>${t.u}</b></div>
      <div>${sw(C['SUELO URBANO'])} ${t.uc} &nbsp; ${sw(C['SUELO URBANO NO CONSOLIDADO'])} ${t.un}</div>
      <div style="margin-top:3px"><b>${t.z}</b></div>
      <div>${sw(C['SUELO URBANIZABLE DELIMITADO O SECTORIZADO'])} ${t.zd} &nbsp; ${sw(C['SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO'])} ${t.zn}</div>
      <div style="margin-top:3px"><b>${t.r}</b></div>
      <div>${sw(C['SUELO NO URBANIZABLE'])} ${t.rn} &nbsp; ${sw(C['SISTEMAS GENERALES'])} ${t.rs}</div>
      <div style="margin-top:5px;color:#555">${t.click}</div>
    </div>`;
}

export const STRINGS = {
  en: {
    title: 'Madrid Site Analysis',
    subtitle: 'BYLD · plot & area screening',
    note: 'Click a parcel or municipality for its data. New datasets plug into <code>src/layers/</code>.',
    groups: { base: 'Base map', overlay: 'Overlays' },
    layers: {
      'base-light': { label: 'Street (light)' },
      'base-topo': { label: 'Topography / terrain' },
      'base-sat': { label: 'Satellite' },
      'overlay-sites': { label: 'Identified sites',
        legend: '<div>Listings/parcels we have pinned down. <b>Click the pin or outline</b> for planning facts and the listing link. Outlines are approximate.</div>' },
      'overlay-score': { label: 'Attractiveness score (wellness villas)',
        legend: '<div>Composite 0–100 per municipality — pale → dark green = stronger. Weighted for a <b>luxury wellness retreat + villas</b> thesis (wealth, nature, reachable seclusion). <b>Click</b> for the factor breakdown.</div>' },
      'overlay-pp': { label: 'Purchasing power',
        legend: `${ppScale}<div class="ends"><span>lower</span><span>higher avg. income</span></div>` },
      'overlay-airbnb': { label: 'Short-term rental (Airbnb)',
        legend: '<div>Est. annual revenue per listing — light → dark = higher. <b>Click</b> a barrio for price, occupancy &amp; listings. Madrid city only; estimates.</div>' },
      'overlay-hotels': { label: 'Hotel concentration',
        legend: '<div>Hotels per municipality (OSM) — pale → red = more. Proxy for tourism/business demand. <b>Click</b> for count &amp; star breakdown.</div>' },
      'overlay-transit': { label: 'Public transport (rail / metro)' },
      'overlay-topo': { label: 'Topography (hillshade + elevation)',
        legend: '<div>Shaded relief. <b>Click the map</b> to read ground elevation (m).</div>' },
      'overlay-cadastre': { label: 'Cadastral parcels (plots)',
        legend: '<div>Plot &amp; building boundaries. <b>Click a parcel</b> for its cadastral reference, address and official record. Best at street zoom.</div>' },
      'overlay-landclass': { label: 'Land classification (urbano / urbanizable / rústico)',
        legend: landClassLegend('en') },
      'overlay-landcover': { label: 'Land use / land cover (CORINE)',
        legend: '<div>Red = built/urban · yellow = agricultural · green = forest/natural. Greenfield vs. developed land.</div>' },
    },
  },
  es: {
    title: 'Análisis de Suelo — Madrid',
    subtitle: 'BYLD · cribado de parcelas y zonas',
    note: 'Haz clic en una parcela o municipio para ver sus datos. Nuevos datos se añaden en <code>src/layers/</code>.',
    groups: { base: 'Mapa base', overlay: 'Capas' },
    layers: {
      'base-light': { label: 'Callejero (claro)' },
      'base-topo': { label: 'Topografía / relieve' },
      'base-sat': { label: 'Satélite' },
      'overlay-sites': { label: 'Sitios identificados',
        legend: '<div>Anuncios/parcelas ya localizados. <b>Haz clic en el pin o el contorno</b> para ver los datos urbanísticos y el enlace al anuncio. Contornos aproximados.</div>' },
      'overlay-score': { label: 'Índice de atractivo (villas wellness)',
        legend: '<div>Índice compuesto 0–100 por municipio — claro → verde oscuro = mayor. Ponderado para una tesis de <b>retiro wellness de lujo + villas</b> (riqueza, naturaleza, aislamiento accesible). <b>Haz clic</b> para el desglose.</div>' },
      'overlay-pp': { label: 'Poder adquisitivo',
        legend: `${ppScale}<div class="ends"><span>menor</span><span>mayor renta media</span></div>` },
      'overlay-airbnb': { label: 'Alquiler turístico (Airbnb)',
        legend: '<div>Ingresos anuales estimados por anuncio — claro → oscuro = mayor. <b>Haz clic</b> en un barrio para precio, ocupación y anuncios. Solo Madrid capital; estimaciones.</div>' },
      'overlay-hotels': { label: 'Concentración de hoteles',
        legend: '<div>Hoteles por municipio (OSM) — claro → rojo = más. Indicador de demanda turística/de negocio. <b>Haz clic</b> para ver número y categorías.</div>' },
      'overlay-transit': { label: 'Transporte público (tren / metro)' },
      'overlay-topo': { label: 'Topografía (relieve + altitud)',
        legend: '<div>Relieve sombreado. <b>Haz clic en el mapa</b> para ver la altitud (m).</div>' },
      'overlay-cadastre': { label: 'Parcelas catastrales',
        legend: '<div>Límites de parcelas y edificios. <b>Haz clic en una parcela</b> para ver su referencia catastral, dirección y ficha oficial. Mejor con zoom de calle.</div>' },
      'overlay-landclass': { label: 'Clasificación del suelo (urbano / urbanizable / rústico)',
        legend: landClassLegend('es') },
      'overlay-landcover': { label: 'Usos del suelo / cobertura (CORINE)',
        legend: '<div>Rojo = urbano/construido · amarillo = agrícola · verde = bosque/natural. Suelo virgen vs. desarrollado.</div>' },
    },
  },
};

export function getStrings(lang) {
  return STRINGS[lang] || STRINGS.en;
}
