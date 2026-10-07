/**
 * Domain types for Delivery Tracking.
 *
 * These describe *what* exists in the operation (branches, vans, deliveries,
 * workers) independently of how it is drawn. Real-world things carry real
 * geo coordinates; the visualization layer projects them into the scene.
 * Phase 2 swaps the mock source for backend data with the same shapes.
 */

/** Scene-space vector in metres: x = east, y = up, z = south (origin = warehouse). */
export type Vec3 = [x: number, y: number, z: number];
/** Ground-plane point in scene metres: [x, z]. */
export type Vec2 = [x: number, z: number];

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Full order lifecycle (backend vocabulary). */
export const DELIVERY_STATUSES = [
  "ORDER_CREATED",
  "ORDER_ACCEPTED",
  "PICKING",
  "PACKING",
  "READY_FOR_DISPATCH",
  "DRIVER_ASSIGNED",
  "LOADING",
  "DISPATCHED",
  "ON_ROAD",
  "ARRIVED",
  "DELIVERED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Operational state of a vehicle. */
export type VanStatus = "PARKED" | "LOADING" | "READY" | "ON_ROUTE" | "ARRIVED" | "MAINTENANCE";

/**
 * Where a van is. Phase 1 uses site slots and route progress; Phase 3 adds
 * raw GPS. The scene resolves every kind to position/rotation.
 */
export type VanPlacement =
  | { kind: "dock"; dockId: string }
  | { kind: "parking"; bayId: string }
  | { kind: "route"; routeId: string; /** 0..1 along the route */ progress: number }
  | { kind: "gps"; location: GeoPoint; heading: number };

export interface Van {
  id: string;
  label: string;
  plate: string;
  driverId: string | null;
  status: VanStatus;
  placement: VanPlacement;
}

export interface Driver {
  id: string;
  name: string;
  /** Short display label, e.g. "Driver 01". */
  label: string;
}

export interface Branch {
  id: string;
  /** Display name as used in the AsiaMight app. */
  name: string;
  /** Short name for tight UI, e.g. "Hagelberger". */
  shortName: string;
  street: string;
  postcode: string;
  district: string;
  city: string;
  location: GeoPoint;
  /** How the coordinates were derived — shown nowhere in UI, kept for audit. */
  geocodeNote: string;
  stats: { deliveriesToday: number; pending: number };
}

export interface Delivery {
  id: string;
  /** Human order reference, e.g. "AM-24817". */
  orderRef: string;
  branchId: string;
  vanId: string | null;
  status: DeliveryStatus;
  items: number;
  /** 0..1 progress along the route when ON_ROAD. */
  progress: number;
  /** Minutes to arrival (null when not on the road). */
  etaMinutes: number | null;
}

export type ZoneId = "storage" | "picking" | "packing" | "loading" | "office";

export type WorkerRole = "picker" | "packer" | "loader" | "supervisor" | "driver";

export type WorkerActivity = "idle" | "walking" | "picking" | "packing" | "carrying";

export interface Worker {
  id: string;
  role: WorkerRole;
  zone: ZoneId;
  /** Id of a routine in worker-routines.ts (what the worker is doing). */
  routineId: string;
}

export interface OpsSummary {
  ordersToday: number;
  onRoad: number;
  delivered: number;
  delayed: number;
}

export interface WarehouseInfo {
  id: string;
  name: string;
  location: GeoPoint;
  address: string;
  /** True while the location is a stand-in (real address not provided yet). */
  isPlaceholderLocation: boolean;
}

/** Everything the page needs for one render of the operation. */
export interface DeliveryTrackingSnapshot {
  warehouse: WarehouseInfo;
  summary: OpsSummary;
  branches: Branch[];
  vans: Van[];
  drivers: Driver[];
  deliveries: Delivery[];
  workers: Worker[];
  generatedAt: string;
  source: "mock" | "live";
}
