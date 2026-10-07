/**
 * Frame statistics + per-frame activity counters, shared without React state.
 * Written by <PerfProbe> (inside the canvas), read by <PerfPanel> (DOM).
 */
export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  frameP95: number;
  cpuMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
  heapMB: number | null;
  quality: string;
  animated: Record<string, number>;
}

/** Components call `perfCount("workers")` once per frame they actually animate. */
const frameCounts: Record<string, number> = {};
export function perfCount(name: string, n = 1) {
  frameCounts[name] = (frameCounts[name] ?? 0) + n;
}
export function takeFrameCounts(): Record<string, number> {
  const out = { ...frameCounts };
  for (const k of Object.keys(frameCounts)) frameCounts[k] = 0;
  return out;
}

let snapshot: PerfSnapshot | null = null;
const listeners = new Set<() => void>();

export const perfStore = {
  get: () => snapshot,
  set(s: PerfSnapshot) {
    snapshot = s;
    if (typeof window !== "undefined") (window as unknown as { __amPerf?: PerfSnapshot }).__amPerf = s;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Show the panel in development, or anywhere with `?perf`. */
export const perfPanelEnabled = () =>
  process.env.NODE_ENV !== "production" ||
  (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("perf"));
