import type * as THREE from "three";

/**
 * Flat ground layers (ground, parks, water, roads, paving, markings) are all
 * (nearly) coplanar. Instead of fighting z-precision across a 25 km scene,
 * they are painted in a fixed order without writing depth; real 3D objects
 * render afterwards with depth and occlude them normally.
 */
export const LAYER = {
  ground: -30,
  park: -29,
  water: -28,
  river: -27,
  rail: -26,
  sidewalk: -25,
  roadLocal: -24,
  roadMajor: -23,
  roadMotorway: -22,
  lot: -21,
  yard: -20,
  lawn: -19,
  siteLines: -18,
  roadEdges: -17,
  roadMarkings: -16,
  zoneFloor: -15,
} as const;

export function flatLayer<T extends THREE.Material>(material: T): T {
  material.depthWrite = false;
  material.polygonOffset = false;
  return material;
}
