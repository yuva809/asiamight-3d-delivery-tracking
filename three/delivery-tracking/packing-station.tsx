"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { FLOOR_Y } from "@/features/delivery-tracking/scene-layout";
import { GEO, MAT } from "./materials";
import { useSceneSettings } from "./scene-settings";

/** Packing bench: worktop, monitor, tape dispenser, cartons waiting to be closed. */
export function PackingStation({ position, rotation = 0 }: { position: [number, number]; rotation?: number }) {
  return (
    <group position={[position[0], FLOOR_Y, position[1]]} rotation-y={rotation}>
      <mesh position={[0, 0.9, 0]} scale={[2.2, 0.08, 1.0]} geometry={GEO.box} material={MAT.white} castShadow receiveShadow />
      {[-1, 1].flatMap((x) =>
        [-0.42, 0.42].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.45, z]} scale={[0.07, 0.9, 0.07]} geometry={GEO.box} material={MAT.steelDark} />
        )),
      )}
      <mesh position={[0, 0.35, 0]} scale={[2.0, 0.04, 0.85]} geometry={GEO.box} material={MAT.steel} />
      {/* Monitor */}
      <mesh position={[0.75, 1.3, -0.35]} scale={[0.55, 0.36, 0.04]} geometry={GEO.box} material={MAT.ink} />
      <mesh position={[0.75, 1.05, -0.35]} scale={[0.05, 0.22, 0.05]} geometry={GEO.box} material={MAT.steelDark} />
      {/* Cartons */}
      <mesh position={[-0.55, 1.12, 0.05]} scale={[0.6, 0.38, 0.45]} geometry={GEO.box} material={MAT.kraft} castShadow />
      <mesh position={[0.05, 1.06, 0.12]} scale={[0.4, 0.26, 0.32]} geometry={GEO.box} material={MAT.kraft} castShadow />
      {/* Tape dispenser */}
      <mesh position={[0.4, 0.98, 0.25]} scale={[0.22, 0.1, 0.1]} geometry={GEO.box} material={MAT.chili} />
      {/* Flat-packed boxes under the bench */}
      <mesh position={[0, 0.48, 0]} scale={[1.6, 0.18, 0.7]} geometry={GEO.box} material={MAT.kraft} />
    </group>
  );
}

interface ConveyorProps {
  from: [number, number];
  to: [number, number];
  /** Number of cartons riding the belt. */
  cartons?: number;
}

/** Straight roller conveyor from packing to loading, with cartons travelling along it. */
export function Conveyor({ from, to, cartons = 4 }: ConveyorProps) {
  const { animate } = useSceneSettings();
  const boxes = useRef<(THREE.Mesh | null)[]>([]);
  const t = useRef(0);
  const [ax, az] = from;
  const [bx, bz] = to;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const beltY = FLOOR_Y + 0.85;

  useFrame((_, dt) => {
    if (animate) t.current += dt * 0.55;
    boxes.current.forEach((m, i) => {
      if (!m) return;
      const u = ((t.current / len + i / cartons) % 1 + 1) % 1;
      m.position.set(ax + (bx - ax) * u, beltY + 0.17, az + (bz - az) * u);
      // Fade-in/out by scaling at the ends of the belt.
      const edge = Math.min(u, 1 - u) * len;
      const s = THREE.MathUtils.clamp(edge / 0.6, 0, 1);
      m.scale.set(0.5 * s, 0.32 * s, 0.4 * s);
    });
  });

  const legs = Math.max(2, Math.round(len / 2.2));
  return (
    <group>
      <group position={[(ax + bx) / 2, 0, (az + bz) / 2]} rotation-y={yaw}>
        <mesh position={[0, beltY - 0.06, 0]} scale={[len, 0.12, 0.8]} geometry={GEO.box} material={MAT.steel} castShadow />
        <mesh position={[0, beltY + 0.005, 0]} scale={[len, 0.02, 0.62]} geometry={GEO.box} material={MAT.rubber} />
        {[-0.42, 0.42].map((z) => (
          <mesh key={z} position={[0, beltY + 0.06, z]} scale={[len, 0.12, 0.05]} geometry={GEO.box} material={MAT.saffron} />
        ))}
        {Array.from({ length: legs + 1 }, (_, i) => -len / 2 + (i * len) / legs).map((x) => (
          <mesh key={x} position={[x, (beltY - 0.1) / 2 + FLOOR_Y / 2, 0]} scale={[0.08, beltY - 0.1 - FLOOR_Y, 0.6]} geometry={GEO.box} material={MAT.steelDark} />
        ))}
      </group>
      {Array.from({ length: cartons }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            boxes.current[i] = m;
          }}
          rotation-y={yaw}
          geometry={GEO.box}
          material={MAT.kraft}
          castShadow
        />
      ))}
    </group>
  );
}
