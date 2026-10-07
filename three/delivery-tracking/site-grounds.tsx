"use client";

import { memo, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { CAR_PARK, DOCKS, SITE, VAN_BAYS, WAREHOUSE, YARD } from "@/features/delivery-tracking/scene-layout";
import { flatLayer, LAYER } from "./ground-layers";
import { withGroundNoise } from "./ground-shading";
import { crownGeometry, trunkGeometry } from "./foliage";
import { InstancedBoxes } from "./instanced-boxes";
import { GEO, MAT, PALETTE } from "./materials";
import { useSignTexture } from "./sign-texture";
import { rectToBox, seeded, type BoxInstance } from "./utils";

const LOT_Y = 0.04;
const LINE_Y = 0.075;
const groundMat = (color: string) => flatLayer(new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
const lotMat = withGroundNoise(groundMat(PALETTE.lot), { scale: 0.3, strength: 0.05, joints: 6, jointStrength: 0.09 });
const yardMat = withGroundNoise(groundMat(PALETTE.yard), { scale: 0.35, strength: 0.07, joints: 4, jointStrength: 0.1 });
const lawnMat = groundMat("#d5e4c9");
const lineMat = flatLayer(MAT.matte.clone());

/**
 * Paved site (site-local): yard, van bays, staff car park, landscaping,
 * fence, gate house, brand pylon, lighting and the driveway to the real road.
 */
export const SiteGrounds = memo(function SiteGrounds() {
  const b = SITE.bounds;
  const lot = rectToBox([b.minX, b.minZ, b.maxX, b.maxZ]);
  const yard = rectToBox(YARD);
  const park = rectToBox(CAR_PARK);

  const markings = useMemo(() => {
    const white: BoxInstance[] = [];
    // Dock approach guides.
    for (const d of DOCKS) {
      for (const s of [-1, 1]) {
        white.push({ position: [d.x + s * 1.75, LINE_Y, WAREHOUSE.maxZ + 7.5], scale: [0.14, 0.02, 12], color: PALETTE.markingYellow });
      }
    }
    // Van bays.
    for (const bay of VAN_BAYS) {
      for (const s of [-1, 1]) white.push({ position: [bay.position[0] + s * 1.75, LINE_Y, bay.position[1]], scale: [0.12, 0.02, 6.4], color: "#ffffff" });
    }
    // Staff car park: two rows of bays.
    const [px0, pz0, px1] = CAR_PARK;
    for (let z = pz0 + 1; z <= pz0 + 1 + 9 * 2.6; z += 2.6) {
      white.push({ position: [px0 + 3, LINE_Y, z], scale: [5, 0.02, 0.12], color: "#ffffff" });
      white.push({ position: [px1 - 3, LINE_Y, z], scale: [5, 0.02, 0.12], color: "#ffffff" });
    }
    // Pedestrian crossing from the car park to the office.
    for (let z = -11; z < -5; z += 0.9) white.push({ position: [34.2, LINE_Y, z], scale: [2.4, 0.02, 0.45], color: "#ffffff" });
    // Driveway centre line.
    for (let z = 39; z < 47; z += 2.2) white.push({ position: [0, LINE_Y, z], scale: [0.14, 0.02, 1.2], color: "#ffffff" });
    return white;
  }, []);

  const fence = useMemo(() => {
    const posts: BoxInstance[] = [];
    const panels: BoxInstance[] = [];
    const h = 2.0;
    const run = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(-(bz - az), bx - ax);
      panels.push({ position: [(ax + bx) / 2, h / 2 + 0.05, (az + bz) / 2], scale: [len, h, 0.03], rotationY: yaw });
      const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        posts.push({ position: [ax + (bx - ax) * t, h / 2, az + (bz - az) * t], scale: [0.08, h + 0.1, 0.08] });
      }
    };
    const gx = SITE.gate[0];
    run(b.minX, b.minZ, b.maxX, b.minZ);
    run(b.minX, b.minZ, b.minX, b.maxZ);
    run(b.maxX, b.minZ, b.maxX, b.maxZ);
    run(b.minX, b.maxZ, gx - 6, b.maxZ);
    run(gx + 6, b.maxZ, b.maxX, b.maxZ);
    return { posts, panels };
  }, [b]);

  const lights = useMemo(() => {
    const pts: [number, number][] = [
      [-33, -22], [-33, 4], [-33, 32], [-14, 35], [12, 35], [33, 35], [51, 30], [51, 8], [51, -14], [30, -23], [5, -23], [-18, -23],
    ];
    const poles: BoxInstance[] = [];
    const arms: BoxInstance[] = [];
    const heads: BoxInstance[] = [];
    for (const [x, z] of pts) {
      poles.push({ position: [x, 4, z], scale: [0.16, 8, 0.16] });
      arms.push({ position: [x, 8, z], scale: [1.4, 0.1, 0.12] });
      heads.push({ position: [x + 0.6, 7.92, z], scale: [0.55, 0.12, 0.3] });
    }
    return { poles, arms, heads };
  }, []);

  return (
    <group>
      {/* Paving */}
      <mesh position={[lot.cx, LOT_Y, lot.cz]} scale={[lot.w, 1, lot.d]} geometry={GEO.plane} material={lotMat} receiveShadow renderOrder={LAYER.lot} />
      <mesh position={[yard.cx, LOT_Y + 0.005, yard.cz]} scale={[yard.w, 1, yard.d]} geometry={GEO.plane} material={yardMat} receiveShadow renderOrder={LAYER.yard} />
      <mesh position={[park.cx, LOT_Y + 0.005, park.cz]} scale={[park.w, 1, park.d]} geometry={GEO.plane} material={yardMat} receiveShadow renderOrder={LAYER.yard} />
      {/* Driveway to the public road */}
      <mesh position={[0, LOT_Y + 0.005, 43]} scale={[9, 1, 12]} geometry={GEO.plane} material={yardMat} receiveShadow renderOrder={LAYER.yard} />
      {/* Lawn strips */}
      <mesh position={[-33.5, LOT_Y + 0.008, 6]} scale={[4, 1, 60]} geometry={GEO.plane} material={lawnMat} receiveShadow renderOrder={LAYER.lawn} />
      <mesh position={[9, LOT_Y + 0.008, -22.5]} scale={[84, 1, 6]} geometry={GEO.plane} material={lawnMat} receiveShadow renderOrder={LAYER.lawn} />

      <InstancedBoxes items={markings} material={lineMat} renderOrder={LAYER.siteLines} />
      <InstancedBoxes items={fence.posts} material={MAT.steelDark} />
      <InstancedBoxes items={fence.panels} material={MAT.glassLight} />

      <InstancedBoxes items={lights.poles} material={MAT.steelDark} castShadow />
      <InstancedBoxes items={lights.arms} material={MAT.steelDark} />
      <InstancedBoxes items={lights.heads} material={MAT.lampGlow} />

      <SiteTrees />
      <StaffCars />
      <GateHouse />
      <BrandPylon position={[-9, 0, 41]} />
    </group>
  );
});

const trunkGeo = trunkGeometry.clone().scale(1, 2.4, 1);
const crownGeo = crownGeometry;

function SiteTrees() {
  const items = useMemo(() => {
    const rand = seeded(41);
    const pts: [number, number][] = [];
    for (let z = -20; z <= 32; z += 6.5) pts.push([-33.5, z]);
    for (let x = -28; x <= 46; x += 7) pts.push([x, -22.5]);
    const trunks: BoxInstance[] = [];
    const crowns: BoxInstance[] = [];
    for (const [x, z] of pts) {
      const s = 0.85 + rand() * 0.4;
      trunks.push({ position: [x, 0, z], scale: [s, s, s] });
      crowns.push({ position: [x, 3.7 * s, z], scale: [2.3 * s, 2.1 * s, 2.3 * s], rotationY: rand() * Math.PI * 2, color: ["#7fa874", "#739e6a", "#8cb27f"][Math.floor(rand() * 3)] });
    }
    return { trunks, crowns };
  }, []);
  return (
    <group>
      <InstancedBoxes items={items.trunks} material={MAT.trunk} geometry={trunkGeo} castShadow />
      <InstancedBoxes items={items.crowns} material={MAT.matte} geometry={crownGeo} castShadow />
    </group>
  );
}

const carBody = new RoundedBoxGeometry(1.85, 0.72, 4.4, 2, 0.22);
const carCabin = new RoundedBoxGeometry(1.62, 0.6, 2.3, 2, 0.2);

function StaffCars() {
  const items = useMemo(() => {
    const rand = seeded(9);
    const colors = ["#f4f4f2", "#2b2d31", "#8f959c", "#41587a", "#d9dadc", "#f4f4f2"];
    const bodies: BoxInstance[] = [];
    const cabins: BoxInstance[] = [];
    const [px0, pz0, px1] = CAR_PARK;
    for (let i = 0; i < 9; i++) {
      for (const [x, yaw] of [
        [px0 + 3, Math.PI / 2],
        [px1 - 3, -Math.PI / 2],
      ] as [number, number][]) {
        if (rand() < 0.4) continue;
        const z = pz0 + 2.3 + i * 2.6;
        bodies.push({ position: [x, 0.62, z], scale: [1, 1, 1], rotationY: yaw, color: colors[Math.floor(rand() * colors.length)] });
        cabins.push({ position: [x - Math.sin(yaw) * 0.25, 1.18, z], scale: [1, 1, 1], rotationY: yaw });
      }
    }
    return { bodies, cabins };
  }, []);
  return (
    <group>
      <InstancedBoxes items={items.bodies} material={MAT.satin} geometry={carBody} castShadow />
      <InstancedBoxes items={items.cabins} material={MAT.glass} geometry={carCabin} />
    </group>
  );
}

function GateHouse() {
  const [gx, gz] = SITE.gate;
  return (
    <group position={[gx + 7.4, 0, gz - 1.6]}>
      <mesh position={[0, 1.4, 0]} scale={[2.4, 2.8, 2.4]} geometry={GEO.box} material={MAT.wallWhite} castShadow />
      <mesh position={[-1.21, 1.7, 0]} scale={[0.04, 1.1, 1.8]} geometry={GEO.box} material={MAT.glass} />
      <mesh position={[0, 2.9, 0]} scale={[3.0, 0.18, 3.0]} geometry={GEO.box} material={MAT.chili} castShadow />
      <mesh position={[-2.0, 0.55, 1.4]} scale={[0.3, 1.1, 0.3]} geometry={GEO.box} material={MAT.steelDark} />
      {/* Barrier arm — raised: the site is operating. */}
      <group position={[-2.0, 1.15, 1.4]} rotation-z={1.25}>
        <mesh position={[-3.2, 0, 0]} scale={[6.4, 0.12, 0.12]} geometry={GEO.box} material={MAT.white} />
        {[-1.2, -3.2, -5.2].map((x) => (
          <mesh key={x} position={[x, 0, 0]} scale={[0.8, 0.13, 0.13]} geometry={GEO.box} material={MAT.chili} />
        ))}
      </group>
    </group>
  );
}

/** Roadside brand totem at the entrance. */
function BrandPylon({ position }: { position: [number, number, number] }) {
  const tex = useSignTexture({
    title: "AsiaMight",
    subtitle: "Distribution Centre",
    background: "#d6472c",
    foreground: "#fff7ee",
    mark: true,
    markColor: "#fff7ee",
    width: 1024,
    height: 320,
  });
  return (
    <group position={position} rotation-y={0.25}>
      <mesh position={[0, 0.25, 0]} scale={[5.4, 0.5, 1.4]} geometry={GEO.box} material={MAT.plinth} castShadow />
      <mesh position={[0, 2.6, 0]} scale={[4.8, 4.2, 0.6]} geometry={GEO.box} material={MAT.wallWhite} castShadow />
      {[0.31, -0.31].map((z) => (
        <mesh key={z} position={[0, 3.0, z]} rotation-y={z > 0 ? 0 : Math.PI}>
          <planeGeometry args={[4.4, 1.38]} />
          <meshStandardMaterial map={tex} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
