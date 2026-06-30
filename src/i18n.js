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
        r: 'Rústico (no urbanizable)', rn: 'suelo no urbanizable', rs: 'sistemas generales' }
    : { u: 'Urbano (urban / built)', uc: 'consolidated', un: 'undeveloped',
        z: 'Urbanizable (developable)', zd: 'delimited', zn: 'non-delimited',
        r: 'Rústico (rural / non-developable)', rn: 'non-developable land', rs: 'public systems & other' };
  return `
    <div style="line-height:1.7">
      <div><b>${t.u}</b></div>
      <div>${sw(C['SUELO URBANO'])} ${t.uc} &nbsp; ${sw(C['SUELO URBANO NO CONSOLIDADO'])} ${t.un}</div>
      <div style="margin-top:3px"><b>${t.z}</b></div>
      <div>${sw(C['SUELO URBANIZABLE DELIMITADO O SECTORIZADO'])} ${t.zd} &nbsp; ${sw(C['SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO'])} ${t.zn}</div>
      <div style="margin-top:3px"><b>${t.r}</b></div>
      <div>${sw(C['SUELO NO URBANIZABLE'])} ${t.rn} &nbsp; ${sw(C['SISTEMAS GENERALES'])} ${t.rs}</div>
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
      'overlay-pp': { label: 'Purchasing power',
        legend: `${ppScale}<div class="ends"><span>lower</span><span>higher avg. income</span></div>` },
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
      'overlay-pp': { label: 'Poder adquisitivo',
        legend: `${ppScale}<div class="ends"><span>menor</span><span>mayor renta media</span></div>` },
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
