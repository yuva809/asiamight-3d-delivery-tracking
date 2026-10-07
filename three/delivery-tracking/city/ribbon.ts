import * as THREE from "three";
import type { Vec2 } from "@/features/delivery-tracking/types";
import { sharedUniforms } from "../scene-metrics";

export interface RibbonLine {
  points: Vec2[];
  /** Real half-width in metres. */
  half: number;
  /** Minimum on-screen width in pixels (keeps lines legible when zoomed out). */
  minPx: number;
}

/**
 * Builds one BufferGeometry for many polylines. Vertices sit on the centre
 * line; the shader pushes them sideways by max(realWidth, minPx·m/px), so a
 * road is true-to-scale up close and still a crisp line across all of Berlin.
 */
export function buildRibbonGeometry(lines: RibbonLine[], y: number): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const l of lines) {
    if (l.points.length < 2) continue;
    vCount += l.points.length * 2;
    iCount += (l.points.length - 1) * 6;
  }
  const pos = new Float32Array(vCount * 3);
  const side = new Float32Array(vCount * 2);
  const half = new Float32Array(vCount);
  const minPx = new Float32Array(vCount);
  const dist = new Float32Array(vCount);
  const normal = new Float32Array(vCount * 3);
  const index = new Uint32Array(iCount);

  let v = 0;
  let ii = 0;
  for (const l of lines) {
    const pts = l.points;
    const n = pts.length;
    if (n < 2) continue;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i];
      if (i > 0) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      // Perpendiculars of the adjacent segments.
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      let ax = 0;
      let az = 0;
      if (i > 0) {
        const dx = x - prev[0];
        const dz = z - prev[1];
        const len = Math.hypot(dx, dz) || 1;
        ax += -dz / len;
        az += dx / len;
      }
      if (i < n - 1) {
        const dx = next[0] - x;
        const dz = next[1] - z;
        const len = Math.hypot(dx, dz) || 1;
        ax += -dz / len;
        az += dx / len;
      }
      let mlen = Math.hypot(ax, az) || 1;
      ax /= mlen;
      az /= mlen;
      // Miter scale against one segment normal (clamped to avoid spikes).
      let refx = 0;
      let refz = 0;
      if (i < n - 1) {
        const dx = next[0] - x;
        const dz = next[1] - z;
        mlen = Math.hypot(dx, dz) || 1;
        refx = -dz / mlen;
        refz = dx / mlen;
      } else {
        const dx = x - prev[0];
        const dz = z - prev[1];
        mlen = Math.hypot(dx, dz) || 1;
        refx = -dz / mlen;
        refz = dx / mlen;
      }
      const scale = Math.min(2.5, 1 / Math.max(0.2, ax * refx + az * refz));
      for (const s of [-1, 1]) {
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        side[v * 2] = ax * scale * s;
        side[v * 2 + 1] = az * scale * s;
        half[v] = l.half;
        minPx[v] = l.minPx;
        dist[v] = acc;
        normal[v * 3 + 1] = 1;
        v++;
      }
      if (i < n - 1) {
        const a = v - 2;
        // Counter-clockwise seen from above (+y), so faces aren't culled.
        index[ii++] = a;
        index[ii++] = a + 1;
        index[ii++] = a + 2;
        index[ii++] = a + 1;
        index[ii++] = a + 3;
        index[ii++] = a + 2;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  g.setAttribute("aSide", new THREE.BufferAttribute(side, 2));
  g.setAttribute("aHalf", new THREE.BufferAttribute(half, 1));
  g.setAttribute("aMinPx", new THREE.BufferAttribute(minPx, 1));
  g.setAttribute("aDist", new THREE.BufferAttribute(dist, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  // Ribbons widen in the shader, so pad the bounds generously.
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 2000;
  return g;
}

const RIBBON_VERTEX_HEAD = /* glsl */ `
attribute vec2 aSide;
attribute float aHalf;
attribute float aMinPx;
attribute float aDist;
uniform float uMetersPerPx;
varying float vDist;
`;

const RIBBON_VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
float ribbonHalf = max(aHalf, aMinPx * uMetersPerPx * 0.5);
transformed.xz += aSide * ribbonHalf;
vDist = aDist;
`;

/** Lit ribbon (roads, rail, rivers). */
export function makeRibbonMaterial(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMetersPerPx = sharedUniforms.uMetersPerPx;
    shader.vertexShader = RIBBON_VERTEX_HEAD + shader.vertexShader.replace("#include <begin_vertex>", RIBBON_VERTEX_BODY);
  };
  m.customProgramCacheKey = () => "ribbon";
  return m;
}

/** Unlit animated route ribbon: soft base colour with travelling dashes. */
export function makeRouteMaterial(color: string, dash = "#ffffff", opacity = 0.95) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const dashColor = new THREE.Color(dash);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMetersPerPx = sharedUniforms.uMetersPerPx;
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uDash = { value: dashColor };
    shader.vertexShader = RIBBON_VERTEX_HEAD + shader.vertexShader.replace("#include <begin_vertex>", RIBBON_VERTEX_BODY);
    shader.fragmentShader =
      "uniform float uMetersPerPx;\nuniform float uTime;\nuniform vec3 uDash;\nvarying float vDist;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float period = max(14.0, uMetersPerPx * 26.0);
        float phase = fract((vDist - uTime * period * 0.9) / period);
        float dashMask = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.32, 0.4, phase));
        diffuseColor.rgb = mix(diffuseColor.rgb, uDash, dashMask * 0.85);`,
      );
  };
  m.customProgramCacheKey = () => `route-${dash}`;
  return m;
}
