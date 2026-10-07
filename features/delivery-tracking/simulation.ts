import type { VanStatus, ZoneId } from "./types";

/**
 * Demo order-flow simulation (Phase 1 only — no backend).
 *
 *   IDLE → ORDER_RECEIVED → PICKING → PACKING → LOADING → READY → (dispatch)
 *
 * Phase 2 replaces the manual stepping with real order events mapped onto the
 * same states, so the scene behaviour below stays exactly as is.
 */
export type SimulationState = "IDLE" | "ORDER_RECEIVED" | "PICKING" | "PACKING" | "LOADING" | "READY";

export const SIMULATION_STEPS: SimulationState[] = ["IDLE", "ORDER_RECEIVED", "PICKING", "PACKING", "LOADING", "READY"];

export const SIMULATION_LABELS: Record<SimulationState, { title: string; detail: string }> = {
  IDLE: { title: "Idle", detail: "Waiting for orders" },
  ORDER_RECEIVED: { title: "New order", detail: "Order accepted by the warehouse" },
  PICKING: { title: "Picking", detail: "Picker collecting items from shelves" },
  PACKING: { title: "Packing", detail: "Items packed and labelled" },
  LOADING: { title: "Loading", detail: "Carton loaded into the van at Dock 2" },
  READY: { title: "Ready", detail: "Van ready for dispatch" },
};

/** Ids of the workers and van the demo drives. */
export const DEMO = {
  pickerId: "w-demo-picker",
  packerId: "w-demo-packer",
  loaderId: "w-demo-loader",
  vanId: "van-03",
  dockId: "D2",
  branchId: "br-hagelberger",
} as const;

export interface SimulationDirectives {
  /** Zone to highlight on the floor (null = none). */
  activeZone: ZoneId | null;
  /** Floating order pin location. */
  pinZone: ZoneId | null;
  /** Routine per demo worker. */
  routines: Record<string, string>;
  demoVanStatus: VanStatus;
}

/** Simulation state → what the scene should show. Pure. */
export function simulationDirectives(state: SimulationState): SimulationDirectives {
  const wait = {
    [DEMO.pickerId]: "demo-picker:wait",
    [DEMO.packerId]: "demo-packer:wait",
    [DEMO.loaderId]: "demo-loader:wait",
  };
  switch (state) {
    case "ORDER_RECEIVED":
      return { activeZone: "office", pinZone: "picking", routines: wait, demoVanStatus: "PARKED" };
    case "PICKING":
      return { activeZone: "picking", pinZone: "picking", routines: { ...wait, [DEMO.pickerId]: "demo-picker:pick" }, demoVanStatus: "PARKED" };
    case "PACKING":
      return { activeZone: "packing", pinZone: "packing", routines: { ...wait, [DEMO.packerId]: "demo-packer:pack" }, demoVanStatus: "PARKED" };
    case "LOADING":
      return { activeZone: "loading", pinZone: "loading", routines: { ...wait, [DEMO.loaderId]: "demo-loader:load" }, demoVanStatus: "LOADING" };
    case "READY":
      return { activeZone: "loading", pinZone: "loading", routines: wait, demoVanStatus: "READY" };
    case "IDLE":
    default:
      return { activeZone: null, pinZone: null, routines: wait, demoVanStatus: "PARKED" };
  }
}
