import L from 'leaflet';
import 'leaflet-draw';

// Workspace layer: user-drawn candidate plots. Adds Leaflet.draw controls and
// persists drawn shapes to localStorage so work survives a reload.
const STORAGE_KEY = 'byld.candidatePlots';

export default {
  id: 'workspace-plots',
  label: 'My candidate plots',
  group: 'workspace',
  enabled: true,
  create(map) {
    const drawn = new L.FeatureGroup();

    // Restore previously saved plots.
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) L.geoJSON(saved).eachLayer((l) => drawn.addLayer(l));
    } catch { /* ignore corrupt storage */ }

    const save = () => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(drawn.toGeoJSON())); } catch { /* quota */ }
    };

    const control = new L.Control.Draw({
      edit: { featureGroup: drawn },
      draw: { circle: false, circlemarker: false, polyline: false },
    });

    map.on(L.Draw.Event.CREATED, (e) => {
      e.layer.bindPopup('Candidate plot — click to edit notes.');
      drawn.addLayer(e.layer);
      save();
    });
    map.on(L.Draw.Event.EDITED, save);
    map.on(L.Draw.Event.DELETED, save);

    // Show draw controls only while the workspace layer is on the map.
    let added = false;
    drawn.on('add', () => { if (!added) { map.addControl(control); added = true; } });
    drawn.on('remove', () => { if (added) { map.removeControl(control); added = false; } });

    return drawn;
  },
};
