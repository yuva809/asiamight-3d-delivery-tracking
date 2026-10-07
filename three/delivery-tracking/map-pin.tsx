"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { sceneMetrics } from "./scene-metrics";
import { useSceneSettings } from "./scene-settings";

const pinGeo = (() => {
  // Teardrop: cone from the tip tangent to a sphere head (radius 1, centre y = 2.2).
  const c = 2.2;
  const a0 = Math.asin(-1 / c);
  const pts = [new THREE.Vector2(0.0001, 0)];
  for (let i = 0; i <= 20; i++) {
    const a = a0 + ((Math.PI / 2 - a0) * i) / 20;
    pts.push(new THREE.Vector2(Math.max(0.0001, Math.cos(a)), c + Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, 28);
})();
const dotGeo = new THREE.CircleGeometry(0.42, 24);

interface MapPinProps {
  position: [number, number, number];
  color: string;
  /** Base size in metres at close range. */
  size?: number;
  /** Minimum on-screen height in px when zoomed out. */
  minPx?: number;
  bob?: boolean;
  /** Hide when the camera is closer than this (m). */
  hideBelow?: number;
}

/** Location pin that stays legible at any zoom (scales with metres/pixel). */
export function MapPin({ position, color, size = 1.2, minPx = 34, bob = true, hideBelow = 0 }: MapPinProps) {
  const { animate } = useSceneSettings();
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 }), [color]);

  useFrame(({ clock, camera }) => {
    if (!group.current || !inner.current) return;
    const s = Math.max(size, (minPx * sceneMetrics.metersPerPx) / 3.2);
    group.current.scale.setScalar(s);
    group.current.visible = sceneMetrics.distance >= hideBelow;
    inner.current.position.y = bob && animate ? Math.sin(clock.elapsedTime * 2.2) * 0.12 : 0;
    // Keep the white dot facing the camera.
    inner.current.rotation.y = Math.atan2(camera.position.x - group.current.position.x, camera.position.z - group.current.position.z);
  });

  return (
    <group ref={group} position={position}>
      <group ref={inner}>
        <mesh geometry={pinGeo} material={mat} castShadow />
        <mesh geometry={dotGeo} position={[0, 2.2, 1.01]}>
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
    </group>
  );
}
