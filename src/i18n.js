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
        legend: '<div><b>Program-driven terrain layout</b> (Spanish urbanización pattern): every allocation is sized from the <b>BYLD program brief v0.4</b> (44-key hotel, spa &amp; restaurant, 27 residences, VPP, equestrian) and the card reconciles <b>target → achieved</b>. The main road enters from Calle Berrocal (E) and <b>follows the contours</b>; residential streets branch downhill from both legs with <b>typed villa lots</b> — <b>Echo</b> (3×2 cells) on the upper streets, <b>Duo</b> (3×3) mid-slope, <b>Grand</b> (5×3) at the street ends — and allocation <b>stops at the 27-unit program</b>; the rest stays dehesa. The <b>hotel is a linear building</b> (blue) along the upper contour with the <b>spa &amp; restaurant cluster</b> (teal) at the road bend; <b>VPP</b> (pink) sits compact at the entry near the town; <b>equestrian</b> (gold) takes the flattest meadow. ~1000 cells × ~70.5 m² cover <b>100% of the site</b>, each clipped to the cadastral boundary — cells stay combinable, so lots can merge or split. <b>Buildability 0–100</b> per development cell — bright fill = optimal. Parking sits in a basement under the hotel+spa core; brown dashed = surface visitor pocket for the Ley 9/2001 remainder. Hatched pale-green = <b>25 m perimeter buffer</b> (fire strip + road setback, no development). The <b>cuadro de superficies</b> card (bottom-left) shows areas, edificability, the <b>program reconciliation</b> and live checks (green ≥15 m²/100 m², VPP ≥40%, parking, <b>open land ≥75%</b>) with <b>GeoJSON / DXF (ETRS89-UTM30) / CSV exports</b>. <b>Click any cell</b> for program, lot type, terrain facts and score. NEW: <b>phase buttons</b> (Todo/P1/P2/P3) on the card ghost everything outside a phase; the road is <b>colored by longitudinal grade</b> (amber &gt;6%, red &gt;10%) with grade checks and viario stats; and <b>Editar programa</b> lets you change keys, unit counts and m² and recalculate the whole plan live.</div>' },
      'overlay-rustico-engine': { label: 'Rustico masterplan (SNU engine)',
        legend: '<div><b>The Sector 1B pixel engine run on the 11 surrounding rustico parcels — under the SNU rulebook</b>. Sector 1B is urbanizable (edificability 0.25 m²/m², Plan Parcial, VPP, cessions); these parcels are <b>suelo no urbanizable común</b>, so the binding regime is the <b>calificación urbanística</b> (Ley 9/2001 art. 29, mod. Ley 7/2024): <b>occupation ≤10%</b> of each parcel by roofed buildings (not an edificability ratio), <b>≤4.5 m to eaves</b>, <b>≥60% open land</b>, <b>no subdivision, no streets, no villa lots, no VPP</b> — every building serves ONE registered agro-equestrian exploitation, with a single accessory dwelling. Cells (~16 m) are clipped to the real Catastro geometry and terrain-scored; solid cells = roofed buildings (stables, covered arena, 30-key hotel rural, bodega, dwelling) placed on the flattest compliant window off the 5 m lindero setback; brown dashed = <b>surface works</b> (open pistas, parking) that do NOT consume the 10%; pale tint = the open land of the exploitation. The card (bottom-left) reconciles roofed m² vs the 10% cap per parcel and runs the SNU checks. <b>Click any cell</b> for its building, terrain facts and rules.</div>' },
      'overlay-site-features': { label: '🌳 Site features (trees / rock)',
        legend: '<div><b>Existing trees &amp; rock outcrops</b> read from aerial imagery (visual estimate — to be replaced by LiDAR CHM + PNOA-ortho fusion and the field tree inventory). <b>Green</b> = trees to keep, <b>grey</b> = granite outcrop (no excavation), <b>blue</b> = vaguada / possible watercourse. The pixel plan now <b>routes around these</b> and gives villas a <b>siting premium</b> next to them (Echo on the granite shoulder, Duo along the oak line).</div>' },
      'overlay-constraints': { label: 'Constraint check (live)',
        legend: '<div><b>Live verification of the Boalo working assumptions</b> against the official services, queried from your browser: <b>SIU land classification</b> at a grid of sample points across the parcel (dots in the land-class colors — this is the fact that gates the whole program), <b>ENP/PRCAM</b> protected-area boundaries (MITECO), <b>Red Natura 2000</b>, <b>vías pecuarias</b> (CM IDEM) and the <b>hydrographic network</b> (DPH setbacks). The card (bottom-right) shows a per-source verdict: ⚠️ = protection detected, ✳️ = no hit at the sampled points, ❌ = service unreachable. <b>Informe JSON</b> downloads the findings; when the SIU returns protected/SNU polygons, <b>protectionPolygons</b> downloads them pre-formatted for <code>planning-config.json</code> — the pixel engine excludes every cell inside them on the next build. Always contrast with the municipal NNSS ficha.</div>' },
      'overlay-cm-zoning': { label: 'Protected-area zoning (CM · PORN/PRUG)',
        legend: '<div><b>Internal PORN/PRUG zonification of the Comunidad de Madrid\'s protected areas</b> — Cuenca Alta del Manzanares, Sureste, Curso Medio del Guadarrama and P.N. Sierra de Guadarrama. Each area uses its own zoning scheme, so every zone is mapped to a common <b>protection tier</b> (green = reserve/no-build → blue = left to municipal planning) and colored by tier. <b>Click</b> a polygon for the park and its exact official zone. There is no harmonized national equivalent — internal zoning is published region by region. Source: CM IDEM. Contrast with the PORN/PRUG in force.</div>' },
      'overlay-prot-zfp': { label: '⚖︎ Flood flow zone / DPH',
        legend: '<div><b>Zona de flujo preferente + cauce/DPH</b> (SNCZI). <b>RDPH art. 9bis/9ter</b>: no new building in the ZFP; 5 m servidumbre + 100 m policía de aguas. Shows the official extent (WMS); any polygon that touches the parcel (WFS) is <b>carved out of the masterplan</b> — toggle it and the pixel plan re-lays around it. Toggle off to retract.</div>' },
      'overlay-prot-viasPecuarias': { label: '⚖︎ Drove roads (vías pecuarias)',
        legend: '<div><b>Vías pecuarias</b> (CM). <b>Ley 3/1995</b>: public domain with legal width (cañada 75 m … vereda 20 m) — <b>unbuildable</b>. Any corridor crossing the parcel is <b>carved out of the masterplan</b>.</div>' },
      'overlay-prot-montesPreservados': { label: '⚖︎ Preserved woodland',
        legend: '<div><b>Montes preservados</b> (CM). <b>Ley 16/1995 Forestal</b> protects, by name, holm-oak and <b>dehesa</b> masses in its annex — clearing/building restricted. Likely the binding constraint on the Boalo dehesa: what it carves is protected forest the plan must keep open, <b>required by law, not chosen</b>.</div>' },
      'overlay-prot-hic': { label: '⚖︎ Priority habitat 6310 (dehesa)',
        legend: '<div><b>Hábitat de Interés Comunitario 6310</b> «Dehesas perennifolias de Quercus» (MITECO). <b>Directive 92/43</b> priority habitat — triggers environmental assessment. Shown and <b>flagged</b> (dashed) where it overlaps; not auto-carved, since HIC constrains via evaluation rather than an outright no-build.</div>' },
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
        legend: '<div><b>Trazado según el terreno, guiado por el programa</b> (patrón de urbanización española): cada asignación se dimensiona desde el <b>programa BYLD v0.4</b> (hotel de 44 llaves, spa y restaurante, 27 residencias, VPP, ecuestre) y la tarjeta concilia <b>objetivo → logrado</b>. El vial principal entra desde la Calle Berrocal (E) y <b>sigue las curvas de nivel</b>; las calles residenciales se ramifican cuesta abajo desde ambos tramos con <b>parcelas tipificadas</b> — <b>Echo</b> (3×2 celdas) en las calles altas, <b>Duo</b> (3×3) a media ladera, <b>Grand</b> (5×3) en los extremos — y la asignación <b>se detiene al completar las 27 unidades</b>; el resto queda como dehesa. El <b>hotel es un edificio lineal</b> (azul) sobre la cota alta con el <b>grupo spa y restaurante</b> (verde azulado) en el codo del vial; la <b>VPP</b> (rosa) se agrupa compacta junto al acceso y al pueblo; el <b>ecuestre</b> (dorado) ocupa el prado más llano. ~1000 celdas × ~70.5 m² cubren el <b>100% de la finca</b>, recortadas al límite catastral — las celdas se combinan o dividen libremente. <b>Edificabilidad 0–100</b> por celda — relleno brillante = óptimo. El aparcamiento va en sótano bajo el núcleo hotel+spa; marrón punteado = bolsa de visitantes en superficie para el resto exigido por la Ley 9/2001. Verde claro rayado = <b>franja perimetral de 25 m</b> (autoprotección de incendios + retranqueo a viario, sin edificación). La tarjeta <b>cuadro de superficies</b> (abajo-izquierda) muestra superficies, edificabilidad, la <b>conciliación del programa</b> y comprobaciones en vivo (verde ≥15 m²/100 m², VPP ≥40%, aparcamiento, <b>suelo abierto ≥75%</b>) con <b>exportación GeoJSON / DXF (ETRS89-UTM30) / CSV</b>. <b>Haz clic en cualquier celda</b> para ver programa, tipo de parcela, datos de terreno y puntuación. NUEVO: los <b>botones de fase</b> (Todo/P1/P2/P3) atenúan todo lo que queda fuera de la fase; el vial se <b>colorea por pendiente longitudinal</b> (ámbar &gt;6%, rojo &gt;10%) con comprobaciones y estadísticas de viario; y <b>Editar programa</b> permite cambiar llaves, unidades y m² y recalcular el plan en vivo.</div>' },
      'overlay-rustico-engine': { label: 'Plan rústico (motor SNU)',
        legend: '<div><b>El motor de píxeles del Sector 1B aplicado a las 11 parcelas rústicas del entorno — con el reglamento SNU</b>. El Sector 1B es urbanizable (edificabilidad 0,25 m²/m², Plan Parcial, VPP, cesiones); estas parcelas son <b>suelo no urbanizable común</b>, así que el régimen aplicable es la <b>calificación urbanística</b> (Ley 9/2001 art. 29, mod. Ley 7/2024): <b>ocupación ≤10%</b> de cada parcela por edificación techada (no un coeficiente de edificabilidad), <b>≤4,5 m a alero</b>, <b>≥60% de suelo abierto</b>, <b>sin parcelación, sin viario, sin lotes de villa, sin VPP</b> — cada edificio sirve a UNA explotación agro-ecuestre registrada, con una única vivienda accesoria. Las celdas (~16 m) se recortan a la geometría catastral real y se puntúan por terreno; celdas sólidas = edificios techados (cuadras, pista cubierta, hotel rural de 30 llaves, bodega, vivienda) situados en la ventana más llana y conforme, fuera del retranqueo de 5 m al lindero; marrón punteado = <b>obras de superficie</b> (pistas descubiertas, aparcamiento) que NO consumen el 10%; tinte pálido = el suelo abierto de la explotación. La tarjeta (abajo-izquierda) concilia m² techados frente al tope del 10% por parcela y ejecuta las comprobaciones SNU. <b>Haz clic en cualquier celda</b> para ver su edificio, datos de terreno y reglas.</div>' },
      'overlay-site-features': { label: '🌳 Elementos del sitio (árboles / roca)',
        legend: '<div><b>Árboles y roca existentes</b> leídos de imagen aérea (estimación visual — sustituir por fusión LiDAR CHM + orto PNOA e inventario de arbolado). <b>Verde</b> = arbolado a conservar, <b>gris</b> = afloramiento granítico (sin excavación), <b>azul</b> = vaguada/posible cauce. El plan ahora <b>los evita</b> y da <b>prima de emplazamiento</b> a las villas junto a ellos (Echo en el hombro granítico, Duo en la línea de encinas).</div>' },
      'overlay-constraints': { label: 'Comprobación urbanística (en vivo)',
        legend: '<div><b>Verificación en vivo de las hipótesis de El Boalo</b> contra los servicios oficiales, consultados desde tu navegador: <b>clasificación del suelo SIU</b> en una malla de puntos de la parcela (puntos con los colores de clase — el dato que condiciona todo el programa), límites de <b>ENP/PRCAM</b> (MITECO), <b>Red Natura 2000</b>, <b>vías pecuarias</b> (IDEM CM) y la <b>red hidrográfica</b> (retranqueos DPH). La tarjeta (abajo-derecha) muestra el veredicto por fuente: ⚠️ = protección detectada, ✳️ = sin afección en los puntos consultados, ❌ = servicio no disponible. <b>Informe JSON</b> descarga los resultados; si el SIU devuelve polígonos protegidos/SNU, <b>protectionPolygons</b> los descarga listos para <code>planning-config.json</code> — el motor de píxeles excluye cada celda dentro de ellos en la siguiente ejecución. Contrastar siempre con la ficha de las NNSS municipales.</div>' },
      'overlay-cm-zoning': { label: 'Zonificación de espacios protegidos (CM · PORN/PRUG)',
        legend: '<div><b>Zonificación interna PORN/PRUG de los espacios protegidos de la Comunidad de Madrid</b> — Cuenca Alta del Manzanares, Sureste, Curso Medio del Guadarrama y P.N. Sierra de Guadarrama. Cada espacio usa su propio esquema, así que cada zona se traduce a una <b>intensidad de protección</b> común (verde = reserva, sin edificar → azul = a ordenar por el planeamiento municipal) y se colorea por ese nivel. <b>Haz clic</b> en un polígono para ver el parque y su zona oficial exacta. No existe un equivalente nacional armonizado — la zonificación interna se publica región por región. Fuente: IDEM CM. Contrastar con el PORN/PRUG vigente.</div>' },
      'overlay-prot-zfp': { label: '⚖︎ Zona de flujo preferente / DPH',
        legend: '<div><b>Zona de flujo preferente + cauce/DPH</b> (SNCZI). <b>RDPH art. 9bis/9ter</b>: prohibida nueva edificación en la ZFP; servidumbre 5 m + policía 100 m. Muestra el ámbito oficial (WMS) y, si el WFS responde, todo polígono que toca la parcela se <b>recorta del plan</b> — al activarlo el plan de píxeles se re-traza excluyéndolo. Desactívalo para retirarlo.</div>' },
      'overlay-prot-viasPecuarias': { label: '⚖︎ Vías pecuarias',
        legend: '<div><b>Vías pecuarias</b> (CM). <b>Ley 3/1995</b>: dominio público con anchura legal (cañada 75 m … vereda 20 m) — <b>no edificable</b>. Todo corredor que cruce la parcela se <b>recorta del plan</b>.</div>' },
      'overlay-prot-montesPreservados': { label: '⚖︎ Montes preservados',
        legend: '<div><b>Montes preservados</b> (CM). La <b>Ley 16/1995 Forestal</b> protege, por su nombre, las masas de encina y <b>dehesa</b> de su anexo — tala/edificación restringidas. Probablemente la restricción que de verdad ata la dehesa de El Boalo: lo que recorta es monte protegido que el plan debe mantener abierto, <b>por ley, no por elección</b>.</div>' },
      'overlay-prot-hic': { label: '⚖︎ Hábitat prioritario 6310 (dehesa)',
        legend: '<div><b>Hábitat de Interés Comunitario 6310</b> «Dehesas perennifolias de Quercus» (MITECO). Hábitat prioritario de la <b>Directiva 92/43</b> — desencadena evaluación ambiental. Se muestra y se <b>marca</b> (discontinuo) donde solapa; no se recorta automáticamente, porque el HIC condiciona vía evaluación más que por prohibición directa.</div>' },
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
