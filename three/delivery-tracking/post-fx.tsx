"use client";

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { fx } from "./debug-flags";
import { useQuality } from "./perf/quality";

/**
 * Restrained "architectural visualisation" grade:
 *  - N8AO ambient occlusion in SCREEN-SPACE radius (pixels), so contact
 *    shadows read the same from a worker's shoulder to all of Berlin
 *  - bloom only above HDR 1.0 (lamps, headlights, dock lights — not walls)
 *  - SMAA, a soft vignette, ACES tone mapping
 * Quality: HIGH = full AO + bloom; MEDIUM = reduced AO, no bloom;
 * LOW = SMAA + tone mapping only (no expensive passes).
 */
export function PostFX() {
  const q = useQuality();
  if (fx("nopost")) return null;
  if (q.ao === "off" || fx("noao")) {
    return (
      <EffectComposer multisampling={0}>
        <SMAA />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        halfRes
        depthAwareUpsampling
        screenSpaceRadius
        aoRadius={38}
        distanceFalloff={0.35}
        intensity={2.4}
        aoSamples={q.ao === "full" ? 8 : 5}
        denoiseSamples={q.ao === "full" ? 4 : 2}
        denoiseRadius={q.ao === "full" ? 8 : 6}
        color="#1d1a24"
      />
      <Bloom
        intensity={q.bloom && !fx("nobloom") ? 0.55 : 0}
        luminanceThreshold={1.05} luminanceSmoothing={0.15} mipmapBlur radius={0.6} />
      <SMAA />
      <Vignette offset={0.32} darkness={0.42} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
