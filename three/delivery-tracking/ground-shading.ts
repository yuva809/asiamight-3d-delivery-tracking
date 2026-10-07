import type * as THREE from "three";

export interface GroundNoiseOptions {
  /** Noise frequency in cycles per metre. */
  scale?: number;
  /** Brightness variation (0..1). */
  strength?: number;
  /** Paving/slab joint spacing in metres (0 = none). */
  joints?: number;
  /** Joint darkness (0..1). */
  jointStrength?: number;
  /** Fade the detail out beyond this camera distance (m) to avoid shimmer. */
  fadeFar?: number;
}

const NOISE_GLSL = /* glsl */ `
varying vec3 vGWorld;
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/**
 * Procedural world-space surface detail for flat ground materials: asphalt
 * grain, concrete mottling and slab/paving joints. No textures, no UVs,
 * correct at any zoom (detail fades with distance).
 */
export function withGroundNoise<T extends THREE.Material>(material: T, opts: GroundNoiseOptions = {}): T {
  const { scale = 0.3, strength = 0.08, joints = 0, jointStrength = 0.12, fadeFar = 260 } = opts;
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader =
      "varying vec3 vGWorld;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader =
      NOISE_GLSL +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          float gd = length(vGWorld - cameraPosition);
          float gfade = 1.0 - smoothstep(${(fadeFar * 0.35).toFixed(1)}, ${fadeFar.toFixed(1)}, gd);
          vec2 gp = vGWorld.xz;
          float n = gNoise(gp * ${scale.toFixed(3)}) * 0.55 + gNoise(gp * ${(scale * 4.7).toFixed(3)}) * 0.3 + gNoise(gp * ${(scale * 19.0).toFixed(3)}) * 0.15;
          diffuseColor.rgb *= 1.0 + (n - 0.5) * ${strength.toFixed(3)} * 2.0 * gfade;
          ${
            joints > 0
              ? `vec2 gj = abs(fract(gp / ${joints.toFixed(2)} + 0.5) - 0.5) * ${joints.toFixed(2)};
          float gl = 1.0 - smoothstep(0.015, 0.045, min(gj.x, gj.y));
          diffuseColor.rgb *= 1.0 - gl * ${jointStrength.toFixed(3)} * gfade;`
              : ""
          }
        }`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ""}|gn:${scale}:${strength}:${joints}:${jointStrength}:${fadeFar}`;
  material.needsUpdate = true;
  return material;
}
