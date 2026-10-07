"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { FLOOR_Y } from "@/features/delivery-tracking/scene-layout";
import { GEO, MAT } from "./materials";
import { perfCount } from "./perf/perf-store";
import { useSceneSettings } from "./scene-settings";

type GroupProps = { position: [number, number, number]; rotation?: number };

const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.22, 16).rotateZ(Math.PI / 2);

/** Counterbalance forklift (forks toward local +z). `forks` = ref to the lifting carriage. */
function ForkliftModel({ forks, loaded = true }: { forks?: React.Ref<THREE.Group>; loaded?: boolean }) {
  return (
    <group>
      {/* Chassis + counterweight */}
      <RoundedBox args={[1.15, 0.75, 2.0]} radius={0.12} smoothness={2} position={[0, 0.62, -0.1]} material={MAT.saffron} castShadow />
      <RoundedBox args={[1.15, 0.85, 0.5]} radius={0.12} smoothness={2} position={[0, 0.75, -1.0]} material={MAT.ink} castShadow />
      {/* Seat + steering */}
      <mesh position={[0, 1.15, -0.3]} scale={[0.55, 0.38, 0.5]} geometry={GEO.box} material={MAT.rubber} />
      <mesh position={[0, 1.35, 0.3]} rotation-x={-0.6} scale={[0.04, 0.5, 0.04]} geometry={GEO.box} material={MAT.ink} />
      {/* Overhead guard */}
      {[-0.5, 0.5].flatMap((x) =>
        [-0.75, 0.45].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.55, z]} scale={[0.07, 1.3, 0.07]} geometry={GEO.box} material={MAT.ink} />
        )),
      )}
      <mesh position={[0, 2.22, -0.15]} scale={[1.1, 0.06, 1.35]} geometry={GEO.box} material={MAT.ink} castShadow />
      {/* Mast */}
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} position={[x, 1.3, 0.98]} scale={[0.1, 2.5, 0.12]} geometry={GEO.box} material={MAT.steelDark} castShadow />
      ))}
      <group ref={forks} position={[0, 0.12, 0]}>
        <mesh position={[0, 0.45, 1.06]} scale={[0.9, 0.7, 0.06]} geometry={GEO.box} material={MAT.steelDark} />
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.04, 1.6]} scale={[0.12, 0.05, 1.1]} geometry={GEO.box} material={MAT.steelDark} />
        ))}
        {loaded && (
          <group position={[0, 0.07, 1.65]}>
            <mesh position={[0, 0, 0]} scale={[1.1, 0.14, 1.0]} geometry={GEO.box} material={MAT.pallet} castShadow />
            <mesh position={[0, 0.5, 0]} scale={[1.0, 0.86, 0.9]} geometry={GEO.box} material={MAT.kraft} castShadow />
          </group>
        )}
      </group>
      {/* Wheels */}
      {[-0.65, 0.6].flatMap((z) =>
        [-0.56, 0.56].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.3, z]} geometry={wheelGeo} material={MAT.rubber} castShadow />
        )),
      )}
      {/* Amber beacon */}
      <mesh position={[0, 2.32, -0.6]} scale={[0.1, 0.1, 0.1]} geometry={GEO.sphere} material={MAT.saffron} />
    </group>
  );
}

export function Forklift({ position, rotation = 0 }: GroupProps) {
  return (
    <group position={position} rotation-y={rotation}>
      <ForkliftModel />
    </group>
  );
}

/**
 * Forklift shuttling along an aisle: drive → stop → lift → lower → drive back.
 * Path is site-local [x, z] points; it ping-pongs.
 */
export function AnimatedForklift({ path }: { path: [number, number][] }) {
  const { animate } = useSceneSettings();
  const root = useRef<THREE.Group>(null);
  const forks = useRef<THREE.Group>(null);
  const pts = useMemo(() => path.map(([x, z]) => new THREE.Vector3(x, FLOOR_Y, z)), [path]);
  const s = useRef({ i: 1, dir: 1, wait: 1.5, lift: 0 });

  useFrame((_, dt) => {
    const g = root.current;
    if (!g || !animate) return;
    const d = Math.min(dt, 0.05);
    const st = s.current;
    perfCount("forklift");
    if (st.wait > 0) {
      st.wait -= d;
      // Lift cycle while stopped.
      st.lift = Math.sin(Math.min(1, 1 - st.wait / 3) * Math.PI) * 1.4;
    } else {
      const goal = pts[st.i];
      const delta = goal.clone().sub(g.position);
      const dist = delta.length();
      if (dist < 0.05) {
        st.wait = 3;
        const next = st.i + st.dir;
        if (next < 0 || next >= pts.length) st.dir *= -1;
        st.i += st.dir;
      } else {
        g.position.addScaledVector(delta.normalize(), Math.min(dist, 2.2 * d));
        // Forks lead in the direction of travel.
        const yaw = Math.atan2(delta.x, delta.z);
        let diff = yaw - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += diff * (1 - Math.exp(-8 * d));
      }
      st.lift = THREE.MathUtils.damp(st.lift, 0, 6, d);
    }
    if (forks.current) forks.current.position.y = 0.12 + st.lift;
  });

  return (
    <group ref={root} position={pts[0]} rotation-y={Math.PI / 2}>
      <ForkliftModel forks={forks} />
    </group>
  );
}

/** Manual pallet jack with an empty pallet. */
export function PalletJack({ position, rotation = 0 }: GroupProps) {
  return (
    <group position={position} rotation-y={rotation}>
      <mesh position={[0, 0.07, 0]} scale={[1.2, 0.14, 1.0]} geometry={GEO.box} material={MAT.pallet} castShadow />
      {[-0.22, 0.22].map((z) => (
        <mesh key={z} position={[0.1, 0.03, z]} scale={[1.15, 0.05, 0.16]} geometry={GEO.box} material={MAT.chili} />
      ))}
      <mesh position={[-0.62, 0.2, 0]} scale={[0.18, 0.35, 0.55]} geometry={GEO.box} material={MAT.chili} castShadow />
      <mesh position={[-0.8, 0.65, 0]} rotation-z={0.35} scale={[0.05, 0.95, 0.05]} geometry={GEO.box} material={MAT.ink} />
    </group>
  );
}

/** Two-tier picking trolley with a couple of totes. */
export function PickCart({ position, rotation = 0 }: GroupProps) {
  return (
    <group position={position} rotation-y={rotation}>
      {[0.25, 0.75].map((y) => (
        <mesh key={y} position={[0, y, 0]} scale={[1.0, 0.04, 0.55]} geometry={GEO.box} material={MAT.steel} castShadow />
      ))}
      {[-0.48, 0.48].flatMap((x) =>
        [-0.25, 0.25].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.5, z]} scale={[0.03, 1.0, 0.03]} geometry={GEO.box} material={MAT.steelDark} />
        )),
      )}
      <mesh position={[-0.2, 0.92, 0]} scale={[0.45, 0.3, 0.4]} geometry={GEO.box} material={MAT.indigo} castShadow />
      <mesh position={[0.25, 0.4, 0]} scale={[0.4, 0.26, 0.4]} geometry={GEO.box} material={MAT.kraft} />
    </group>
  );
}
