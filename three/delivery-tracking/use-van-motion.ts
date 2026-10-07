"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import * as THREE from "three";
import { sampleAt, type Polyline } from "@/features/delivery-tracking/route-math";
import type { Vec3 } from "@/features/delivery-tracking/types";

/** Metres right of the road centre line (German right-hand traffic). */
const LANE_OFFSET = 1.7;

export interface VanMotionInput {
  /** Static pose (dock/parking) — used when there is no route. */
  position: Vec3;
  rotation: number;
  /** Phase 3: ease toward a live position (e.g. a GPS fix) instead of snapping. */
  targetPosition?: Vec3;
  /** Route the van is travelling, plus reported progress (0..1). */
  route?: Polyline;
  progress?: number;
  /** Nominal travel speed along the route (m/s, already time-scaled). */
  speed?: number;
  animate: boolean;
}

/**
 * Owns a van's transform; the visual model never cares where positions come
 * from. Supports, in priority order:
 *  1. route + progress  → smooth path-following between progress reports
 *  2. targetPosition    → eases toward the latest fix (GPS)
 *  3. position/rotation → static placement (dock, parking bay)
 * Returns the current speed (m/s) for wheels/effects.
 */
export function useVanMotion(ref: RefObject<THREE.Group | null>, input: VanMotionInput) {
  const speedOut = useRef(0);
  /** Longitudinal acceleration (m/s²) — drives suspension pitch in the van. */
  const accelOut = useRef(0);
  const s = useRef({ dist: -1, routeKey: null as Polyline | null, placed: false, v: 0 });

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const d = Math.min(dt, 0.05);
    const st = s.current;
    const { route, progress = 0, speed = 10, animate } = input;

    if (route && route.length > 0) {
      const target = progress * route.length;
      if (st.routeKey !== route || st.dist < 0 || Math.abs(target - st.dist) > 400 || !animate) {
        // New trip (or a big jump): place, and pull away from rest.
        st.v = st.routeKey !== route && progress < 0.02 ? 0 : speed;
        st.dist = target;
        st.routeKey = route;
      } else {
        // Ease toward cruising speed, brake into the destination, and stay
        // gently corrected toward the reported progress.
        const remaining = route.length - st.dist;
        const cruise = Math.min(speed, Math.max(1.5, remaining * 0.35));
        const want = Math.max(0, cruise + (target - st.dist) * 0.6);
        const before = st.v;
        st.v = THREE.MathUtils.damp(st.v, want, 1.2, d);
        accelOut.current = THREE.MathUtils.damp(accelOut.current, (st.v - before) / Math.max(d, 1e-4), 6, d);
        st.dist = Math.min(st.dist + st.v * d, route.length);
      }
      const a = sampleAt(route, st.dist);
      const prev = g.position.clone();
      // Drive in the right-hand lane, not on the centre line.
      g.position.set(a.x - Math.cos(a.heading) * LANE_OFFSET, 0, a.z + Math.sin(a.heading) * LANE_OFFSET);
      let diff = a.heading - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y = st.placed && animate ? g.rotation.y + diff * (1 - Math.exp(-7 * d)) : a.heading;
      speedOut.current = prev.distanceTo(g.position) / Math.max(d, 1e-4);
      st.placed = true;
      return;
    }

    st.routeKey = null;
    st.dist = -1;
    const [x, , z] = input.targetPosition ?? input.position;
    const far = Math.hypot(g.position.x - x, g.position.z - z) > 60;
    if (!st.placed || far || !animate || !input.targetPosition) {
      g.position.set(x, 0, z);
      g.rotation.y = input.rotation;
      speedOut.current = 0;
      st.placed = true;
      return;
    }
    const before = g.position.clone();
    g.position.x = THREE.MathUtils.damp(g.position.x, x, 1.5, d);
    g.position.z = THREE.MathUtils.damp(g.position.z, z, 1.5, d);
    const moved = before.distanceTo(g.position);
    speedOut.current = moved / Math.max(d, 1e-4);
    if (moved > 1e-3) {
      const yaw = Math.atan2(g.position.x - before.x, g.position.z - before.z);
      let diff = yaw - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * (1 - Math.exp(-6 * d));
    }
  });

  return { speed: speedOut, accel: accelOut };
}
