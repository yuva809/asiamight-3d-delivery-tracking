import type { BerlinGeo } from "@/features/delivery-tracking/berlin-geo";
import { SITE } from "@/features/delivery-tracking/scene-layout";
import type { Vec2 } from "@/features/delivery-tracking/types";

/**
 * Spatial partition of the detailed city: the warehouse zone plus one zone
 * per branch. Detail is built and drawn per zone so that off-screen zones are
 * frustum-culled and far zones are hidden entirely (distance LOD).
 */
export interface Zone {
  id: string;
  centre: Vec2;
  radius: number;
  /** Warehouse zone gets the most detail (visual priority). */
  primary: boolean;
}

export function cityZones(geo: BerlinGeo): Zone[] {
  return [
    { id: "warehouse", centre: SITE.position, radius: 650, primary: true },
    ...geo.meta.sites.slice(1).map((s) => ({ id: s.id, centre: s.xz as Vec2, radius: 380, primary: false })),
  ];
}

/** Index of the zone containing (or nearest to) a point; -1 if outside every zone. */
export function zoneOf(zones: Zone[], [x, z]: Vec2, pad = 40): number {
  let best = -1;
  let bestD = Infinity;
  zones.forEach((zn, i) => {
    const d = Math.hypot(x - zn.centre[0], z - zn.centre[1]);
    if (d < zn.radius + pad && d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Group items by zone. */
export function partition<T>(zones: Zone[], items: T[], pointOf: (t: T) => Vec2): T[][] {
  const out: T[][] = zones.map(() => []);
  for (const it of items) {
    const i = zoneOf(zones, pointOf(it));
    if (i >= 0) out[i].push(it);
  }
  return out;
}
