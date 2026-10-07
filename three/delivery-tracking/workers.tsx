"use client";

import { memo } from "react";
import { ROUTINES } from "@/features/delivery-tracking/worker-routines";
import type { Worker as WorkerData } from "@/features/delivery-tracking/types";
import { Worker } from "./worker";

/**
 * Workers that demonstrate the operation keep animating; everyone else holds
 * a static idle pose. Demo workers animate only while they have a task.
 */
const ALWAYS_ANIMATED = new Set(["amb-picker", "amb-packer-a", "amb-loader"]);
const isActive = (routineId: string) =>
  ALWAYS_ANIMATED.has(routineId) || (routineId.startsWith("demo-") && !routineId.endsWith(":wait"));

/** Renders workers (site-local). Keyed by id so live data can add/remove people. */
export const Workers = memo(function Workers({ workers }: { workers: WorkerData[] }) {
  return (
    <group>
      {workers.map((w, i) => {
        const routine = ROUTINES[w.routineId];
        if (!routine) return null;
        return <Worker key={w.id} role={w.role} routine={routine} seed={i} active={isActive(w.routineId)} />;
      })}
    </group>
  );
});
