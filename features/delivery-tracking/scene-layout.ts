import type { Vec2, Vec3, ZoneId } from "./types";

/**
 * Static geography of the AsiaMight distribution site.
 *
 * Everything inside the site is laid out in SITE-LOCAL metres (building
 * centre = origin, docks face local +z). The site group is placed into the
 * real Berlin scene by SITE.position/rotation — beside the real access road.
 * Keep SITE in sync with scripts/fetch-berlin-geo.mjs.
 */
export const SITE = {
  /** World (scene) position of the building centre. */
  position: [26.05, 33.7] as Vec2,
  /** Rotation around +y so the docks/gate face the access road. */
  rotation: -2.77,
  /** Site-local fence bounds. */
  bounds: { minX: -36, maxX: 54, minZ: -26, maxZ: 38 },
  /** Site-local gate centre on the front fence. */
  gate: [0, 38] as Vec2,
  /** World point where the driveway meets the public road (OSRM snap point). */
  roadJoin: [7.9, -12.9] as Vec2,
};

const COS = Math.cos(SITE.rotation);
const SIN = Math.sin(SITE.rotation);

export function siteToWorld([lx, lz]: Vec2): Vec2 {
  return [SITE.position[0] + lx * COS + lz * SIN, SITE.position[1] - lx * SIN + lz * COS];
}
export function siteToWorld3([lx, ly, lz]: Vec3): Vec3 {
  const [x, z] = siteToWorld([lx, lz]);
  return [x, ly, z];
}
export function worldToSite([x, z]: Vec2): Vec2 {
  const dx = x - SITE.position[0];
  const dz = z - SITE.position[1];
  return [dx * COS - dz * SIN, dx * SIN + dz * COS];
}
/** Convert a site-local heading to a world heading. */
export const siteHeading = (h: number) => h + SITE.rotation;

export const WAREHOUSE = {
  minX: -24,
  maxX: 24,
  minZ: -15,
  maxZ: 15,
  height: 10,
  wallThickness: 0.35,
  /** Top of the interior floor slab. */
  floorY: 0.25,
} as const;
export const FLOOR_Y = WAREHOUSE.floorY;

/** Two-storey glazed office annex on the east end. */
export const OFFICE = { minX: 24, maxX: 33, minZ: -15, maxZ: -1, height: 8 } as const;

export interface ZoneRect {
  id: ZoneId;
  label: string;
  /** [minX, minZ, maxX, maxZ] site-local */
  rect: [number, number, number, number];
  color: string;
}

export const ZONES: ZoneRect[] = [
  { id: "storage", label: "Storage", rect: [-23.4, -14.4, -1.6, -1.6], color: "#3e4e77" },
  { id: "picking", label: "Picking", rect: [0.4, -14.4, 23.4, -1.6], color: "#3f8a5f" },
  { id: "packing", label: "Packing", rect: [5, 0.4, 23.4, 10.4], color: "#e8a530" },
  { id: "loading", label: "Loading", rect: [-23.4, 0.4, 3.4, 14.4], color: "#d6472c" },
];

export interface Dock {
  id: string;
  label: string;
  /** Door centre x on the south (local +z) wall. */
  x: number;
}
export const DOCK_DOOR = { width: 3.4, height: 4.2 } as const;
export const DOCKS: Dock[] = [
  { id: "D1", label: "Dock 1", x: -20 },
  { id: "D2", label: "Dock 2", x: -15 },
  { id: "D3", label: "Dock 3", x: -10 },
  { id: "D4", label: "Dock 4", x: -5 },
  { id: "D5", label: "Dock 5", x: 0 },
];
/** Site-local pose of a van backed onto a dock (rear against the shelter). */
export function dockPose(dockId: string): { position: Vec2; heading: number } {
  const d = DOCKS.find((k) => k.id === dockId) ?? DOCKS[0];
  return { position: [d.x, WAREHOUSE.maxZ + 3.35], heading: 0 };
}

export const YARD: [number, number, number, number] = [-31, 15, 7, 38];
export interface ParkingBay {
  id: string;
  position: Vec2;
  heading: number;
}
/** Van bays along the east of the yard. */
export const VAN_BAYS: ParkingBay[] = [10.5, 14, 17.5, 21].map((x, i) => ({
  id: `P${i + 1}`,
  position: [x, 30.5],
  heading: Math.PI,
}));
/** Staff car park east of the office. */
export const CAR_PARK: [number, number, number, number] = [35, -12, 53, 34];

export interface ConveyorSpec {
  from: Vec2;
  to: Vec2;
}
export const CONVEYOR: ConveyorSpec = { from: [18, 12.4], to: [4.2, 12.4] };

export const PACKING_TABLES: Vec2[] = [
  [8.5, 3.2],
  [12.5, 3.2],
  [16.5, 3.2],
  [8.5, 7.4],
  [12.5, 7.4],
  [16.5, 7.4],
];

// ---------------- camera ----------------

export type CameraViewId = "overview" | "warehouse" | "loading" | "network" | "follow";
export type InsideStop = "storage" | "picking" | "packing" | "loading";

export interface CameraView {
  id: string;
  label: string;
  position: Vec3;
  target: Vec3;
}

const local = (id: string, label: string, position: Vec3, target: Vec3): CameraView => ({
  id,
  label,
  position: siteToWorld3(position),
  target: siteToWorld3(target),
});

export const CAMERA_VIEWS: Record<Exclude<CameraViewId, "follow">, CameraView> = {
  overview: local("overview", "Overview", [86, 84, 112], [6, 0, 10]),
  warehouse: local("warehouse", "Warehouse", [52, 46, 66], [0, 0, 2]),
  loading: local("loading", "Loading", [16, 15, 48], [-10, 1, 18]),
  network: { id: "network", label: "Branch network", position: [400, 28500, 13600], target: [-1000, 0, -2500] },
};

export const INSIDE_VIEWS: Record<InsideStop, CameraView> = {
  // Eye-level-ish shots along the aisles the workers actually use.
  storage: local("inside-storage", "Storage", [0.6, 4.2, -11.0], [-16, 1.0, -12.0]),
  picking: local("inside-picking", "Picking", [2.4, 3.0, -0.6], [14, 0.9, -9]),
  packing: local("inside-packing", "Packing", [5.2, 4.2, 12.6], [13, 0.9, 4.2]),
  loading: local("inside-loading", "Loading", [2.6, 4.4, 3.4], [-12, 1, 13]),
};
export const INSIDE_ORDER: InsideStop[] = ["storage", "picking", "packing", "loading"];

export const DEFAULT_VIEW: Exclude<CameraViewId, "follow"> = "overview";
