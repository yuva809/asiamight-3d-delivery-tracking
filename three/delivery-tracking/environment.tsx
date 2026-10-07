"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { fx } from "./debug-flags";
import { sceneMetrics } from "./scene-metrics";
import { useQuality } from "./perf/quality";
import { useSceneSettings } from "./scene-settings";

/** Horizon haze colour — background, fog and sky dome all meet here. */
export const SCENE_BACKGROUND = "#efece6";
const ZENITH = "#c7d6e6";

/**
 * Late-afternoon sun from the south-west: long, soft shadows give the scene
 * depth; warm key light against a cool sky fill gives colour contrast.
 */
const SUN_DIR = new THREE.Vector3(-0.62, 0.58, 0.53).normalize();

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: new THREE.Color(SCENE_BACKGROUND) },
          uZenith: { value: new THREE.Color(ZENITH) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position = p.xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uHorizon;
          uniform vec3 uZenith;
          varying vec3 vDir;
          void main() {
            float h = clamp(vDir.y, 0.0, 1.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  const ref = useRef<THREE.Mesh>(null);
  // Follow the camera so the dome is always "at infinity".
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={mat} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}

export function SceneLighting() {
  const { lowPower } = useSceneSettings();
  const q = useQuality();
  const sun = useRef<THREE.DirectionalLight>(null);
  const fog = useRef<THREE.Fog>(null);

  // Changing mapSize only takes effect once the old shadow target is freed.
  useEffect(() => {
    const l = sun.current;
    if (!l?.shadow.map) return;
    l.shadow.map.dispose();
    l.shadow.map = null;
  }, [q.shadowMapSize]);

  useFrame(() => {
    const l = sun.current;
    const d = sceneMetrics.distance;
    const t = sceneMetrics.target;
    if (l) {
      // Shadow frustum tracks the camera target: crisp at the dock, still
      // present at the overview, cheap at city scale.
      const reach = THREE.MathUtils.clamp(d * 0.7, 40, 600);
      l.position.copy(t).addScaledVector(SUN_DIR, reach * 2.4);
      l.target.position.copy(t);
      l.target.updateMatrixWorld();
      const cam = l.shadow.camera;
      if (Math.abs(cam.right - reach) > reach * 0.05) {
        cam.left = -reach;
        cam.right = reach;
        cam.top = reach;
        cam.bottom = -reach;
        cam.near = 1;
        cam.far = reach * 6;
        cam.updateProjectionMatrix();
      }
      l.shadow.bias = -0.0002 * Math.max(1, reach / 100);
    }
    if (fog.current) {
      // Atmospheric perspective: the city recedes, the site stays crisp.
      fog.current.near = d * 1.6 + 120;
      fog.current.far = d * 5.5 + 1400;
    }
  });

  return (
    <>
      <color attach="background" args={[SCENE_BACKGROUND]} />
      <fog ref={fog} attach="fog" args={[SCENE_BACKGROUND, 400, 2400]} />
      <SkyDome />
      <hemisphereLight args={["#dfe8f3", "#cbbfaa", 0.75]} />
      <directionalLight
        ref={sun}
        intensity={2.5}
        color="#ffe9cf"
        castShadow={!lowPower && !fx("noshadow")}
        shadow-mapSize={[q.shadowMapSize, q.shadowMapSize]}
        shadow-normalBias={0.035}
        shadow-radius={3}
      />
      {/* PCSS soft shadows removed: they patched every lit shader with a
          16-tap blocker search — the single costliest per-pixel term. PCF
          ("percentage" shadows) + the radius below keeps a soft edge. */}
      <Environment resolution={128} frames={1} environmentIntensity={0.5}>
        <Lightformer form="rect" intensity={1.4} color="#ffffff" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffe6c8" position={[-6, 2.5, 5]} scale={[7, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#dfe9ff" position={[6, 2, -4]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.25} color="#e8e2d8" position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[12, 12, 1]} />
      </Environment>
    </>
  );
}
