import type { GeoPoint, Vec2 } from "./types";

/**
 * Local tangent-plane projection used by the whole scene (1 unit = 1 metre).
 * Origin = the warehouse; x = east, z = south. Accurate to well under a metre
 * across the ~25 km operating area, which is plenty for a visualization.
 *
 * Keep ORIGIN in sync with scripts/fetch-berlin-geo.mjs (the static map data
 * in public/geo/berlin.json is pre-projected with the same origin).
 */
export const ORIGIN: GeoPoint = { lat: 52.4577, lon: 13.396 };

const K_LAT = 110540;
const K_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function geoToScene({ lat, lon }: GeoPoint): Vec2 {
  return [(lon - ORIGIN.lon) * K_LON, -(lat - ORIGIN.lat) * K_LAT];
}

export function sceneToGeo([x, z]: Vec2): GeoPoint {
  return { lat: ORIGIN.lat - z / K_LAT, lon: ORIGIN.lon + x / K_LON };
}
