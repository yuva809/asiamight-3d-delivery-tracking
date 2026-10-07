"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Polyline } from "@/features/delivery-tracking/route-math";
import { BEACON_COLORS, type VanVisual } from "@/features/delivery-tracking/status-visuals";
import type { Vec3 } from "@/features/delivery-tracking/types";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GEO, MAT, PALETTE } from "./materials";
import { SceneLabel } from "./scene-label";
import { sceneMetrics } from "./scene-metrics";
import { useSceneSettings } from "./scene-settings";
import { useSignTexture } from "./sign-texture";
import { perfCount } from "./perf/perf-store";
import { useVanMotion } from "./use-van-motion";
import { vanRegistry } from "./van-registry";

// ---------------- geometry (built once) ----------------
const L = 5.93;
const W = 2.02;

/** High-roof panel van side profile (x = length from rear, y = height). */
const bodyGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, 0.45);
  s.lineTo(0, 2.42);
  s.quadraticCurveTo(0, 2.6, 0.2, 2.6);
  s.lineTo(3.75, 2.6);
  s.quadraticCurveTo(4.25, 2.6, 4.42, 2.38);
  s.lineTo(5.12, 1.42);
  s.quadraticCurveTo(5.2, 1.3, 5.4, 1.25);
  s.lineTo(5.78, 1.14);
  s.quadraticCurveTo(5.93, 1.08, 5.93, 0.92);
  s.lineTo(5.93, 0.62);
  s.quadraticCurveTo(5.93, 0.45, 5.78, 0.45);
  s.lineTo(0, 0.45);
  const g = new THREE.ExtrudeGeometry(s, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 });
  g.rotateY(-Math.PI / 2);
  g.translate((W - 0.12) / 2, 0, -L / 2);
  g.computeVertexNormals();
  return g;
})();
const ringGeo = new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2);

// ---- Static van parts merged by material (shared by every van) ----
type V3 = [number, number, number];
function piece(g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], color?: string) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
  const out = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
  if (color) {
    const c = new THREE.Color(color);
    const n = out.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  return out;
}
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts, false)!;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE_LIVERY = new THREE.PlaneGeometry(3.7, 1.62);
const PLANE_PLATE = new THREE.PlaneGeometry(0.52, 0.115);
const archGeoSrc = new THREE.TorusGeometry(0.47, 0.055, 6, 18, Math.PI);
const SIDES = [-1, 1] as const;
const AXLES = [-1.95, 1.75] as const;

const TRIM_GEO = merge([
  piece(BOX, [0, 0.55, 0], undefined, [W + 0.04, 0.22, L - 0.1]),
  ...SIDES.map((s) => piece(BOX, [s * (W / 2 + 0.014), 1.5, 1.2], undefined, [0.01, 1.8, 0.03])),
  ...SIDES.map((s) => piece(BOX, [s * (W / 2 + 0.16) - s * 0.08, 1.75, L / 2 - 1.55], undefined, [0.06, 0.06, 0.18])),
  ...SIDES.map((s) => piece(BOX, [s * (W / 2 + 0.16), 1.85, L / 2 - 1.55], undefined, [0.1, 0.32, 0.18])),
  piece(BOX, [0, 0.88, L / 2 + 0.01], undefined, [1.1, 0.32, 0.04]),
  ...AXLES.flatMap((z) => SIDES.map((s) => piece(archGeoSrc, [s * (W / 2 + 0.012), 0.37, z], [0, Math.PI / 2, 0]))),
  piece(BOX, [0, 0.5, L / 2 + 0.02], undefined, [W + 0.06, 0.24, 0.16]),
  piece(BOX, [0, 0.5, -L / 2 - 0.04], undefined, [W + 0.04, 0.22, 0.14]),
]);
const SLATS_GEO = merge([0.8, 0.88, 0.96].map((y) => piece(BOX, [0, y, L / 2 + 0.035], undefined, [1.02, 0.025, 0.02])));
const GLASS_GEO = merge([
  piece(BOX, [0, 1.92, L / 2 - 1.17], [-0.64, 0, 0], [W - 0.22, 1.2, 0.04]),
  ...SIDES.map((s) => piece(BOX, [s * (W / 2 + 0.005), 1.92, L / 2 - 1.75], undefined, [0.03, 0.78, 0.82])),
]);
const HEAD_GEO = merge([-0.72, 0.72].map((x) => piece(BOX, [x, 1.02, L / 2 - 0.08], [-0.25, 0, 0], [0.42, 0.14, 0.06])));
const TAIL_GEO = merge(SIDES.map((s) => piece(BOX, [s * (W / 2 - 0.05), 1.1, -L / 2 - 0.03], undefined, [0.1, 0.55, 0.05])));
const LIVERY_GEO = merge(SIDES.map((s) => piece(PLANE_LIVERY, [s * (W / 2 + 0.012), 1.62, -0.88], [0, (s * Math.PI) / 2, 0])));
const PLATE_GEO = merge([piece(PLANE_PLATE, [0, 0.52, L / 2 + 0.105]), piece(PLANE_PLATE, [0, 0.62, -L / 2 - 0.115], [0, Math.PI, 0])]);
const CARGO_GEO = merge([
  piece(BOX, [-0.45, 0.95, -1.6], undefined, [0.7, 0.55, 0.9]),
  piece(BOX, [0.4, 1.0, -1.4], undefined, [0.6, 0.65, 0.8]),
  piece(BOX, [0, 1.55, -1.0], undefined, [0.8, 0.45, 0.7]),
]);
/** Door = panel + chili stripe as one vertex-coloured mesh; x sign = hinge side. */
const doorGeo = (sx: 1 | -1) =>
  merge([
    piece(BOX, [sx * 0.49, 0, -0.03], undefined, [0.97, 1.9, 0.05], "#fbfbf9"),
    piece(BOX, [sx * 0.49, -0.62, -0.06], undefined, [0.97, 0.22, 0.02], PALETTE.chili),
  ]);
const DOOR_L_GEO = doorGeo(1);
const DOOR_R_GEO = doorGeo(-1);
/** Wheel = tyre + rim + hub cap as one vertex-coloured mesh. */
const WHEEL_GEO = merge([
  piece(new THREE.CylinderGeometry(0.37, 0.37, 0.26, 20), [0, 0, 0], [0, 0, Math.PI / 2], undefined, "#27292d"),
  piece(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 14), [0, 0, 0], [0, 0, Math.PI / 2], undefined, "#c9ccd1"),
  ...SIDES.map((s) => piece(BOX, [s * 0.1, 0, 0], undefined, [0.29 * 0.4, 0.34, 0.05], "#2a2d32")),
]);
const doorMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });

const paint = new THREE.MeshPhysicalMaterial({ color: "#fbfbf9", roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
const trim = new THREE.MeshStandardMaterial({ color: "#2a2d32", roughness: 0.8 });
const rimMat = new THREE.MeshStandardMaterial({ color: "#c9ccd1", roughness: 0.3, metalness: 0.8 });

/** Livery: red sweep, wordmark and tagline. Drawn once per page. */
let liveryTex: THREE.CanvasTexture | null = null;
function livery() {
  if (liveryTex) return liveryTex;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 448;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const display = `${css.getPropertyValue("--font-display").trim() || "system-ui"}, system-ui, sans-serif`;
  const body = `${css.getPropertyValue("--font-body").trim() || "system-ui"}, system-ui, sans-serif`;
  const draw = () => {
    g.clearRect(0, 0, 1024, 448);
    g.fillStyle = "#fbfbf9";
    g.fillRect(0, 0, 1024, 448);
    // Sweep
    g.fillStyle = PALETTE.chili;
    g.beginPath();
    g.moveTo(0, 448);
    g.lineTo(0, 330);
    g.bezierCurveTo(300, 300, 640, 260, 1024, 120);
    g.lineTo(1024, 448);
    g.closePath();
    g.fill();
    g.fillStyle = "#b93a25";
    g.beginPath();
    g.moveTo(0, 448);
    g.lineTo(0, 395);
    g.bezierCurveTo(360, 370, 700, 330, 1024, 230);
    g.lineTo(1024, 448);
    g.closePath();
    g.fill();
    // Mark + wordmark
    g.fillStyle = PALETTE.chili;
    g.beginPath();
    g.roundRect(56, 70, 120, 120, 28);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = `800 86px ${display}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("A", 116, 136);
    g.textAlign = "left";
    g.fillStyle = "#1d1b18";
    g.font = `700 108px ${display}`;
    g.fillText("AsiaMight", 205, 132);
    g.fillStyle = "#5b5344";
    g.font = `600 34px ${body}`;
    g.fillText("Fresh Asian groceries · Berlin", 210, 215);
  };
  draw();
  liveryTex = new THREE.CanvasTexture(c);
  liveryTex.colorSpace = THREE.SRGBColorSpace;
  liveryTex.anisotropy = 8;
  document.fonts?.ready.then(() => {
    draw();
    if (liveryTex) liveryTex.needsUpdate = true;
  });
  return liveryTex;
}

export interface DeliveryVanProps {
  id: string;
  label: string;
  /** Registration shown on the number plates. */
  plateText: string;
  /** Status visuals derived by status-visuals.ts. */
  visual: VanVisual;
  /** Static pose (dock / parking). */
  position: Vec3;
  rotation: number;
  /** Phase 3: live position to ease toward. */
  targetPosition?: Vec3;
  /** Route + progress while ON_ROUTE. */
  route?: Polyline;
  progress?: number;
  speed?: number;
  subtitle: string;
  selected: boolean;
  onSelect: (id: string) => void;
}

/**
 * AsiaMight delivery van. Local forward is +z; the rear doors are at -z so a
 * van "backs onto" a dock with heading 0 on the site's south wall.
 */
export const DeliveryVan = memo(function DeliveryVan(props: DeliveryVanProps) {
  const { id, label, plateText, visual, position, rotation, targetPosition, route, progress, speed, subtitle, selected, onSelect } = props;
  const { animate } = useSceneSettings();
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  const liveryMat = useMemo(() => new THREE.MeshStandardMaterial({ map: livery(), roughness: 0.35, metalness: 0.05 }), []);
  const beaconMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false }), []);
  useEffect(
    () => () => {
      liveryMat.dispose();
      beaconMat.dispose();
      ringMat.dispose();
    },
    [liveryMat, beaconMat, ringMat],
  );

  useEffect(() => {
    const g = root.current;
    if (!g) return;
    vanRegistry.set(id, g);
    return () => {
      vanRegistry.delete(id);
    };
  }, [id]);

  const { speed: speedRef, accel: accelRef } = useVanMotion(root, { position, rotation, targetPosition, route, progress, speed, animate });
  const plate = useSignTexture({ title: plateText, background: "#f7f7f2", foreground: "#15171a", width: 512, height: 112 });
  const plateMat = useMemo(() => new THREE.MeshStandardMaterial({ map: plate, roughness: 0.4 }), [plate]);
  useEffect(() => () => plateMat.dispose(), [plateMat]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const beacon = BEACON_COLORS[visual.beacon];
    beaconMat.color.set(beacon);
    beaconMat.emissive.set(beacon);
    const blink = visual.beacon === "amber" ? (Math.sin(t * 6) > 0 ? 1 : 0.15) : visual.beacon === "neutral" ? 0 : 0.9;
    beaconMat.emissiveIntensity = animate ? blink : 0.6;
    ringMat.color.set(selected ? PALETTE.chili : beacon);
    ringMat.opacity = selected ? 0.85 : visual.beacon === "neutral" ? 0.25 : 0.55;

    if (body.current) {
      // Engine idle when docked; road texture when driving; suspension pitch
      // from longitudinal acceleration (nose up pulling away, dips braking).
      const idle = visual.motion === "docked" ? Math.sin(t * 24 + position[0]) * 0.004 : 0;
      const road = visual.motion === "driving" ? Math.sin(t * 9) * 0.006 + Math.sin(t * 3.1) * 0.004 : 0;
      body.current.position.y = animate ? idle + road : 0;
      const pitch = THREE.MathUtils.clamp(-accelRef.current * 0.012, -0.035, 0.035);
      body.current.rotation.x = animate ? THREE.MathUtils.damp(body.current.rotation.x, pitch, 5, Math.min(dt, 0.05)) : 0;
    }
    perfCount("vans");
    if (wheels.current && speedRef.current > 0.05) {
      wheels.current.children.forEach((w) => (w.rotation.x += (speedRef.current * Math.min(dt, 0.05)) / 0.37));
    }
    const open = visual.doorsOpen ? 1.9 : 0;
    const dd = Math.min(dt, 0.05);
    if (doorL.current) doorL.current.rotation.y = animate ? THREE.MathUtils.damp(doorL.current.rotation.y, -open, 3, dd) : -open;
    if (doorR.current) doorR.current.rotation.y = animate ? THREE.MathUtils.damp(doorR.current.rotation.y, open, 3, dd) : open;
    if (ring.current) ring.current.scale.setScalar(Math.max(3.6, 9 * sceneMetrics.metersPerPx));
  });

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <mesh ref={ring} geometry={ringGeo} material={ringMat} position={[0, 0.16, 0]} renderOrder={4} />
      <group ref={body}>
        {/* ~13 draw calls per van: static parts merged by material. */}
        <mesh geometry={bodyGeo} material={paint} castShadow receiveShadow />
        <mesh geometry={TRIM_GEO} material={trim} castShadow />
        <mesh geometry={SLATS_GEO} material={rimMat} />
        <mesh geometry={GLASS_GEO} material={MAT.glass} />
        <mesh geometry={HEAD_GEO} material={MAT.headlight} />
        <mesh geometry={TAIL_GEO} material={MAT.taillight} />
        <mesh geometry={LIVERY_GEO} material={liveryMat} />
        <mesh geometry={PLATE_GEO} material={plateMat} />
        <group ref={doorL} position={[-W / 2 + 0.02, 1.48, -L / 2 - 0.02]}>
          <mesh geometry={DOOR_L_GEO} material={doorMat} castShadow />
        </group>
        <group ref={doorR} position={[W / 2 - 0.02, 1.48, -L / 2 - 0.02]}>
          <mesh geometry={DOOR_R_GEO} material={doorMat} castShadow />
        </group>
        {visual.doorsOpen && <mesh geometry={CARGO_GEO} material={MAT.kraft} />}
        <mesh position={[0, 2.66, 1.2]} scale={[1.0, 0.1, 0.24]} geometry={GEO.box} material={beaconMat} />
      </group>
      <group ref={wheels}>
        {AXLES.flatMap((z) =>
          SIDES.map((s) => <mesh key={`${z}${s}`} position={[s * (W / 2 - 0.12), 0.37, z]} geometry={WHEEL_GEO} material={wheelMat} castShadow />),
        )}
      </group>
      <SceneLabel
        position={[0, 3.4, 0]}
        kind="van"
        title={label}
        subtitle={subtitle}
        accent={BEACON_COLORS[visual.beacon]}
        live={visual.motion === "driving"}
        maxDistance={visual.motion === "driving" ? Infinity : 900}
      />
    </group>
  );
});
