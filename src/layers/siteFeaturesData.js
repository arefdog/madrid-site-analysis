// Shared loader for the site-features GeoJSON (existing trees & rock outcrops).
// Vite doesn't JSON-parse the .geojson extension, so import it raw and parse
// once here; both the micro-parcel engine (avoid/anchor) and the view layer
// consume this.
import raw from '../../data/boalo-features.geojson?raw';

export const siteFeatures = JSON.parse(raw);
