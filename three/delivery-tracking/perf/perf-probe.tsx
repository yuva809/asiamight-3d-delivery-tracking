"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { perfStore, takeFrameCounts } from "./perf-store";

const PUBLISH_MS = 500;

/**
 * Measures every frame without affecting rendering:
 *  - draw calls/triangles accumulated across ALL passes (shadow, AO, bloom…)
 *    by disabling renderer.info auto-reset and resetting once per frame
 *  - frame interval (FPS, p95) and main-thread CPU time per frame
 * Runs first in the frame (negative priority never takes over rendering).
 */
export function PerfProbe({ quality }: { quality: string }) {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ last: 0, intervals: [] as number[], cpu: [] as number[], calls: 0, tris: 0, frames: 0, publishAt: 0 });

  const get = useThree((s) => s.get);
  useEffect(() => {
    const info = get().gl.info;
    info.autoReset = false;
    return () => {
      info.autoReset = true;
    };
  }, [get]);

  useFrame(() => {
    const now = performance.now();
    const a = acc.current;
    // Totals rendered during the previous frame (all passes).
    a.calls += gl.info.render.calls;
    a.tris += gl.info.render.triangles;
    gl.info.reset();
    if (a.last) a.intervals.push(now - a.last);
    a.last = now;
    a.frames++;
    // CPU time of this frame = until the rAF task's microtask checkpoint.
    queueMicrotask(() => a.cpu.push(performance.now() - now));

    if (now >= a.publishAt) {
      const iv = a.intervals.length ? [...a.intervals].sort((x, y) => x - y) : [16.7];
      const avg = iv.reduce((s, v) => s + v, 0) / iv.length;
      const cpu = a.cpu.length ? a.cpu.reduce((s, v) => s + v, 0) / a.cpu.length : 0;
      const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      const animated = takeFrameCounts();
      for (const k of Object.keys(animated)) animated[k] = Math.round(animated[k] / Math.max(1, a.frames));
      perfStore.set({
        fps: Math.round(1000 / avg),
        frameMs: +avg.toFixed(1),
        frameP95: +iv[Math.floor(iv.length * 0.95)].toFixed(1),
        cpuMs: +cpu.toFixed(1),
        calls: Math.round(a.calls / Math.max(1, a.frames)),
        triangles: Math.round(a.tris / Math.max(1, a.frames)),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        dpr: +gl.getPixelRatio().toFixed(2),
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        quality,
        animated,
      });
      a.intervals = [];
      a.cpu = [];
      a.calls = 0;
      a.tris = 0;
      a.frames = 0;
      a.publishAt = now + PUBLISH_MS;
    }
  }, -1000);

  return null;
}
