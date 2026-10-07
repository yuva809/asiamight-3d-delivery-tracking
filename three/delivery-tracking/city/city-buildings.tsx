"use client";

import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BerlinGeo, GeoBuilding } from "@/features/delivery-tracking/berlin-geo";
import { unflatten } from "@/features/delivery-tracking/route-math";
import type { Vec2 } from "@/features/delivery-tracking/types";
import { PALETTE } from "../materials";
import { ZoneLOD } from "./zone-lod";
import { cityZones, partition } from "./zones";

/** Extrude one footprint (open ring, scene metres) to `height`. */
export function extrudeFootprint(points: Vec2[], height: number, base = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  if (base) g.translate(0, base, 0);
  return g;
}

export function pointInRing([px, pz]: Vec2, ring: Vec2[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Index of the OSM building at a point (or the nearest within maxDist). */
export function findBuildingAt(buildings: GeoBuilding[], point: Vec2, maxDist = 30): number {
  let best = -1;
  let bestD = maxDist;
  let containing = -1;
  let containingArea = 0;
  for (let i = 0; i < buildings.length; i++) {
    const ring = unflatten(buildings[i].p);
    const [x0, z0] = ring[0];
    if (Math.abs(x0 - point[0]) > 150 || Math.abs(z0 - point[1]) > 150) continue;
    if (pointInRing(point, ring)) {
      // OSM often has small building parts (kiosks, annexes) at an address — prefer the main building.
      const area = ringArea(ring);
      if (area > containingArea) {
        containing = i;
        containingArea = area;
      }
      continue;
    }
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    const d = Math.hypot(cx / ring.length - point[0], cz / ring.length - point[1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return containing >= 0 ? containing : best;
}

function distToRing([px, pz]: Vec2, ring: Vec2[]) {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i];
    const [bx, bz] = ring[(i + 1) % ring.length];
    const ex = bx - ax;
    const ez = bz - az;
    const l2 = ex * ex + ez * ez || 1;
    const u = Math.min(1, Math.max(0, ((px - ax) * ex + (pz - az) * ez) / l2));
    best = Math.min(best, Math.hypot(ax + ex * u - px, az + ez * u - pz));
  }
  return pointInRing([px, pz], ring) ? 0 : best;
}

/**
 * The building a branch occupies: near the geocoded address AND fronting the
 * street where vans stop (OSM often places the address on a courtyard
 * building part or kiosk, not the street-facing building with the shop).
 */
export function findBranchBuilding(buildings: GeoBuilding[], address: Vec2, street: Vec2 | null): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < buildings.length; i++) {
    const ring = unflatten(buildings[i].p);
    const [x0, z0] = ring[0];
    if (Math.abs(x0 - address[0]) > 120 || Math.abs(z0 - address[1]) > 120) continue;
    const dA = distToRing(address, ring);
    if (dA > 35) continue;
    const dS = street ? distToRing(street, ring) : 0;
    const area = ringArea(ring);
    const score = dA + 0.8 * dS + (area < 80 ? 25 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best >= 0 ? best : findBuildingAt(buildings, address);
}

function ringArea(ring: Vec2[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

/** Split a (non-indexed) ExtrudeGeometry into [caps, sides] by its groups. */
export function splitExtrude(g: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const out = g.groups.slice(0, 2).map(({ start, count }) => {
    const part = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"] as const) {
      const attr = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!attr) continue;
      const size = attr.itemSize;
      part.setAttribute(name, new THREE.BufferAttribute((attr.array as Float32Array).slice(start * size, (start + count) * size), size));
    }
    return part;
  });
  return [out[0] ?? new THREE.BufferGeometry(), out[1] ?? new THREE.BufferGeometry()];
}

/** Merge a set of footprints into [roofs, walls] geometries. */
function mergeBuildings(geo: BerlinGeo, indices: number[]) {
  const roofs: THREE.BufferGeometry[] = [];
  const walls: THREE.BufferGeometry[] = [];
  for (const i of indices) {
    const b = geo.buildings[i];
    const pts = unflatten(b.p);
    if (pts.length < 3) continue;
    const g = extrudeFootprint(pts, b.h);
    const [caps, sides] = splitExtrude(g);
    g.dispose();
    roofs.push(caps);
    walls.push(sides);
  }
  if (!roofs.length) return null;
  const merged = { roofs: mergeGeometries(roofs, false), walls: mergeGeometries(walls, false) };
  [...roofs, ...walls].forEach((p) => p.dispose());
  merged.roofs.computeBoundingSphere();
  merged.walls.computeBoundingSphere();
  return merged;
}

/**
 * Real buildings around the warehouse and branches, split by zone: each zone
 * is 2 draw calls, frustum-culled, hidden at city scale. Only the warehouse
 * zone casts shadows (the shadow camera never sees the branches anyway).
 */
export const CityBuildings = memo(function CityBuildings({ geo, exclude }: { geo: BerlinGeo; exclude: Set<number> }) {
  const materials = useMemo(
    () => [
      new THREE.MeshStandardMaterial({ color: PALETTE.buildingRoof, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: PALETTE.building, roughness: 0.85 }),
    ],
    [],
  );
  const zones = useMemo(() => cityZones(geo), [geo]);
  const perZone = useMemo(() => {
    const ids = geo.buildings.map((_, i) => i).filter((i) => !exclude.has(i));
    const groups = partition(zones, ids, (i) => [geo.buildings[i].p[0], geo.buildings[i].p[1]]);
    return groups.map((g) => mergeBuildings(geo, g));
  }, [geo, exclude, zones]);

  useEffect(
    () => () =>
      perZone.forEach((z) => {
        z?.roofs.dispose();
        z?.walls.dispose();
      }),
    [perZone],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  return (
    <group>
      {zones.map((z, i) => {
        const g = perZone[i];
        if (!g) return null;
        return (
          <ZoneLOD key={z.id} zone={z} range={3200}>
            <mesh name="city-buildings" geometry={g.roofs} material={materials[0]} castShadow={z.primary} receiveShadow />
            <mesh name="city-buildings" geometry={g.walls} material={materials[1]} castShadow={z.primary} receiveShadow />
          </ZoneLOD>
        );
      })}
    </group>
  );
});
