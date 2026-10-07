"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BerlinGeo, GeoRoad } from "@/features/delivery-tracking/berlin-geo";
import { unflatten } from "@/features/delivery-tracking/route-math";
import { SITE } from "@/features/delivery-tracking/scene-layout";
import type { Vec2 } from "@/features/delivery-tracking/types";
import { flatLayer, LAYER } from "../ground-layers";
import { crownGeometryLite, trunkGeometry } from "../foliage";
import { useQuality } from "../perf/quality";
import { InstancedBoxes } from "../instanced-boxes";
import { MAT } from "../materials";
import { sceneMetrics } from "../scene-metrics";
import { seeded, type BoxInstance } from "../utils";
import { roadHalf } from "./city-map";
import { buildRibbonGeometry, makeRibbonMaterial, type RibbonLine } from "./ribbon";
import { ZoneLOD } from "./zone-lod";
import { cityZones, partition, type Zone } from "./zones";

const MARK_Y = 0.1;

function nearAnySite(geo: BerlinGeo, [x, z]: Vec2, pad = 0) {
  return geo.meta.sites.some((s) => Math.hypot(x - s.xz[0], z - s.xz[1]) < s.radius + pad);
}
const inWarehouseSite = ([x, z]: Vec2) => Math.hypot(x - SITE.position[0], z - SITE.position[1]) < 58;

/** Offset a polyline sideways by `d` metres (simple miter). */
function offsetLine(pts: Vec2[], d: number): Vec2[] {
  return pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(next[1] - prev[1]);
    let nz = next[0] - prev[0];
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    return [p[0] + nx * d, p[1] + nz * d];
  });
}

const edgeMaterial = flatLayer(makeRibbonMaterial("#ffffff", { roughness: 0.6 }));
const markMat = flatLayer(MAT.marking.clone());

/** Lane dashes, edge lines and zebra crossings near the warehouse + branches. */
function RoadMarkings({ geo, zones }: { geo: BerlinGeo; zones: Zone[] }) {
  const { dashes, zebras, edges } = useMemo(() => {
    const dashes: BoxInstance[] = [];
    const zebras: BoxInstance[] = [];
    const edgeLines: RibbonLine[] = [];
    const roads: { road: GeoRoad; pts: Vec2[] }[] = [];
    for (const road of [...geo.majorRoads, ...geo.localRoads]) {
      const pts = unflatten(road.p);
      if (!pts.some((p) => nearAnySite(geo, p))) continue;
      roads.push({ road, pts });
    }
    // Junctions: endpoints shared by 3+ road ends.
    const ends = new Map<string, { p: Vec2; dirs: { dir: Vec2; half: number }[] }>();
    const key = ([x, z]: Vec2) => `${Math.round(x / 2)},${Math.round(z / 2)}`;
    for (const { road, pts } of roads) {
      if (road.c === "service" || road.c === "pedestrian" || pts.length < 2) continue;
      const half = roadHalf(road);
      for (const [a, b] of [
        [pts[0], pts[1]],
        [pts[pts.length - 1], pts[pts.length - 2]],
      ] as [Vec2, Vec2][]) {
        const k = key(a);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const entry = ends.get(k) ?? { p: a, dirs: [] };
        entry.dirs.push({ dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], half });
        ends.set(k, entry);
      }
    }
    const junctions: Vec2[] = [];
    for (const { p, dirs } of ends.values()) {
      if (dirs.length < 3 || !nearAnySite(geo, p, -40)) continue;
      junctions.push(p);
      for (const { dir, half } of dirs) {
        const maxHalf = Math.max(...dirs.map((d) => d.half));
        const off = maxHalf + 2.2;
        const cx = p[0] + dir[0] * off;
        const cz = p[1] + dir[1] * off;
        const yaw = Math.atan2(-dir[1], dir[0]);
        // Stripes run along the road direction, spaced across its width.
        const nx = -dir[1];
        const nz = dir[0];
        for (let s = -half + 0.5; s <= half - 0.4; s += 1.0) {
          zebras.push({ position: [cx + nx * s, MARK_Y, cz + nz * s], scale: [2.6, 0.02, 0.5], rotationY: yaw });
        }
      }
    }
    const nearJunction = ([x, z]: Vec2, r: number) => junctions.some(([jx, jz]) => Math.hypot(jx - x, jz - z) < r);

    for (const { road, pts } of roads) {
      const half = roadHalf(road);
      if (half >= 4.5 && road.c !== "service") {
        // Centre dashes (or a solid double line on primary+).
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i];
          const [bx, bz] = pts[i + 1];
          const len = Math.hypot(bx - ax, bz - az);
          const yaw = Math.atan2(-(bz - az), bx - ax);
          for (let t = 2; t < len - 1.5; t += 7) {
            const x = ax + ((bx - ax) * t) / len;
            const z = az + ((bz - az) * t) / len;
            if (!nearAnySite(geo, [x, z]) || nearJunction([x, z], half + 7)) continue;
            dashes.push({ position: [x, MARK_Y, z], scale: [3, 0.02, 0.16], rotationY: yaw });
          }
        }
      }
      if (half >= 6.5 && !road.l) {
        edgeLines.push({ points: offsetLine(pts, half - 0.7), half: 0.08, minPx: 0 });
        edgeLines.push({ points: offsetLine(pts, -(half - 0.7)), half: 0.08, minPx: 0 });
      }
    }
    const at = (b: BoxInstance) => [b.position[0], b.position[2]] as Vec2;
    return {
      dashes: partition(zones, dashes, at),
      zebras: partition(zones, zebras, at),
      edges: buildRibbonGeometry(edgeLines, MARK_Y),
    };
  }, [geo, zones]);

  return (
    <group>
      {zones.map((z, i) => (
        <ZoneLOD key={z.id} zone={z} range={700}>
          <InstancedBoxes items={dashes[i]} material={markMat} renderOrder={LAYER.roadMarkings} culled />
          <InstancedBoxes items={zebras[i]} material={markMat} renderOrder={LAYER.roadMarkings} culled />
        </ZoneLOD>
      ))}
      <EdgeLines geometry={edges} />
    </group>
  );
}

/** Lane edge lines are only meaningful up close. */
function EdgeLines({ geometry }: { geometry: THREE.BufferGeometry }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = sceneMetrics.distance < 900;
  });
  return <mesh ref={ref} geometry={geometry} material={edgeMaterial} frustumCulled={false} renderOrder={LAYER.roadEdges} />;
}

const trunkGeo = trunkGeometry;
const crownGeo = crownGeometryLite;
const TREE_TONES = ["#7fa874", "#739e6a", "#8cb27f", "#6f9867", "#93b884"];

/** Real street trees from OSM — one zone's worth, 2 instanced draw calls, no shadow casting. */
function StreetTrees({ points }: { points: Vec2[] }) {
  const items = useMemo(() => {
    const rand = seeded(17);
    const trunks: BoxInstance[] = [];
    const crowns: BoxInstance[] = [];
    points.forEach(([x, z], i) => {
      const s = 0.8 + rand() * 0.6;
      trunks.push({ position: [x, 0, z], scale: [s, 2.6 * s, s] });
      crowns.push({ position: [x, 4.6 * s, z], scale: [2.6 * s, 2.3 * s, 2.6 * s], rotationY: rand() * Math.PI * 2, color: TREE_TONES[i % TREE_TONES.length] });
    });
    return { trunks, crowns };
  }, [points]);
  return (
    <group>
      <InstancedBoxes items={items.trunks} material={MAT.trunk} geometry={trunkGeo} culled />
      <InstancedBoxes items={items.crowns} material={MAT.matte} geometry={crownGeo} receiveShadow culled />
    </group>
  );
}

function StreetLamps({ points }: { points: Vec2[] }) {
  const items = useMemo(() => {
    const poles: BoxInstance[] = [];
    const heads: BoxInstance[] = [];
    for (const [x, z] of points) {
      poles.push({ position: [x, 3.5, z], scale: [0.14, 7, 0.14] });
      heads.push({ position: [x, 7.05, z], scale: [0.5, 0.16, 0.5] });
    }
    return { poles, heads };
  }, [points]);
  return (
    <group>
      <InstancedBoxes items={items.poles} material={MAT.steelDark} culled />
      <InstancedBoxes items={items.heads} material={MAT.lampGlow} culled />
    </group>
  );
}

const CAR_COLORS = ["#f4f4f2", "#f4f4f2", "#d9dadc", "#2b2d31", "#8f959c", "#41587a", "#9b2f25", "#f4f4f2", "#5e6a5a"];

interface ParkedCar {
  x: number;
  z: number;
  yaw: number;
  color: string;
}

function parkedCarsOf(geo: BerlinGeo): ParkedCar[] {
  const rand = seeded(29);
  const out: ParkedCar[] = [];
  for (const road of geo.localRoads) {
    if (road.c !== "residential" && road.c !== "tertiary" && road.c !== "unclassified") continue;
    const pts = unflatten(road.p);
    const half = roadHalf(road);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 16) continue;
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      for (let t = 8; t < len - 8; t += 6.2) {
        for (const side of [-1, 1]) {
          if (rand() > 0.42) continue;
          const off = (half - 1.2) * side;
          const x = ax + dx * t - dz * off;
          const z = az + dz * t + dx * off;
          if (inWarehouseSite([x, z])) continue;
          out.push({ x, z, yaw: Math.atan2(dx, dz), color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
        }
      }
    }
  }
  return out;
}

/** Kerbside parked cars as simple instanced boxes (24 tris each). */
function ParkedCars({ cars }: { cars: ParkedCar[] }) {
  const items = useMemo(() => {
    const bodies: BoxInstance[] = [];
    const cabins: BoxInstance[] = [];
    for (const c of cars) {
      bodies.push({ position: [c.x, 0.6, c.z], scale: [1.82, 0.72, 4.3], rotationY: c.yaw, color: c.color });
      cabins.push({ position: [c.x - Math.sin(c.yaw) * 0.25, 1.17, c.z - Math.cos(c.yaw) * 0.25], scale: [1.6, 0.55, 2.2], rotationY: c.yaw });
    }
    return { bodies, cabins };
  }, [cars]);
  if (!cars.length) return null;
  return (
    <group>
      <InstancedBoxes items={items.bodies} material={MAT.satin} culled />
      <InstancedBoxes items={items.cabins} material={MAT.glass} culled />
    </group>
  );
}

/** Per-zone caps (visual priority: the warehouse surroundings get the most). */
const CAPS = { primary: { cars: 80 }, branch: { cars: 30 } };

/**
 * Street-level life near the warehouse and branches. Built once (static), split
 * by zone: each zone is frustum-culled and hidden by distance (ZoneLOD).
 */
export const StreetDetails = memo(function StreetDetails({ geo, lowPower }: { geo: BerlinGeo; lowPower: boolean }) {
  const quality = useQuality();
  const reduced = lowPower || quality.cityDetail === "reduced";
  const zones = useMemo(() => cityZones(geo), [geo]);
  const perZone = useMemo(() => {
    const trees = partition(zones, unflatten(geo.trees).filter((p) => !inWarehouseSite(p)), (p) => p);
    const lamps = partition(zones, unflatten(geo.lamps).filter((p) => !inWarehouseSite(p)), (p) => p);
    const cars = partition(zones, parkedCarsOf(geo), (c) => [c.x, c.z]);
    return zones.map((z, i) => ({
      trees: trees[i],
      treesThin: trees[i].filter((_, k) => k % 2 === 0),
      lamps: lamps[i],
      cars: cars[i].slice(0, z.primary ? CAPS.primary.cars : CAPS.branch.cars),
    }));
  }, [geo, zones]);

  return (
    <group>
      <RoadMarkings geo={geo} zones={zones} />
      {zones.map((z, i) => {
        const d = perZone[i];
        if (reduced && !z.primary) {
          // Reduced detail: branch zones keep lamps only.
          return (
            <ZoneLOD key={z.id} zone={z} range={500}>
              <StreetLamps points={d.lamps} />
            </ZoneLOD>
          );
        }
        return (
          <group key={z.id}>
            <ZoneLOD zone={z} range={z.primary ? 900 : 650}>
              <StreetTrees points={reduced ? d.treesThin : d.trees} />
            </ZoneLOD>
            <ZoneLOD zone={z} range={600}>
              <StreetLamps points={d.lamps} />
              {!reduced && <ParkedCars cars={d.cars} />}
            </ZoneLOD>
          </group>
        );
      })}
    </group>
  );
});
