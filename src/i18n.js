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
      'base-light': { label: 'Street' },
      'base-topo': { label: 'Topography' },
      'base-sat': { label: 'Satellite' },
      'overlay-sites': { label: 'BYLD Sites',
        legend: '<div>Listings/parcels we have pinned down. <b>Click the pin or a parcel</b> for planning facts and the listing link. Outlines are official Catastro parcel geometry (INSPIRE).</div>' },
      'overlay-masterplan': { label: 'Volumes',
        legend: '<div>BYLD program zones carved from the <b>official Catastro parcel geometry</b>: residential (orange), hotel/spa (blue), affordable housing (pink), equestrian (gold), green/dehesa (pale green). <b>Click a zone</b> for area, program, phasing gates and code references. Colmenarejo: villa lots = real parcels. Boalo: phased resort (Phase 1 residential, Phase 2 conditional hotel).</div>' },
      'overlay-microparcels': { label: 'Masterplans',
        legend: '<div><b>Program-driven terrain layout</b> (Spanish urbanización pattern): every allocation is sized from the <b>BYLD program brief v0.4</b> (44-key hotel, spa &amp; restaurant, 27 residences, VPP, equestrian) and the card reconciles <b>target → achieved</b>. The main road enters from Calle Berrocal (E) and <b>follows the contours</b>; residential streets branch downhill from both legs with <b>typed villa lots</b> — <b>Echo</b> (3×2 cells) on the upper streets, <b>Duo</b> (3×3) mid-slope, <b>Grand</b> (5×3) at the street ends — and allocation <b>stops at the 27-unit program</b>; the rest stays dehesa. The <b>hotel is a linear building</b> (blue) along the upper contour with the <b>spa &amp; restaurant cluster</b> (teal) at the road bend; <b>VPP</b> (pink) sits compact at the entry near the town; <b>equestrian</b> (gold) takes the flattest meadow. ~1000 cells × ~70.5 m² cover <b>100% of the site</b>, each clipped to the cadastral boundary — cells stay combinable, so lots can merge or split. <b>Buildability 0–100</b> per development cell — bright fill = optimal. Parking sits in a basement under the hotel+spa core; brown dashed = surface visitor pocket for the Ley 9/2001 remainder. Hatched pale-green = <b>25 m perimeter buffer</b> (fire strip + road setback, no development). The <b>cuadro de superficies</b> card (bottom-left) shows areas, edificability, the <b>program reconciliation</b> and live checks (green ≥15 m²/100 m², VPP ≥30%, parking, <b>open land ≥75%</b>) with <b>GeoJSON / DXF (ETRS89-UTM30) / CSV exports</b>. <b>Click any cell</b> for program, lot type, terrain facts and score.</div>' },
      'overlay-score': { label: 'BYLD Score',
        legend: '<div>Composite 0–100 per municipality — pale → dark green = stronger. Weighted for a <b>luxury wellness retreat + villas</b> thesis (wealth, nature, reachable seclusion). <b>Click</b> for the factor breakdown.</div>' },
      'overlay-pp': { label: 'Purchasing power',
        legend: `${ppScale}<div class="ends"><span>lower</span><span>higher avg. income</span></div>` },
      'overlay-airbnb': { label: 'Short-term rental info',
        legend: '<div>Est. annual revenue per listing — light → dark = higher. <b>Click</b> a barrio for price, occupancy &amp; listings. Madrid city only; estimates.</div>' },
      'overlay-hotels': { label: 'Hotel info',
        legend: '<div>Hotels per municipality (OSM) — pale → red = more. Proxy for tourism/business demand. <b>Click</b> for count &amp; star breakdown.</div>' },
      'overlay-transit': { label: 'Public transport' },
      'overlay-topo': { label: 'Topography',
        legend: '<div>Shaded relief. <b>Click the map</b> to read ground elevation (m).</div>' },
      'overlay-cadastre': { label: 'Cadastral parcels',
        legend: '<div>Plot &amp; building boundaries. <b>Click a parcel</b> for its cadastral reference, address and official record. Best at street zoom.</div>' },
      'overlay-landclass': { label: 'Land classification',
        legend: landClassLegend('en') },
      'overlay-landcover': { label: 'Land use',
        legend: '<div>Red = built/urban · yellow = agricultural · green = forest/natural. Greenfield vs. developed land.</div>' },
      'overlay-water': { label: 'Water Bodies',
        legend: '<div>Rivers, streams (arroyos) and reservoirs from the official river-basin plans (MITECO / Confederación Hidrográfica — the cartography the water authorities plan with). Streams shown here carry legal protection setbacks even if dry on site.</div>' },
      'overlay-flood': { label: 'Flood Zones',
        legend: '<div>Official MITECO flood mapping: modelled extents for 100- and 500-year floods. Overlap with a parcel usually means build restrictions — check before committing to a site.</div>' },
    },
  },
  es: {
    title: 'Análisis de Suelo — Madrid',
    subtitle: 'BYLD · cribado de parcelas y zonas',
    note: 'Haz clic en una parcela o municipio para ver sus datos. Nuevos datos se añaden en <code>src/layers/</code>.',
    groups: { base: 'Mapa base', overlay: 'Capas' },
    layers: {
      'base-light': { label: 'Callejero' },
      'base-topo': { label: 'Topografía' },
      'base-sat': { label: 'Satélite' },
      'overlay-sites': { label: 'Sitios BYLD',
        legend: '<div>Anuncios/parcelas ya localizados. <b>Haz clic en el pin o una parcela</b> para ver los datos urbanísticos y el enlace al anuncio. Contornos con geometría catastral oficial (INSPIRE).</div>' },
      'overlay-masterplan': { label: 'Volúmenes',
        legend: '<div>Zonas de programa BYLD recortadas sobre la <b>geometría catastral oficial</b>: residencial (naranja), hotel/spa (azul), vivienda protegida (rosa), ecuestre (dorado), verde/dehesa (verde pálido). <b>Haz clic en una zona</b> para ver área, programa, fases y referencias normativas. Colmenarejo: lotes de villa = parcelas reales. Boalo: resort escalonado (Fase 1 residencial, Fase 2 hotel condicional).</div>' },
      'overlay-microparcels': { label: 'Planes maestros',
        legend: '<div><b>Trazado según el terreno, guiado por el programa</b> (patrón de urbanización española): cada asignación se dimensiona desde el <b>programa BYLD v0.4</b> (hotel de 44 llaves, spa y restaurante, 27 residencias, VPP, ecuestre) y la tarjeta concilia <b>objetivo → logrado</b>. El vial principal entra desde la Calle Berrocal (E) y <b>sigue las curvas de nivel</b>; las calles residenciales se ramifican cuesta abajo desde ambos tramos con <b>parcelas tipificadas</b> — <b>Echo</b> (3×2 celdas) en las calles altas, <b>Duo</b> (3×3) a media ladera, <b>Grand</b> (5×3) en los extremos — y la asignación <b>se detiene al completar las 27 unidades</b>; el resto queda como dehesa. El <b>hotel es un edificio lineal</b> (azul) sobre la cota alta con el <b>grupo spa y restaurante</b> (verde azulado) en el codo del vial; la <b>VPP</b> (rosa) se agrupa compacta junto al acceso y al pueblo; el <b>ecuestre</b> (dorado) ocupa el prado más llano. ~1000 celdas × ~70.5 m² cubren el <b>100% de la finca</b>, recortadas al límite catastral — las celdas se combinan o dividen libremente. <b>Edificabilidad 0–100</b> por celda — relleno brillante = óptimo. El aparcamiento va en sótano bajo el núcleo hotel+spa; marrón punteado = bolsa de visitantes en superficie para el resto exigido por la Ley 9/2001. Verde claro rayado = <b>franja perimetral de 25 m</b> (autoprotección de incendios + retranqueo a viario, sin edificación). La tarjeta <b>cuadro de superficies</b> (abajo-izquierda) muestra superficies, edificabilidad, la <b>conciliación del programa</b> y comprobaciones en vivo (verde ≥15 m²/100 m², VPP ≥30%, aparcamiento, <b>suelo abierto ≥75%</b>) con <b>exportación GeoJSON / DXF (ETRS89-UTM30) / CSV</b>. <b>Haz clic en cualquier celda</b> para ver programa, tipo de parcela, datos de terreno y puntuación.</div>' },
      'overlay-score': { label: 'Índice BYLD',
        legend: '<div>Índice compuesto 0–100 por municipio — claro → verde oscuro = mayor. Ponderado para una tesis de <b>retiro wellness de lujo + villas</b> (riqueza, naturaleza, aislamiento accesible). <b>Haz clic</b> para el desglose.</div>' },
      'overlay-pp': { label: 'Poder adquisitivo',
        legend: `${ppScale}<div class="ends"><span>menor</span><span>mayor renta media</span></div>` },
      'overlay-airbnb': { label: 'Alquiler turístico',
        legend: '<div>Ingresos anuales estimados por anuncio — claro → oscuro = mayor. <b>Haz clic</b> en un barrio para precio, ocupación y anuncios. Solo Madrid capital; estimaciones.</div>' },
      'overlay-hotels': { label: 'Hoteles',
        legend: '<div>Hoteles por municipio (OSM) — claro → rojo = más. Indicador de demanda turística/de negocio. <b>Haz clic</b> para ver número y categorías.</div>' },
      'overlay-transit': { label: 'Transporte público' },
      'overlay-topo': { label: 'Topografía',
        legend: '<div>Relieve sombreado. <b>Haz clic en el mapa</b> para ver la altitud (m).</div>' },
      'overlay-cadastre': { label: 'Parcelas catastrales',
        legend: '<div>Límites de parcelas y edificios. <b>Haz clic en una parcela</b> para ver su referencia catastral, dirección y ficha oficial. Mejor con zoom de calle.</div>' },
      'overlay-landclass': { label: 'Clasificación del suelo',
        legend: landClassLegend('es') },
      'overlay-landcover': { label: 'Usos del suelo',
        legend: '<div>Rojo = urbano/construido · amarillo = agrícola · verde = bosque/natural. Suelo virgen vs. desarrollado.</div>' },
      'overlay-water': { label: 'Masas de Agua',
        legend: '<div>Ríos, arroyos y embalses de los planes hidrológicos oficiales (MITECO / Confederación Hidrográfica — la cartografía con la que planifican los organismos de cuenca). Los cauces aquí señalados tienen zonas de protección legales aunque estén secos.</div>' },
      'overlay-flood': { label: 'Zonas Inundables',
        legend: '<div>Cartografía oficial de inundabilidad del MITECO: láminas para periodos de retorno de 100 y 500 años. Si solapa una parcela, suele implicar restricciones de edificación.</div>' },
    },
  },
};

export function getStrings(lang) {
  return STRINGS[lang] || STRINGS.en;
}
