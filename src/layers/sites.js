import L from 'leaflet';

// Identified sites — listings/parcels we have pinned down, with their planning
// facts. Coordinates are approximate where the source (listing screenshots,
// planning sheets) doesn't give exact geometry.

const SITES = [
  {
    id: 'colmenarejo-ue18',
    name: 'U.E. 18 «Colonia de Santiago» — Colmenarejo',
    // Access corner: Camino de la Fuente Elvira × Calle del Pisuerga.
    marker: [40.5587, -4.0076],
    // Approximate footprint (±100 m): strip running SSW from C. del Pisuerga
    // to the Galapagar municipal boundary, per NNSS Colmenarejo plan P.3a.
    footprint: [
      [40.5591, -4.0082],
      [40.5589, -4.0067],
      [40.5574, -4.0062],
      [40.554, -4.005],
      [40.5538, -4.0058],
      [40.5573, -4.007],
    ],
    popup: `
      <b>U.E. 18 «Colonia de Santiago» — Colmenarejo</b><br>
      <a href="https://www.idealista.com/inmueble/111936104/" target="_blank" rel="noopener">idealista listing 111936104 ↗</a>
      <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
      <b>27,122 m²</b> gross · execution unit in <b>suelo urbano</b> (NNSS Colmenarejo 1996)<br>
      Max <b>18 homes</b> · 7 homes/ha · low-density single-family (Zona 03 gr. 3º)<br>
      Cessions: road network + 3,948 m² green space (Zona 07 gr. 1º)<br>
      Development: Estudio de Detalle + urbanisation project · <i>compensación</i>, private initiative<br>
      Parcels: 12 urban plots 1,002–1,554 m² + rústico 28061A02200075<br>
      <hr style="margin:6px 0;border:0;border-top:1px solid #ccc">
      <span style="color:#555">Map readout: Colmenarejo scores <b>86/100</b> (nature 87 · access 98 ·
      exclusivity 100 · income 34) · ~830 m elevation · ~29 km from Madrid.<br>
      Location approximate — SE edge of town against the Galapagar boundary dehesa.</span>`,
  },
];

export default {
  id: 'overlay-sites',
  label: 'Identified sites',
  group: 'overlay',
  enabled: true,
  create() {
    const group = L.layerGroup();
    for (const s of SITES) {
      const poly = L.polygon(s.footprint, {
        color: '#d97706', weight: 2, dashArray: '6 4', fillColor: '#f59e0b', fillOpacity: 0.15,
      }).bindPopup(s.popup, { maxWidth: 340 });
      const pin = L.marker(s.marker, { title: s.name }).bindPopup(s.popup, { maxWidth: 340 });
      group.addLayer(poly);
      group.addLayer(pin);
    }
    return group;
  },
};
