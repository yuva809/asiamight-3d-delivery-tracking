"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useQuality } from "./perf/quality";
import type { WorkerRole } from "@/features/delivery-tracking/types";
import type { WorkerRoutine, WorkerStep } from "@/features/delivery-tracking/worker-routines";
import { MAT, PALETTE } from "./materials";
import { perfCount } from "./perf/perf-store";
import { sceneMetrics } from "./scene-metrics";
import { useSceneSettings } from "./scene-settings";

/**
 * Rigged worker (Quaternius "Worker", CC0) with skeletal animation:
 * Idle / Walk / Interact / Run, cross-faded, plus a carry pose layered on top
 * of the walk cycle. Behaviour comes from routine data (worker-routines.ts).
 */
const MODEL = "/models/worker.glb";
useGLTF.preload(MODEL);

/** Visual style: a warehouse role, or a member of the public on the street. */
export type FigureStyle = WorkerRole | "pedestrian" | "pedestrianAlt";

interface Palette {
  vest: string;
  hat: string;
}
const STYLE: Record<FigureStyle, Palette> = {
  picker: { vest: "#f2a531", hat: "#f2c230" },
  loader: { vest: "#f2a531", hat: "#f2c230" },
  packer: { vest: PALETTE.chili, hat: "#f4f4f2" },
  supervisor: { vest: "#3f8a5f", hat: "#f4f4f2" },
  driver: { vest: PALETTE.chili, hat: "#2a2d33" },
  pedestrian: { vest: "#46566e", hat: "#3a2d22" },
  pedestrianAlt: { vest: "#b9a98c", hat: "#5a4632" },
};

type Clip = "Idle" | "IdleNeutral" | "Walk" | "Interact" | "Run" | "Wave";
const WALK_SPEED = 1.25;
/** Ground speed (m/s) the Walk clip is authored for at timeScale 1. */
const CLIP_WALK_SPEED = 1.35;
const FADE = 0.3;

const _dir = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _side = new THREE.Vector3();

function dampAngle(current: number, target: number, lambda: number, dt: number) {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return current + diff * (1 - Math.exp(-lambda * dt));
}

/** Rotate `bone` (in world space) so its child direction points along `want`, blended by `w`. */
function aimBone(bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3, w: number) {
  if (w <= 0.001 || !bone.parent) return;
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  const have = _b.sub(_a).normalize();
  _q.setFromUnitVectors(have, want);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  _qw.premultiply(_qp);
  bone.quaternion.slerp(_qw, w);
  bone.updateMatrixWorld(true);
}

/**
 * One merged, vertex-coloured SkinnedMesh per role (built once, shared by all
 * clones): the source model is ~13 skinned primitives (one per material),
 * which would be 13 draw calls + 13 shadow draws per character.
 */
const templates = new WeakMap<object, Map<FigureStyle, THREE.Object3D>>();
function roleTemplate(source: THREE.Object3D, role: FigureStyle): THREE.Object3D {
  let byRole = templates.get(source);
  if (!byRole) templates.set(source, (byRole = new Map()));
  const cached = byRole.get(role);
  if (cached) return cached;

  const root = cloneSkinned(source);
  const palette = STYLE[role];
  const parts: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) parts.push(o as THREE.SkinnedMesh);
  });
  const first = parts[0];
  const sameBind = parts.every((p) => p.skeleton === first.skeleton && p.bindMatrix.equals(first.bindMatrix));
  if (!first || !sameBind) {
    byRole.set(role, root);
    return root;
  }
  const geos = parts.map((p) => {
    const g = p.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "skinIndex", "skinWeight"].includes(k)) g.deleteAttribute(k);
    const m = p.material as THREE.MeshStandardMaterial;
    const c = new THREE.Color(m.name === "Worker_Vest" ? palette.vest : m.name === "Worker_Yellow" ? palette.hat : m.color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g.index ? g : g;
  });
  const allIndexed = geos.every((g) => g.index);
  const merged = mergeGeometries(allIndexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!merged) {
    byRole.set(role, root);
    return root;
  }
  const mesh = new THREE.SkinnedMesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  mesh.name = "worker-body";
  mesh.bind(first.skeleton, first.bindMatrix);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  first.parent!.add(mesh);
  for (const p of parts) p.removeFromParent();
  byRole.set(role, root);
  return root;
}

const cartonGeo = new THREE.BoxGeometry(0.44, 0.32, 0.36);
const tapeGeo = new THREE.BoxGeometry(0.45, 0.07, 0.37);

export interface WorkerProps {
  role: FigureStyle;
  routine: WorkerRoutine;
  /** Seed for animation phase. */
  seed?: number;
  /**
   * Only workers relevant to the current operation animate; the rest hold a
   * static idle pose (no mixer updates, no routine stepping).
   */
  active?: boolean;
  /** Hide + stop updating when the camera's focus is further than this (m). */
  cullDistance?: number;
}

const _wp = new THREE.Vector3();
const _upperWant = new THREE.Vector3();
const _lowerWant = new THREE.Vector3();
const _down = new THREE.Vector3(0, -0.8, 0);
const _lift = new THREE.Vector3(0, 0.15, 0);

export const Worker = memo(function Worker({ role, routine, seed = 0, active = true, cullDistance = 420 }: WorkerProps) {
  const { animate } = useSceneSettings();
  const gltf = useGLTF(MODEL);
  const root = useRef<THREE.Group>(null);
  const carton = useRef<THREE.Group>(null);

  // Per-instance clone of the shared role template: bones are cloned, the
  // merged geometry and material are shared (no per-worker GPU resources).
  const characterShadows = useQuality().characterShadows;
  const rig = useMemo(() => {
    const model = cloneSkinned(roleTemplate(gltf.scene, role)) as THREE.Group;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.frustumCulled = false;
        // Skinned shadow casters re-skin in the depth pass: only at HIGH/MEDIUM.
        mesh.castShadow = characterShadows;
      }
    });
    const find = (n: string) => model.getObjectByName(n);
    const bones = {
      upperL: find("UpperArmL"),
      upperR: find("UpperArmR"),
      lowerL: find("LowerArmL"),
      lowerR: find("LowerArmR"),
      wristL: find("WristL"),
      wristR: find("WristR"),
    };
    const mixer = new THREE.AnimationMixer(model);
    const actions = Object.fromEntries(
      gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]),
    ) as Record<Clip, THREE.AnimationAction>;
    return { model, bones, mixer, actions };
  }, [gltf, role, characterShadows]);

  // The frame loop drives the rig through a ref (never mutates render values).
  const rigRef = useRef(rig);
  useEffect(() => {
    rigRef.current = rig;
    return () => {
      rig.mixer.stopAllAction();
    };
  }, [rig]);

  const run = useRef({ index: 0, t: 0, carrying: !!routine.carrying, placed: false, clip: "" as Clip | "", carry: 0, posed: false });

  const play = (name: Clip, timeScale = 1) => {
    const r = run.current;
    const next = rigRef.current.actions[name];
    if (!next) return;
    next.timeScale = timeScale;
    if (r.clip === name) return;
    const prev = r.clip ? rigRef.current.actions[r.clip] : null;
    next.reset().setEffectiveWeight(1).fadeIn(prev ? FADE : 0).play();
    prev?.fadeOut(FADE);
    r.clip = name;
  };

  // (Re)start the routine when it changes; first mount places the worker.
  useLayoutEffect(() => {
    const r = run.current;
    if (!root.current) return;
    if (!r.placed) {
      root.current.position.set(routine.start[0], routine.floor, routine.start[1]);
      r.placed = true;
      rigRef.current.mixer.setTime(seed * 0.73);
    }
    r.index = 0;
    r.t = 0;
    r.carrying = !!routine.carrying;
  }, [routine, seed]);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const r = run.current;
    // Distance gating: far from the camera's focus → hidden and not updated.
    g.getWorldPosition(_wp);
    const far = sceneMetrics.distance > cullDistance * 2 || Math.hypot(_wp.x - sceneMetrics.target.x, _wp.z - sceneMetrics.target.z) > cullDistance;
    g.visible = !far;
    if (far) return;
    // Static workers: pose once, then cost nothing per frame.
    if (!active) {
      if (!r.posed) {
        play(seed % 2 === 0 ? "IdleNeutral" : "Idle");
        rigRef.current.mixer.update(0.4 + seed * 0.3);
        if (carton.current) carton.current.visible = false;
        r.posed = true;
      }
      return;
    }
    r.posed = false;
    const d = Math.min(dt, 0.05);
    const steps = routine.steps;
    const step: WorkerStep | undefined = steps[r.index];
    let moving = false;
    let clip: Clip = "IdleNeutral";
    let clipSpeed = 1;

    if (animate && step) {
      r.t += d;
      if (step.t === "walk") {
        _dir.set(step.to[0] - g.position.x, 0, step.to[1] - g.position.z);
        const dist = _dir.length();
        r.carrying = !!step.carry;
        if (dist < 0.04) {
          r.index++;
          r.t = 0;
        } else {
          moving = true;
          g.position.addScaledVector(_dir.normalize(), Math.min(dist, WALK_SPEED * d));
          g.rotation.y = dampAngle(g.rotation.y, Math.atan2(_dir.x, _dir.z), 9, d);
        }
      } else {
        if ("face" in step && step.face !== undefined) g.rotation.y = dampAngle(g.rotation.y, step.face, 7, d);
        if (r.t >= step.s) {
          if (step.t === "pick") r.carrying = true;
          if (step.t === "place") r.carrying = false;
          r.index++;
          r.t = 0;
        }
      }
      if (r.index >= steps.length) r.index = routine.loop ? 0 : steps.length - 1;
    }
    g.position.y = routine.floor;

    if (moving) {
      clip = "Walk";
      clipSpeed = WALK_SPEED / CLIP_WALK_SPEED;
    } else if (step?.t === "pick" || step?.t === "place") {
      clip = "Interact";
      clipSpeed = 0.9;
    } else if (step?.t === "pack") {
      clip = "Interact";
      clipSpeed = 0.7;
    } else {
      clip = seed % 2 === 0 ? "IdleNeutral" : "Idle";
    }
    play(clip, clipSpeed);
    const { mixer, bones } = rigRef.current;
    mixer.update(animate ? d : 0);
    perfCount(role.startsWith("pedestrian") ? "pedestrians" : "workers");

    // Carry: layer an arms-forward pose over the walk cycle (blended in/out).
    r.carry = THREE.MathUtils.damp(r.carry, r.carrying ? 1 : 0, 8, d);
    if (r.carry > 0.01) {
      g.updateMatrixWorld(true);
      // World-space facing (workers live inside the rotated site group).
      g.getWorldDirection(_fwd);
      _fwd.y = 0;
      _fwd.normalize();
      _side.set(_fwd.z, 0, -_fwd.x);
      for (const [upper, lower, wrist, s] of [
        [bones.upperL, bones.lowerL, bones.wristL, 1],
        [bones.upperR, bones.lowerR, bones.wristR, -1],
      ] as const) {
        if (!upper || !lower || !wrist) continue;
        _upperWant.copy(_fwd).multiplyScalar(0.55).add(_down).addScaledVector(_side, 0.12 * s).normalize();
        aimBone(upper, lower, _upperWant, r.carry);
        _lowerWant.copy(_fwd).multiplyScalar(0.9).add(_lift).addScaledVector(_side, -0.35 * s).normalize();
        aimBone(lower, wrist, _lowerWant, r.carry);
      }
    }
    if (carton.current) {
      carton.current.visible = r.carry > 0.5;
      carton.current.scale.setScalar(Math.max(0.001, (r.carry - 0.5) * 2));
    }
  });

  return (
    <group ref={root}>
      <primitive object={rig.model} />
      <group ref={carton} position={[0, 1.08, 0.36]} visible={false}>
        <mesh geometry={cartonGeo} material={MAT.kraft} castShadow />
        {routine.orderCarton && <mesh geometry={tapeGeo} material={MAT.chili} />}
      </group>
    </group>
  );
});
