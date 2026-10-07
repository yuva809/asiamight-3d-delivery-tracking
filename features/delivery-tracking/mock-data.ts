import { sceneToGeo } from "./geo";
import { SITE } from "./scene-layout";
import { DEMO } from "./simulation";
import type { Branch, Delivery, DeliveryTrackingSnapshot, Driver, OpsSummary, Van, WarehouseInfo, Worker } from "./types";

/**
 * Phase 1 mock data. Branches are the REAL AsiaMight Berlin locations
 * (geocoded via OpenStreetMap Nominatim/Overpass, see geocodeNote). Fleet,
 * drivers, deliveries and figures are sample values with the same shapes
 * the backend will provide in Phase 2.
 */

export const mockWarehouse: WarehouseInfo = {
  id: "wh-berlin",
  name: "AsiaMight Distribution Centre",
  location: sceneToGeo(SITE.position),
  address: "Tempelhof industrial area, Berlin (placeholder)",
  isPlaceholderLocation: true,
};

export const mockBranches: Branch[] = [
  {
    id: "br-hagelberger",
    name: "Asia Might Hagelberger",
    shortName: "Hagelberger",
    street: "Hagelberger Straße 57",
    postcode: "10965",
    district: "Kreuzberg",
    city: "Berlin",
    location: { lat: 52.4910787, lon: 13.386051 },
    geocodeNote: "Nominatim exact address match (OSM)",
    stats: { deliveriesToday: 4, pending: 1 },
  },
  {
    id: "br-kurfuerstenstrasse",
    name: "Asia Might Kurfürstenstraße",
    shortName: "Kurfürstenstraße",
    street: "Kurfürstenstraße 33",
    postcode: "10785",
    district: "Tiergarten",
    city: "Berlin",
    location: { lat: 52.5002045, lon: 13.3615482 },
    geocodeNote: "Nominatim exact match; Tiergarten 10785 chosen of three Berlin Kurfürstenstraße",
    stats: { deliveriesToday: 3, pending: 0 },
  },
  {
    id: "br-rudow",
    name: "Asia Might Rudow",
    shortName: "Rudow",
    street: "Rudower Straße 132",
    postcode: "12351",
    district: "Buckow / Rudow",
    city: "Berlin",
    location: { lat: 52.4339711, lon: 13.4690508 },
    geocodeNote: "Nominatim exact match; Neukölln 12351 chosen over Köpenick 12557 (branch is 'Rudow')",
    stats: { deliveriesToday: 2, pending: 1 },
  },
  {
    id: "br-spandau",
    name: "Asia Might Spandau",
    shortName: "Spandau",
    street: "Wilhelmstraße 2",
    postcode: "13595",
    district: "Spandau",
    city: "Berlin",
    location: { lat: 52.5284, lon: 13.19473 },
    geocodeNote: "No #2 in OSM; interpolated between Wilhelmstraße 1 and 3–4 (Overpass)",
    stats: { deliveriesToday: 5, pending: 2 },
  },
];

export const mockDrivers: Driver[] = [
  { id: "drv-01", label: "Driver 01", name: "Lukas Brandt" },
  { id: "drv-02", label: "Driver 02", name: "Minh Tran" },
  { id: "drv-03", label: "Driver 03", name: "Ayşe Demir" },
  { id: "drv-04", label: "Driver 04", name: "Jonas Weber" },
  { id: "drv-05", label: "Driver 05", name: "Sofia Klein" },
];

/** Route ids are "route:<branchId>" — see the routes in public/geo/berlin.json. */
export const routeIdFor = (branchId: string) => `route:${branchId}`;

/** OSRM driving durations (seconds) for each route, used for ETAs. */
export const ROUTE_DURATION_S: Record<string, number> = {
  "br-hagelberger": 574,
  "br-kurfuerstenstrasse": 831,
  "br-rudow": 675,
  "br-spandau": 1596,
};

export const mockVans: Van[] = [
  { id: "van-01", label: "VAN 01", plate: "B-AM 1201", driverId: "drv-01", status: "ON_ROUTE", placement: { kind: "route", routeId: routeIdFor("br-hagelberger"), progress: 0.8 } },
  { id: "van-02", label: "VAN 02", plate: "B-AM 1202", driverId: "drv-02", status: "ON_ROUTE", placement: { kind: "route", routeId: routeIdFor("br-spandau"), progress: 0.4 } },
  { id: DEMO.vanId, label: "VAN 03", plate: "B-AM 1203", driverId: "drv-03", status: "PARKED", placement: { kind: "dock", dockId: DEMO.dockId } },
  { id: "van-04", label: "VAN 04", plate: "B-AM 1204", driverId: "drv-04", status: "LOADING", placement: { kind: "dock", dockId: "D4" } },
  { id: "van-05", label: "VAN 05", plate: "B-AM 1205", driverId: null, status: "PARKED", placement: { kind: "parking", bayId: "P2" } },
];

export const mockDeliveries: Delivery[] = [
  { id: "dl-24811", orderRef: "AM-24811", branchId: "br-hagelberger", vanId: "van-01", status: "ON_ROAD", items: 18, progress: 0.8, etaMinutes: 2 },
  { id: "dl-24814", orderRef: "AM-24814", branchId: "br-spandau", vanId: "van-02", status: "ON_ROAD", items: 32, progress: 0.4, etaMinutes: 16 },
  { id: "dl-24816", orderRef: "AM-24816", branchId: "br-rudow", vanId: "van-04", status: "LOADING", items: 21, progress: 0, etaMinutes: null },
  { id: "dl-24817", orderRef: "AM-24817", branchId: "br-kurfuerstenstrasse", vanId: null, status: "PACKING", items: 9, progress: 0, etaMinutes: null },
];

export const mockWorkers: Worker[] = [
  { id: "w-storage", role: "picker", zone: "storage", routineId: "amb-storage" },
  { id: "w-picker", role: "picker", zone: "picking", routineId: "amb-picker" },
  { id: "w-packer-a", role: "packer", zone: "packing", routineId: "amb-packer-a" },
  { id: "w-packer-b", role: "packer", zone: "packing", routineId: "amb-packer-b" },
  { id: "w-loader", role: "loader", zone: "loading", routineId: "amb-loader" },
  { id: "w-supervisor", role: "supervisor", zone: "office", routineId: "amb-supervisor" },
  { id: "w-yard", role: "loader", zone: "loading", routineId: "amb-yard" },
  { id: "w-driver", role: "driver", zone: "loading", routineId: "amb-driver" },
  { id: DEMO.pickerId, role: "picker", zone: "picking", routineId: "demo-picker:wait" },
  { id: DEMO.packerId, role: "packer", zone: "packing", routineId: "demo-packer:wait" },
  { id: DEMO.loaderId, role: "loader", zone: "loading", routineId: "demo-loader:wait" },
];

export const mockSummary: OpsSummary = { ordersToday: 14, onRoad: 2, delivered: 8, delayed: 0 };

export function getMockSnapshot(): DeliveryTrackingSnapshot {
  return {
    warehouse: mockWarehouse,
    summary: mockSummary,
    branches: mockBranches,
    vans: mockVans,
    drivers: mockDrivers,
    deliveries: mockDeliveries,
    workers: mockWorkers,
    generatedAt: new Date(0).toISOString(),
    source: "mock",
  };
}
