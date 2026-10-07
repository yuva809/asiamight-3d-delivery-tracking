"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  CAMERA_VIEWS,
  DEFAULT_VIEW,
  INSIDE_VIEWS,
  type CameraViewId,
  type InsideStop,
} from "@/features/delivery-tracking/scene-layout";
import type { Vec3 } from "@/features/delivery-tracking/types";
import { branchRegistry } from "./branch-registry";
import { sceneMetrics, sharedUniforms } from "./scene-metrics";
import { vanRegistry } from "./van-registry";

export interface CameraControllerHandle {
  goTo: (view: Exclude<CameraViewId, "follow">) => void;
  inside: (stop: InsideStop) => void;
  reset: () => void;
  /** Chase a van (null = stop following). */
  follow: (vanId: string | null) => void;
  /** Frame an arbitrary point. */
  focus: (target: Vec3, distance?: number) => void;
  /** Frame a branch from its street side so the storefront is visible. */
  focusBranch: (branchId: string) => void;
  /** Step zoom: <1 zooms in, >1 zooms out. */
  zoom: (factor: number) => void;
}

interface Flight {
  fromTarget: THREE.Vector3;
  fromOffset: THREE.Vector3;
  toTarget: THREE.Vector3;
  toOffset: THREE.Vector3;
  t: number;
  duration: number;
  /** Follow mode: endpoints are relative to the van. */
  relativeTo?: string;
}

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _shift = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const BOUNDS = { minX: -17000, maxX: 8000, minZ: -11000, maxZ: 6000 };

interface CameraControllerProps {
  ref?: Ref<CameraControllerHandle>;
  instant?: boolean;
  onInteract?: () => void;
  /** Play the establishing shot (high over Berlin → the warehouse) on mount. */
  intro?: boolean;
}

/** Seconds of no input before the camera starts its slow ambient orbit. */
const IDLE_DRIFT_AFTER = 12;
const DRIFT_RAD_PER_S = 0.018;

/**
 * Orbit/pan/zoom with sensible limits plus animated presets, a chase-cam
 * "follow vehicle" mode and the inside tour. Also publishes per-frame camera
 * metrics (distance, metres-per-pixel) and adapts the clipping planes so the
 * scene works from a worker's shoulder to all of Berlin.
 */
export function CameraController({ ref, instant = false, onInteract, intro = false }: CameraControllerProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const flight = useRef<Flight | null>(null);
  const following = useRef<string | null>(null);
  const lastVanPos = useRef(new THREE.Vector3());
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  /** The camera bound to the controls (avoids mutating a hook return value). */
  const cam = () => controls.current?.object as THREE.PerspectiveCamera | undefined;

  const idle = useRef(0);
  const drift = useRef(true);

  const start = (toTarget: THREE.Vector3, toOffset: THREE.Vector3, relativeTo?: string, duration?: number) => {
    const c = controls.current;
    const camera = cam();
    if (!c || !camera) return;
    const fromTarget = c.target.clone();
    const fromOffset = camera.position.clone().sub(fromTarget);
    if (instant) {
      const base = relativeTo ? (vanRegistry.get(relativeTo)?.position.clone() ?? new THREE.Vector3()) : new THREE.Vector3();
      c.target.copy(toTarget).add(base);
      camera.position.copy(c.target).add(toOffset);
      c.update();
      return;
    }
    const dist = Math.abs(Math.log(toOffset.length() / Math.max(1, fromOffset.length())));
    flight.current = {
      fromTarget,
      fromOffset,
      toTarget,
      toOffset,
      t: 0,
      duration: duration ?? THREE.MathUtils.clamp(1.1 + dist * 0.35, 1.1, 2.6),
      relativeTo,
    };
  };

  // Establishing shot: start high over Berlin, descend onto the warehouse.
  useEffect(() => {
    const c = controls.current;
    const camera = cam();
    if (!intro || instant || !c || !camera) return;
    const v = CAMERA_VIEWS[DEFAULT_VIEW];
    const target = new THREE.Vector3(...v.target);
    camera.position.set(target.x - 900, 2600, target.z + 2100);
    c.target.copy(target).add(new THREE.Vector3(0, 0, -300));
    c.update();
    start(target, new THREE.Vector3(...v.position).sub(target), undefined, 4.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const flyTo = (pos: Vec3, target: Vec3) => {
    following.current = null;
    const t = new THREE.Vector3(...target);
    start(t, new THREE.Vector3(...pos).sub(t));
  };

  useImperativeHandle(ref, () => ({
    goTo: (view) => {
      drift.current = view === "overview" || view === "warehouse";
      idle.current = 0;
      flyTo(CAMERA_VIEWS[view].position, CAMERA_VIEWS[view].target);
    },
    inside: (stop) => {
      drift.current = false;
      flyTo(INSIDE_VIEWS[stop].position, INSIDE_VIEWS[stop].target);
    },
    reset: () => {
      drift.current = true;
      idle.current = 0;
      flyTo(CAMERA_VIEWS[DEFAULT_VIEW].position, CAMERA_VIEWS[DEFAULT_VIEW].target);
    },
    follow: (vanId) => {
      drift.current = false;
      following.current = vanId;
      const van = vanId ? vanRegistry.get(vanId) : null;
      if (!van) return;
      lastVanPos.current.copy(van.position);
      // High chase position (≈55° pitch): behind and slightly to the side, high
      // enough to stay clear of Berlin's 5–6 storey blocks along the route.
      const h = van.rotation.y;
      const back = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(-34);
      const side = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)).multiplyScalar(12);
      start(new THREE.Vector3(0, 1.5, 0), back.add(side).add(new THREE.Vector3(0, 54, 0)), vanId ?? undefined);
    },
    focus: (target, distance = 220) => {
      const t = new THREE.Vector3(...target);
      flyTo([t.x + distance * 0.45, distance * 0.75, t.z + distance * 0.62], target);
    },
    focusBranch: (branchId) => {
      const b = branchRegistry.get(branchId);
      if (!b) return;
      const [mx, mz] = b.facadeMid;
      const [nx, nz] = b.normal;
      // Try viewpoints fanning out from the shopfront and keep the first one
      // with a clear line of sight (Berlin blocks across narrow streets often
      // hide a straight-on view).
      const target = new THREE.Vector3(mx + nx * 0.6, 2.5, mz + nz * 0.6);
      const blockers: THREE.Object3D[] = [];
      scene.traverse((o) => {
        if (o.name === "city-buildings") blockers.push(o);
      });
      const ray = new THREE.Raycaster();
      const dir = new THREE.Vector3();
      let chosen: THREE.Vector3 | null = null;
      search: for (const up of [48, 66, 90, 120, 150]) {
        for (const deg of [30, -30, 0, 55, -55, 80, -80]) {
          const a = (deg * Math.PI) / 180;
          const cx = nx * Math.cos(a) - nz * Math.sin(a);
          const cz = nx * Math.sin(a) + nz * Math.cos(a);
          const pos = new THREE.Vector3(mx + cx * 80, up, mz + cz * 80);
          dir.copy(target).sub(pos);
          const dist = dir.length();
          ray.set(pos, dir.normalize());
          ray.far = dist - 1.5;
          if (ray.intersectObjects(blockers, false).length === 0) {
            chosen = pos;
            break search;
          }
        }
      }
      chosen ??= new THREE.Vector3(mx + nx * 30, 110, mz + nz * 30);
      flyTo(chosen.toArray() as Vec3, target.toArray() as Vec3);
    },
    zoom: (factor) => {
      const c = controls.current;
      const camera = cam();
      if (!c || !camera) return;
      const offset = camera.position.clone().sub(c.target).multiplyScalar(factor);
      start(c.target.clone(), offset);
    },
  }));

  useFrame((state, dt) => {
    const c = controls.current;
    const camera = state.camera as THREE.PerspectiveCamera;
    if (!c) return;
    const d = Math.min(dt, 0.05);

    // Follow: carry the camera along with the van.
    const van = following.current ? vanRegistry.get(following.current) : null;
    if (van) {
      _shift.copy(van.position).sub(lastVanPos.current);
      if (_shift.lengthSq() < 250000 && !flight.current) {
        c.target.add(_shift);
        camera.position.add(_shift);
      }
      lastVanPos.current.copy(van.position);
    }

    const f = flight.current;
    if (f) {
      f.t = Math.min(1, f.t + d / f.duration);
      const k = ease(f.t);
      const base = f.relativeTo ? (vanRegistry.get(f.relativeTo)?.position ?? _b.set(0, 0, 0)) : _b.set(0, 0, 0);
      _a.copy(f.toTarget).add(base);
      c.target.lerpVectors(f.fromTarget, _a, k);
      // Direction slerp + log-distance interpolation reads well across scales.
      const la = f.fromOffset.length();
      const lb = f.toOffset.length();
      const len = Math.exp(THREE.MathUtils.lerp(Math.log(la), Math.log(lb), k));
      _q.setFromUnitVectors(_a.copy(f.fromOffset).normalize(), _b.copy(f.toOffset).normalize());
      const dir = f.fromOffset.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(_q, k));
      camera.position.copy(c.target).addScaledVector(dir, len);
      c.update();
      if (f.t >= 1) {
        flight.current = null;
        if (van) lastVanPos.current.copy(van.position);
      }
    }

    // Ambient drift: a barely perceptible orbit once the user has been idle.
    idle.current += d;
    if (!instant && drift.current && !f && !van && idle.current > IDLE_DRIFT_AFTER) {
      const ramp = Math.min(1, (idle.current - IDLE_DRIFT_AFTER) / 3);
      _shift.copy(camera.position).sub(c.target).applyAxisAngle(_up, DRIFT_RAD_PER_S * ramp * d);
      camera.position.copy(c.target).add(_shift);
      c.update();
    }

    // Publish metrics.
    const dist = camera.position.distanceTo(c.target);
    sceneMetrics.distance = dist;
    sceneMetrics.target.copy(c.target);
    const mpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, size.height);
    sceneMetrics.metersPerPx = mpp;
    sharedUniforms.uMetersPerPx.value = mpp;
    sharedUniforms.uTime.value = state.clock.elapsedTime;

    // Adaptive clipping planes (no log depth buffer needed).
    const near = THREE.MathUtils.clamp(dist * 0.006, 0.2, 80);
    const far = dist * 30 + 6000;
    if (Math.abs(camera.near - near) / near > 0.15 || Math.abs(camera.far - far) / far > 0.15) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  });

  const clampPan = () => {
    const c = controls.current;
    const camera = cam();
    if (!c || !camera) return;
    const t = c.target;
    const cx = THREE.MathUtils.clamp(t.x, BOUNDS.minX, BOUNDS.maxX);
    const cz = THREE.MathUtils.clamp(t.z, BOUNDS.minZ, BOUNDS.maxZ);
    const cy = THREE.MathUtils.clamp(t.y, 0, 12);
    if (cx !== t.x || cz !== t.z || cy !== t.y) {
      _shift.set(cx - t.x, cy - t.y, cz - t.z);
      t.add(_shift);
      camera.position.add(_shift);
    }
  };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={CAMERA_VIEWS[DEFAULT_VIEW].target}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={1.0}
      panSpeed={1.0}
      minDistance={4}
      maxDistance={32000}
      minPolarAngle={0.05}
      maxPolarAngle={1.36}
      screenSpacePanning={false}
      onStart={() => {
        flight.current = null;
        idle.current = 0;
        drift.current = false;
        onInteract?.();
      }}
      onChange={clampPan}
    />
  );
}
