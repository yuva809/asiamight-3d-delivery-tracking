"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MAX_STEP, qualityStore, useQuality } from "./quality";

const WINDOW_S = 1.5;
const DOWN_BELOW_FPS = 50;
const UP_ABOVE_FPS = 58;
const UP_AFTER_S = 8;
const COOLDOWN_S = 2.5;
const WARMUP_S = 3;

/**
 * Automatic quality scaling. Measures frame intervals; if the average over a
 * window is below 50 fps it steps one rung down the ladder, and only steps
 * back up after a sustained 8 s above 58 fps. A rung that failed once becomes
 * a ceiling, so the scene never oscillates. Also applies the pixel ratio.
 *
 * Browser throttling is not GPU load and is ignored rather than "fixed":
 * a steady 30 fps (battery saver) or ≤ 5 fps (hidden / occluded window,
 * background pane) with an idle main thread, or any window while hidden.
 */
export function QualityGovernor() {
  const q = useQuality();
  const setDpr = useThree((s) => s.setDpr);
  const s = useRef({ t: 0, frames: 0, sum: 0, cpu: 0, since: 0, good: 0, ceiling: 0, warm: 0, last: 0 });

  useEffect(() => {
    setDpr(q.dpr);
  }, [q.dpr, setDpr]);

  useFrame((_, dt) => {
    const st = s.current;
    const now = performance.now();
    const interval = st.last ? now - st.last : 16.7;
    st.last = now;
    st.warm += dt;
    st.since += dt;
    if (st.warm < WARMUP_S || qualityStore.getMode() !== "auto") return;
    if (document.hidden) {
      st.t = st.frames = st.sum = st.cpu = 0;
      return;
    }
    st.t += dt;
    st.frames++;
    st.sum += interval;
    queueMicrotask(() => (st.cpu += performance.now() - now));
    if (st.t < WINDOW_S) return;

    const fps = 1000 / (st.sum / st.frames);
    const cpu = st.cpu / st.frames;
    st.t = st.frames = st.sum = st.cpu = 0;
    const capped = cpu < 9 && ((fps > 28 && fps < 32) || fps <= 5);
    const step = qualityStore.get().step;

    if (fps < DOWN_BELOW_FPS && !capped && st.since > COOLDOWN_S && step < MAX_STEP) {
      // If we only just stepped up, that rung is too expensive: remember it.
      if (st.good === -1) st.ceiling = step + 1;
      qualityStore.setStep(step + 1);
      st.since = 0;
      st.good = 0;
    } else if (fps > UP_ABOVE_FPS) {
      st.good += WINDOW_S;
      if (st.good >= UP_AFTER_S && step > st.ceiling && st.since > COOLDOWN_S) {
        qualityStore.setStep(step - 1);
        st.since = 0;
        st.good = -1; // probation: a drop now marks a ceiling
      }
    } else if (st.good > 0) {
      st.good = 0;
    }
  });

  return null;
}
