"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BerlinGeo } from "@/features/delivery-tracking/berlin-geo";
import { sampleAt, toPolyline, unflatten, type Polyline } from "@/features/delivery-tracking/route-math";
import { SITE } from "@/features/delivery-tracking/scene-layout";
import { useQuality } from "../perf/quality";
import { sceneMetrics } from "../scene-metrics";
import { perfCount } from "../perf/perf-store";
import { useSceneSettings } from "../scene-settings";
import { seeded } from "../utils";

/**
 * Background city traffic (Kenney Car Kit, CC0 — recoloured to a neutral
 * real-world palette). Cars follow real OSM streets near the warehouse and
 * branches, in the right-hand lane. One instanced draw call per car model.
 */
const CAR_TYPES = ["sedan", "suv", "hatchback-sports", "taxi", "van", "truck"] as const;
const URLS = CAR_TYPES.map((t) => `/models/car-${t}.glb`);
URLS.forEach((u) => useGLTF.preload(u));

/** Kenney cars are slightly toy-scaled; this brings them to ~real dimensions. */
const CAR_SCALE = 1.28;
const LANE = 1.7;
/** Relative frequency per model (sedans and SUVs dominate real traffic). */
const MIX = [0.34, 0.22, 0.16, 0.08, 0.12, 0.08];

interface Car {
  type: number;
  line: Polyline;
  dist: number;
  speed: number;
  /** 0..1 spawn-in scale. */
  appear: number;
}

interface Lane {
  line: Polyline;
  /** Relative traffic weight (major roads carry more). */
  weight: number;
}

/** Lanes (both directions unless one-way) within `radius` of a centre. */
function lanesNear(geo: BerlinGeo, centre: [number, number], radius: number): Lane[] {
  const lanes: Lane[] = [];
  const weightOf: Record<string, number> = { trunk: 3, primary: 3, secondary: 2.2, tertiary: 1.5, residential: 0.8, unclassified: 0.8 };
  for (const road of [...geo.majorRoads, ...geo.localRoads]) {
    const w = weightOf[road.c];
    if (!w) continue;
    const pts = unflatten(road.p);
    if (!pts.some(([x, z]) => Math.hypot(x - centre[0], z - centre[1]) < radius)) continue;
    const line = toPolyline(pts);
    if (line.length < 80) continue;
    lanes.push({ line, weight: w });
    if (!road.o) lanes.push({ line: toPolyline([...pts].reverse()), weight: w });
  }
  return lanes;
}

export const CityTraffic = memo(function CityTraffic({ geo }: { geo: BerlinGeo }) {
  const { animate, lowPower } = useSceneSettings();
  const quality = useQuality();
  const maxCars = quality.traffic;
  const gltfs = useGLTF(URLS);
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Merge each car model (body + wheels) into one geometry + one material.
  const models = useMemo(
    () =>
      gltfs.map((g) => {
        const parts: THREE.BufferGeometry[] = [];
        let material: THREE.Material | null = null;
        g.scene.updateMatrixWorld(true);
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const geom = m.geometry.clone().applyMatrix4(m.matrixWorld);
          for (const k of Object.keys(geom.attributes)) if (!["position", "normal", "uv"].includes(k)) geom.deleteAttribute(k);
          parts.push(geom.index ? geom.toNonIndexed() : geom);
          material ??= m.material as THREE.Material;
        });
        const merged = mergeGeometries(parts, false) ?? new THREE.BoxGeometry();
        merged.scale(CAR_SCALE, CAR_SCALE, CAR_SCALE);
        const mat = (material as THREE.MeshStandardMaterial | null)?.clone() ?? new THREE.MeshStandardMaterial();
        (mat as THREE.MeshStandardMaterial).roughness = 0.42;
        (mat as THREE.MeshStandardMaterial).metalness = 0.15;
        return { geometry: merged, material: mat };
      }),
    [gltfs],
  );

  const cars = useMemo(() => {
    const rand = seeded(91);
    // Total budget (quality-controlled, max 12): most around the warehouse,
    // one per branch so each branch street isn't dead.
    const total = Math.min(lowPower ? 5 : 12, maxCars);
    const branchEach = total >= 10 ? 1 : 0;
    const zones: { centre: [number, number]; radius: number; budget: number }[] = [
      { centre: SITE.position, radius: 500, budget: total - branchEach * 4 },
      ...geo.meta.sites.slice(1).map((s) => ({ centre: s.xz, radius: 220, budget: branchEach })),
    ];
    const out: Car[] = [];
    for (const z of zones) {
      const lanes = lanesNear(geo, z.centre, z.radius);
      const total = lanes.reduce((s, l) => s + l.line.length * l.weight, 0) || 1;
      let placed = 0;
      for (const { line, weight } of lanes) {
        const n = Math.round((line.length * weight / total) * z.budget + (rand() - 0.5));
        for (let i = 0; i < n && placed < z.budget; i++, placed++) {
          let r = rand();
          let type = 0;
          while (type < MIX.length - 1 && r > MIX[type]) {
            r -= MIX[type];
            type++;
          }
          out.push({ type, line, dist: rand() * line.length, speed: 7 + rand() * 6, appear: 1 });
        }
      }
    }
    return out;
  }, [geo, lowPower, maxCars]);

  const counts = useMemo(() => CAR_TYPES.map((_, t) => cars.filter((c) => c.type === t).length), [cars]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const s = useMemo(() => new THREE.Vector3(), []);
  const write = () => {
    const idx = CAR_TYPES.map(() => 0);
    for (const car of cars) {
      const mesh = meshes.current[car.type];
      if (!mesh) continue;
      const a = sampleAt(car.line, car.dist);
      p.set(a.x - Math.cos(a.heading) * LANE, 0.06, a.z + Math.sin(a.heading) * LANE);
      q.setFromEuler(e.set(0, a.heading, 0));
      s.setScalar(Math.max(0.001, car.appear));
      m4.compose(p, q, s);
      mesh.setMatrixAt(idx[car.type]++, m4);
    }
    meshes.current.forEach((mesh) => {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });
  };

  useLayoutEffect(write);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    // Not visible → not animated (cars resume where they were).
    g.visible = sceneMetrics.distance < 1400;
    if (!g.visible || !animate) return;
    const d = Math.min(dt, 0.05);
    for (const car of cars) {
      car.dist += car.speed * d;
      if (car.dist >= car.line.length - 4) {
        car.dist = 4;
        car.appear = 0;
      }
      car.appear = Math.min(1, car.appear + d * 1.5);
    }
    write();
    perfCount("traffic cars", cars.length);
  });

  return (
    <group ref={group}>
      {models.map((m, t) =>
        counts[t] > 0 ? (
          <instancedMesh
            key={`${t}-${counts[t]}`}
            ref={(mesh) => {
              meshes.current[t] = mesh;
            }}
            args={[m.geometry, m.material, counts[t]]}
            castShadow={quality.characterShadows}
            receiveShadow
            frustumCulled={false}
          />
        ) : null,
      )}
    </group>
  );
});
