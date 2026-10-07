"use client";

import { use } from "react";

/**
 * Static Berlin geography (© OpenStreetMap contributors, ODbL), pre-projected
 * to scene metres by scripts/fetch-berlin-geo.mjs. This is "the map", not
 * business data — it changes only when the script is re-run.
 *
 * Polylines/polygons are flat arrays: [x0, z0, x1, z1, …].
 */
export type RoadClass =
  | "motorway"
  | "trunk"
  | "primary"
  | "secondary"
  | "tertiary"
  | "residential"
  | "unclassified"
  | "living_street"
  | "pedestrian"
  | "service";

export interface GeoRoad {
  c: RoadClass;
  n?: string;
  /** 1 = slip road */
  l?: 1;
  /** 1 = one-way */
  o?: 1;
  p: number[];
}

export interface GeoBuilding {
  /** Height in metres. */
  h: number;
  /** Open ring. */
  p: number[];
}

export interface GeoRoute {
  branchId: string;
  /** Metres */
  distance: number;
  /** Seconds (OSRM estimate) */
  duration: number;
  p: number[];
  start: number[];
  end: number[];
}

export interface GeoSite {
  id: string;
  lat: number;
  lon: number;
  radius: number;
  xz: [number, number];
}

export interface BerlinGeo {
  meta: {
    origin: { lat: number; lon: number };
    siteMask: { minX: number; maxX: number; minZ: number; maxZ: number };
    sites: GeoSite[];
    attribution: string;
    generatedAt: string;
  };
  majorRoads: GeoRoad[];
  localRoads: GeoRoad[];
  buildings: GeoBuilding[];
  trees: number[];
  lamps: number[];
  water: number[][];
  green: number[][];
  rivers: { c: string; n?: string; p: number[] }[];
  rail: number[][];
  routes: GeoRoute[];
}

let pending: Promise<BerlinGeo> | null = null;

export function loadBerlinGeo(): Promise<BerlinGeo> {
  pending ??= fetch("/geo/berlin.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Berlin geography failed to load (${r.status})`);
      return r.json() as Promise<BerlinGeo>;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** Suspends until the map data is loaded (cached for the session). */
export function useBerlinGeo(): BerlinGeo {
  return use(loadBerlinGeo());
}
