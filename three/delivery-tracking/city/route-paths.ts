import type { BerlinGeo } from "@/features/delivery-tracking/berlin-geo";
import { routeIdFor } from "@/features/delivery-tracking/mock-data";
import { joinPaths, toPolyline, unflatten, type Polyline } from "@/features/delivery-tracking/route-math";
import { SITE, siteToWorld } from "@/features/delivery-tracking/scene-layout";
import type { Vec2 } from "@/features/delivery-tracking/types";

/** Yard exit path (site-local): in front of the docks → gate. */
const YARD_EXIT: Vec2[] = [
  [-15, 22.5],
  [-9, 30],
  [-2, 35.5],
  SITE.gate,
];

export interface RoutePath {
  id: string;
  branchId: string;
  line: Polyline;
  /** OSRM distance/duration for the public-road part. */
  distance: number;
  duration: number;
}

/** Real OSRM routes, extended back through the site gate into the yard. */
export function buildRoutePaths(geo: BerlinGeo): Map<string, RoutePath> {
  const exit = YARD_EXIT.map(siteToWorld);
  const map = new Map<string, RoutePath>();
  for (const r of geo.routes) {
    const pts = joinPaths(exit, [SITE.roadJoin], unflatten(r.p));
    map.set(routeIdFor(r.branchId), {
      id: routeIdFor(r.branchId),
      branchId: r.branchId,
      line: toPolyline(pts),
      distance: r.distance,
      duration: r.duration,
    });
  }
  return map;
}
