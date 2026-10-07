"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type * as THREE from "three";
import { sceneMetrics } from "../scene-metrics";
import type { Zone } from "./zones";

/**
 * Distance LOD for one zone's detail: visible only while the camera's view
 * centre is within `range` metres of the zone (cheap check, once per frame).
 * Hidden groups cost nothing — no draw calls, no shadow casting.
 */
export function ZoneLOD({ zone, range, children }: { zone: Zone; range: number; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = sceneMetrics.target;
    const ground = Math.hypot(t.x - zone.centre[0], t.z - zone.centre[1]);
    // Combine horizontal offset and zoom distance: far away OR zoomed out → hidden.
    g.visible = ground < zone.radius + range && sceneMetrics.distance < range * 1.6;
  });
  return <group ref={group}>{children}</group>;
}
