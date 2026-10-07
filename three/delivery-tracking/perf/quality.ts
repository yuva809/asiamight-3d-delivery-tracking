"use client";

import { useSyncExternalStore } from "react";

/**
 * Rendering quality as one ladder. Stepping DOWN follows the agreed order:
 * resolution → post-processing → shadows → city detail → traffic.
 * HIGH / MEDIUM / LOW are named points on the ladder (manual override).
 */
export type QualityName = "HIGH" | "MEDIUM" | "LOW";

export interface QualityConfig {
  step: number;
  name: QualityName;
  dpr: number;
  /** Ambient occlusion: full, reduced (fewer samples), or off. */
  ao: "full" | "reduced" | "off";
  bloom: boolean;
  shadowMapSize: 2048 | 1024;
  /** Skinned characters + traffic cast shadows only at the top steps. */
  characterShadows: boolean;
  /** Reduced: branch-zone trees/cars hidden, warehouse zone thinned. */
  cityDetail: "full" | "reduced";
  traffic: number;
}

const LADDER: Omit<QualityConfig, "step">[] = [
  { name: "HIGH", dpr: 1.5, ao: "full", bloom: true, shadowMapSize: 2048, characterShadows: true, cityDetail: "full", traffic: 12 },
  { name: "HIGH", dpr: 1.25, ao: "full", bloom: true, shadowMapSize: 2048, characterShadows: true, cityDetail: "full", traffic: 12 },
  { name: "HIGH", dpr: 1, ao: "full", bloom: true, shadowMapSize: 2048, characterShadows: true, cityDetail: "full", traffic: 12 },
  { name: "MEDIUM", dpr: 1, ao: "reduced", bloom: false, shadowMapSize: 2048, characterShadows: true, cityDetail: "full", traffic: 12 },
  { name: "LOW", dpr: 1, ao: "off", bloom: false, shadowMapSize: 2048, characterShadows: true, cityDetail: "full", traffic: 12 },
  { name: "LOW", dpr: 1, ao: "off", bloom: false, shadowMapSize: 1024, characterShadows: false, cityDetail: "full", traffic: 12 },
  { name: "LOW", dpr: 1, ao: "off", bloom: false, shadowMapSize: 1024, characterShadows: false, cityDetail: "reduced", traffic: 12 },
  { name: "LOW", dpr: 0.85, ao: "off", bloom: false, shadowMapSize: 1024, characterShadows: false, cityDetail: "reduced", traffic: 5 },
];
export const MAX_STEP = LADDER.length - 1;
export const PRESET_STEP: Record<QualityName, number> = { HIGH: 1, MEDIUM: 3, LOW: 5 };

export type QualityMode = "auto" | "high" | "medium" | "low";

interface State {
  mode: QualityMode;
  step: number;
}

let state: State = { mode: "auto", step: PRESET_STEP.HIGH };
let config: QualityConfig = { ...LADDER[state.step], step: state.step };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const qualityStore = {
  get: () => config,
  getMode: () => state.mode,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setStep(step: number) {
    const s = Math.max(0, Math.min(MAX_STEP, step));
    if (s === state.step) return;
    state = { ...state, step: s };
    config = { ...LADDER[s], step: s };
    emit();
  },
  setMode(mode: QualityMode) {
    state = { ...state, mode };
    if (mode !== "auto") qualityStore.setStep(PRESET_STEP[mode.toUpperCase() as QualityName]);
    emit();
  },
  /** Start lower on weak devices. */
  init(lowPower: boolean) {
    if (lowPower) qualityStore.setStep(PRESET_STEP.LOW);
  },
};

export function useQuality(): QualityConfig {
  return useSyncExternalStore(qualityStore.subscribe, qualityStore.get, qualityStore.get);
}
export function useQualityMode(): QualityMode {
  return useSyncExternalStore(qualityStore.subscribe, qualityStore.getMode, qualityStore.getMode);
}
