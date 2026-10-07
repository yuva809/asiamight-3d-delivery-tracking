import type { DeliveryStatus, VanStatus, WorkerActivity, ZoneId } from "./types";

/**
 * The single translation layer between business state and what the scene
 * shows. Scene components take *visual* props only (doorsOpen, beacon,
 * motion…), never business rules:
 *
 *   backend event → DeliveryStatus / VanStatus → this file → component props
 */

export type VanMotion = "parked" | "docked" | "driving";
export type BeaconTone = "neutral" | "amber" | "green" | "blue" | "red";

export interface VanVisual {
  motion: VanMotion;
  doorsOpen: boolean;
  beacon: BeaconTone;
  /** Short UI label. */
  label: string;
  /** Tailwind-friendly tone for chips. */
  tone: "neutral" | "amber" | "green" | "blue" | "red";
}

export function vanVisualForStatus(status: VanStatus, atDock: boolean): VanVisual {
  switch (status) {
    case "LOADING":
      return { motion: "docked", doorsOpen: true, beacon: "amber", label: "Loading", tone: "amber" };
    case "READY":
      return { motion: atDock ? "docked" : "parked", doorsOpen: false, beacon: "green", label: "Ready", tone: "green" };
    case "ON_ROUTE":
      return { motion: "driving", doorsOpen: false, beacon: "blue", label: "On route", tone: "blue" };
    case "ARRIVED":
      return { motion: "parked", doorsOpen: true, beacon: "green", label: "Arrived", tone: "green" };
    case "MAINTENANCE":
      return { motion: "parked", doorsOpen: false, beacon: "red", label: "Maintenance", tone: "red" };
    case "PARKED":
    default:
      return { motion: atDock ? "docked" : "parked", doorsOpen: false, beacon: "neutral", label: atDock ? "At dock" : "Parked", tone: "neutral" };
  }
}

export const BEACON_COLORS: Record<BeaconTone, string> = {
  neutral: "#a3a8b0",
  amber: "#f0a524",
  green: "#2fae6a",
  blue: "#3b7bea",
  red: "#e0452c",
};

export interface SceneIntent {
  label: string;
  zone: ZoneId | null;
  workerActivity?: WorkerActivity;
  vanStatus?: VanStatus;
}

export type { WorkerActivity };

/** Order stage → which part of the scene it concerns (Phase 2 hook). */
export const SCENE_INTENT: Record<DeliveryStatus, SceneIntent> = {
  ORDER_CREATED: { label: "Order created", zone: "office" },
  ORDER_ACCEPTED: { label: "Accepted", zone: "office" },
  PICKING: { label: "Picking", zone: "picking", workerActivity: "picking" },
  PACKING: { label: "Packing", zone: "packing", workerActivity: "packing" },
  READY_FOR_DISPATCH: { label: "Ready", zone: "loading", vanStatus: "READY" },
  DRIVER_ASSIGNED: { label: "Driver assigned", zone: "loading", vanStatus: "READY" },
  LOADING: { label: "Loading", zone: "loading", workerActivity: "carrying", vanStatus: "LOADING" },
  DISPATCHED: { label: "Dispatched", zone: null, vanStatus: "ON_ROUTE" },
  ON_ROAD: { label: "On road", zone: null, vanStatus: "ON_ROUTE" },
  ARRIVED: { label: "Arrived", zone: null, vanStatus: "ARRIVED" },
  DELIVERED: { label: "Delivered", zone: null, vanStatus: "PARKED" },
};
