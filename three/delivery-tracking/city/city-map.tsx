"use client";

import { memo, useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BerlinGeo, GeoRoad, RoadClass } from "@/features/delivery-tracking/berlin-geo";
import { unflatten } from "@/features/delivery-tracking/route-math";
import type { Vec2 } from "@/features/delivery-tracking/types";
import { PALETTE } from "../materials";
import { flatLayer, LAYER } from "../ground-layers";
import { withGroundNoise } from "../ground-shading";
import { buildRibbonGeometry, makeRibbonMaterial, type RibbonLine } from "./ribbon";

/** Real road widths (half, metres) and minimum on-screen widths (px). */
export const ROAD_STYLE: Record<RoadClass, { half: number; minPx: number }> = {
  motorway: { half: 12, minPx: 3.4 },
  trunk: { half: 10, minPx: 3 },
  primary: { half: 8, minPx: 2.6 },
  secondary: { half: 6.5, minPx: 1.6 },
  tertiary: { half: 5.5, minPx: 1.1 },
  residential: { half: 4.5, minPx: 0.8 },
  unclassified: { half: 4, minPx: 0.8 },
  living_street: { half: 3.5, minPx: 0.6 },
  pedestrian: { half: 3, minPx: 0.5 },
  service: { half: 3, minPx: 0.5 },
};

export const roadHalf = (r: GeoRoad) => (r.l ? 4 : ROAD_STYLE[r.c].half);


function polygonsGeometry(polys: number[][], y: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (const flat of polys) {
    const pts = unflatten(flat);
    if (pts.length < 3) continue;
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function useDisposable<T extends { dispose: () => void } | null>(value: T) {
  useEffect(() => () => value?.dispose(), [value]);
  return value;
}

/** Ground, parks, water, rail and the full real road network. */
export const CityMap = memo(function CityMap({ geo }: { geo: BerlinGeo }) {
  const mats = useMemo(
    () => ({
      ground: withGroundNoise(flatLayer(new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 })), { scale: 0.04, strength: 0.05, fadeFar: 1600 }),
      park: flatLayer(new THREE.MeshStandardMaterial({ color: PALETTE.park, roughness: 1 })),
      water: flatLayer(new THREE.MeshStandardMaterial({ color: PALETTE.water, roughness: 0.35, metalness: 0.05 })),
      river: flatLayer(makeRibbonMaterial(PALETTE.water, { roughness: 0.35 })),
      rail: flatLayer(makeRibbonMaterial(PALETTE.rail)),
      sidewalk: withGroundNoise(flatLayer(makeRibbonMaterial(PALETTE.sidewalk)), { scale: 0.5, strength: 0.04, joints: 1.5, jointStrength: 0.08, fadeFar: 180 }),
      roadLocal: withGroundNoise(flatLayer(makeRibbonMaterial(PALETTE.road)), { scale: 0.35, strength: 0.07, fadeFar: 400 }),
      roadMajor: withGroundNoise(flatLayer(makeRibbonMaterial(PALETTE.roadMajor)), { scale: 0.35, strength: 0.07, fadeFar: 400 }),
      roadMotorway: withGroundNoise(flatLayer(makeRibbonMaterial(PALETTE.roadMotorway)), { scale: 0.35, strength: 0.07, fadeFar: 400 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const park = useDisposable(useMemo(() => polygonsGeometry(geo.green, 0.02), [geo]));
  const water = useDisposable(useMemo(() => polygonsGeometry(geo.water, 0.03), [geo]));

  const ribbons = useDisposable(
    useMemo(() => {
      const rivers: RibbonLine[] = geo.rivers.map((r) => ({
        points: unflatten(r.p),
        half: r.c === "river" ? 22 : 10,
        minPx: r.c === "river" ? 2.4 : 1.4,
      }));
      const rail: RibbonLine[] = geo.rail.map((p) => ({ points: unflatten(p), half: 1.8, minPx: 1 }));
      const local: RibbonLine[] = [];
      const major: RibbonLine[] = [];
      const motorway: RibbonLine[] = [];
      const walks: RibbonLine[] = [];
      for (const r of geo.localRoads) {
        const s = ROAD_STYLE[r.c];
        const pts = unflatten(r.p);
        local.push({ points: pts, half: s.half, minPx: s.minPx });
        if (r.c !== "service" && r.c !== "pedestrian") walks.push({ points: pts, half: s.half + 2.8, minPx: 0 });
      }
      for (const r of geo.majorRoads) {
        const s = ROAD_STYLE[r.c];
        const line = { points: unflatten(r.p), half: roadHalf(r), minPx: r.l ? s.minPx * 0.6 : s.minPx };
        if (r.c === "motorway") motorway.push(line);
        else major.push(line);
        if (r.c !== "motorway") walks.push({ points: line.points, half: line.half + 3, minPx: 0 });
      }
      return {
        rivers: buildRibbonGeometry(rivers, 0.03),
        rail: buildRibbonGeometry(rail, 0.04),
        walks: buildRibbonGeometry(walks, 0.05),
        local: buildRibbonGeometry(local, 0.06),
        major: buildRibbonGeometry(major, 0.07),
        motorway: buildRibbonGeometry(motorway, 0.08),
        dispose() {
          [this.rivers, this.rail, this.walks, this.local, this.major, this.motorway].forEach((g) => g.dispose());
        },
      };
    }, [geo]),
  );

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[-4000, 0, -2500]} material={mats.ground} receiveShadow renderOrder={LAYER.ground}>
        <planeGeometry args={[90000, 90000]} />
      </mesh>
      {/* Depth-only ground: flat layers don't write depth (painter order), so
          this gives ambient occlusion a real ground plane to shade against. */}
      <mesh rotation-x={-Math.PI / 2} position={[-4000, -0.02, -2500]} renderOrder={LAYER.ground - 1}>
        <planeGeometry args={[90000, 90000]} />
        <meshBasicMaterial colorWrite={false} />
      </mesh>
      {park && <mesh geometry={park} material={mats.park} receiveShadow renderOrder={LAYER.park} />}
      {water && <mesh geometry={water} material={mats.water} receiveShadow renderOrder={LAYER.water} />}
      <mesh geometry={ribbons.rivers} material={mats.river} frustumCulled={false} renderOrder={LAYER.river} />
      <mesh geometry={ribbons.rail} material={mats.rail} frustumCulled={false} renderOrder={LAYER.rail} />
      <mesh geometry={ribbons.walks} material={mats.sidewalk} receiveShadow frustumCulled={false} renderOrder={LAYER.sidewalk} />
      <mesh geometry={ribbons.local} material={mats.roadLocal} receiveShadow frustumCulled={false} renderOrder={LAYER.roadLocal} />
      <mesh geometry={ribbons.major} material={mats.roadMajor} receiveShadow frustumCulled={false} renderOrder={LAYER.roadMajor} />
      <mesh geometry={ribbons.motorway} material={mats.roadMotorway} receiveShadow frustumCulled={false} renderOrder={LAYER.roadMotorway} />
    </group>
  );
});

/** Points (scene metres) of all roads within `radius` of a site, for markings/details. */
export function roadsNear(geo: BerlinGeo, centre: Vec2, radius: number) {
  const out: { road: GeoRoad; points: Vec2[] }[] = [];
  const r2 = radius * radius;
  for (const road of [...geo.majorRoads, ...geo.localRoads]) {
    const pts = unflatten(road.p);
    let inside = false;
    for (const [x, z] of pts) {
      const dx = x - centre[0];
      const dz = z - centre[1];
      if (dx * dx + dz * dz < r2) {
        inside = true;
        break;
      }
    }
    if (inside) out.push({ road, points: pts });
  }
  return out;
}
