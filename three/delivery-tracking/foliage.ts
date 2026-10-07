import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Tree crown: three overlapping smooth lumps instead of one faceted ball —
 * reads as foliage mass (like an architectural model tree) at ~210 tris.
 * Unit-ish size: radius ≈ 1 around the origin.
 */
export const crownGeometry = (() => {
  const lumps: [number, number, number, number][] = [
    [0, 0, 0, 0.92],
    [0.42, 0.22, 0.18, 0.7],
    [-0.36, 0.3, -0.22, 0.66],
  ];
  const parts = lumps.map(([x, y, z, r]) => new THREE.SphereGeometry(r, 7, 5).translate(x, y, z));
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
})();

/** Slim tapered trunk, base at y = 0, height 1 (scale per instance). */
export const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.17, 1, 6).translate(0, 0.5, 0);

/** Lighter crown for the many street trees (~96 tris): two smooth lumps. */
export const crownGeometryLite = (() => {
  const parts = [
    new THREE.SphereGeometry(0.95, 6, 4).translate(0, 0, 0),
    new THREE.SphereGeometry(0.7, 6, 4).translate(0.35, 0.3, 0.12),
  ];
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
})();
