"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", callback);
      return () => mql.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** One-time read — core count doesn't change over a session. */
function hasFewCores(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator.hardwareConcurrency ?? 8) <= 4;
}

/** Coarse pointer (touch) + capped core count is a much better proxy for
 * "reduce 3D scene weight" than viewport width alone — a small high-end
 * phone can outperform a large weak laptop. */
export function useIsLowPowerDevice(): boolean {
  const isCoarsePointer = useMediaQuery("(pointer: coarse)");
  return isCoarsePointer && hasFewCores();
}
