import { getMockSnapshot, ROUTE_DURATION_S, routeIdFor } from "./mock-data";
import { DEMO, SIMULATION_STEPS, simulationDirectives, type SimulationState } from "./simulation";
import type { Delivery, DeliveryStatus, DeliveryTrackingSnapshot, Van } from "./types";

/**
 * In-browser stand-in for the backend (Phase 1 only).
 *
 * - Advances vans along their routes and updates ETAs / arrivals / counters.
 * - Runs the demo order flow (IDLE → … → READY → dispatch).
 *
 * Phase 2 replaces this with an API/WebSocket-backed store exposing the same
 * `getState()` shape; nothing in the UI or scene changes.
 */

/** Demo time compression: vans travel this many times faster than real time. */
export const SIM_SPEED = 4;
const ARRIVED_HOLD_S = 8;
const AUTO_STEP_S = 5.5;

export interface OperationsState {
  snapshot: DeliveryTrackingSnapshot;
  simulation: SimulationState;
  autoplay: boolean;
  /** The demo order currently moving through the warehouse, if any. */
  demoDeliveryId: string | null;
  /** Seconds the sim has been in the current state (for autoplay). */
  stateAge: number;
}

const SIM_TO_DELIVERY: Record<SimulationState, DeliveryStatus | null> = {
  IDLE: null,
  ORDER_RECEIVED: "ORDER_ACCEPTED",
  PICKING: "PICKING",
  PACKING: "PACKING",
  LOADING: "LOADING",
  READY: "READY_FOR_DISPATCH",
};

type Listener = () => void;

class MockOperations {
  private state: OperationsState = {
    snapshot: getMockSnapshot(),
    simulation: "IDLE",
    autoplay: false,
    demoDeliveryId: null,
    stateAge: 0,
  };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private arrivedFor = new Map<string, number>();
  private orderSeq = 24820;

  getState = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    if (!this.timer) {
      this.last = performance.now();
      // 2 Hz: vans extrapolate between ticks, so a faster tick only re-renders React more.
      this.timer = setInterval(() => this.tick(), 500);
    }
    return () => {
      this.listeners.delete(l);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  };

  private set(next: Partial<OperationsState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(1, (now - this.last) / 1000);
    this.last = now;

    const snap = this.state.snapshot;
    let delivered = snap.summary.delivered;
    let ordersToday = snap.summary.ordersToday;
    // Copy-on-write: keep the same array (and object) identities unless a branch changes.
    let branches = snap.branches;
    const touchBranch = (id: string, fn: (s: { deliveriesToday: number; pending: number }) => void) => {
      branches = branches.map((b) => {
        if (b.id !== id) return b;
        const stats = { ...b.stats };
        fn(stats);
        return { ...b, stats };
      });
    };
    let vans = snap.vans;
    let demoDeliveryId = this.state.demoDeliveryId;

    let deliveries: Delivery[] = [];
    for (const d of snap.deliveries) {
      if (d.status === "ON_ROAD") {
        const duration = ROUTE_DURATION_S[d.branchId] ?? 600;
        const progress = Math.min(1, d.progress + (dt * SIM_SPEED) / duration);
        const eta = Math.max(0, Math.ceil(((1 - progress) * duration) / 60));
        if (progress >= 1) {
          deliveries.push({ ...d, progress: 1, etaMinutes: 0, status: "ARRIVED" });
          vans = vans.map((v) => (v.id === d.vanId ? { ...v, status: "ARRIVED" } : v));
          this.arrivedFor.set(d.id, 0);
        } else {
          deliveries.push({ ...d, progress, etaMinutes: eta });
          vans = vans.map((v) =>
            v.id === d.vanId && v.placement.kind === "route" ? { ...v, placement: { ...v.placement, progress } } : v,
          );
        }
      } else if (d.status === "ARRIVED") {
        const held = (this.arrivedFor.get(d.id) ?? 0) + dt;
        this.arrivedFor.set(d.id, held);
        if (held < ARRIVED_HOLD_S) {
          deliveries.push(d);
          continue;
        }
        // Delivered.
        this.arrivedFor.delete(d.id);
        delivered += 1;
        touchBranch(d.branchId, (stats) => {
          stats.deliveriesToday += 1;
          stats.pending = Math.max(0, stats.pending - 1);
        });
        if (d.vanId === DEMO.vanId) {
          // Demo van returns to its dock for the next run.
          vans = vans.map((v) =>
            v.id === DEMO.vanId ? { ...v, status: "PARKED", placement: { kind: "dock", dockId: DEMO.dockId } } : v,
          );
          if (demoDeliveryId === d.id) demoDeliveryId = null;
        } else {
          // Ambient vans start a fresh trip to the same branch.
          ordersToday += 1;
          const next: Delivery = {
            ...d,
            id: `dl-${++this.orderSeq}`,
            orderRef: `AM-${this.orderSeq}`,
            status: "ON_ROAD",
            progress: 0,
            etaMinutes: Math.ceil((ROUTE_DURATION_S[d.branchId] ?? 600) / 60),
          };
          deliveries.push(next);
          vans = vans.map((v) =>
            v.id === d.vanId ? { ...v, status: "ON_ROUTE", placement: { kind: "route", routeId: routeIdFor(d.branchId), progress: 0 } } : v,
          );
        }
      } else {
        deliveries.push(d);
      }
    }
    deliveries = deliveries.filter(Boolean);

    let { simulation, stateAge } = this.state;
    stateAge += dt;
    this.set({
      demoDeliveryId,
      stateAge,
      snapshot: {
        ...snap,
        vans,
        deliveries,
        branches,
        summary: {
          ...snap.summary,
          delivered,
          ordersToday,
          onRoad: deliveries.filter((d) => d.status === "ON_ROAD").length,
        },
      },
    });

    if (this.state.autoplay && stateAge > (simulation === "IDLE" ? 2.5 : AUTO_STEP_S)) {
      if (simulation === "READY") this.dispatch();
      else this.advance();
      simulation = this.state.simulation;
    }
  }

  /** Apply the simulation state to the demo delivery + demo van. */
  private applySimulation(simulation: SimulationState, demoDeliveryId: string | null) {
    const snap = this.state.snapshot;
    const status = SIM_TO_DELIVERY[simulation];
    const deliveries = snap.deliveries.map((d) => (d.id === demoDeliveryId && status ? { ...d, status } : d));
    const directives = simulationDirectives(simulation);
    const vans: Van[] = snap.vans.map((v) =>
      v.id === DEMO.vanId && v.placement.kind === "dock" ? { ...v, status: directives.demoVanStatus } : v,
    );
    const workers = snap.workers.map((w) => (directives.routines[w.id] ? { ...w, routineId: directives.routines[w.id] } : w));
    this.set({ simulation, demoDeliveryId, stateAge: 0, snapshot: { ...snap, deliveries, vans, workers } });
  }

  advance = () => {
    const { simulation, snapshot } = this.state;
    const i = SIMULATION_STEPS.indexOf(simulation);
    if (i >= SIMULATION_STEPS.length - 1) return;
    const next = SIMULATION_STEPS[i + 1];
    let demoDeliveryId = this.state.demoDeliveryId;
    if (next === "ORDER_RECEIVED") {
      // A new order arrives from a branch.
      const id = `dl-${++this.orderSeq}`;
      demoDeliveryId = id;
      const order: Delivery = {
        id,
        orderRef: `AM-${this.orderSeq}`,
        branchId: DEMO.branchId,
        vanId: DEMO.vanId,
        status: "ORDER_ACCEPTED",
        items: 12,
        progress: 0,
        etaMinutes: null,
      };
      this.state = {
        ...this.state,
        snapshot: {
          ...snapshot,
          deliveries: [order, ...snapshot.deliveries],
          summary: { ...snapshot.summary, ordersToday: snapshot.summary.ordersToday + 1 },
          branches: snapshot.branches.map((b) =>
            b.id === DEMO.branchId ? { ...b, stats: { ...b.stats, pending: b.stats.pending + 1 } } : b,
          ),
        },
      };
    }
    this.applySimulation(next, demoDeliveryId);
  };

  /** Send the loaded demo van to its branch (only from READY). */
  dispatch = () => {
    if (this.state.simulation !== "READY") return;
    const id = this.state.demoDeliveryId;
    const snap = this.state.snapshot;
    const deliveries = snap.deliveries.map((d) =>
      d.id === id ? { ...d, status: "ON_ROAD" as const, progress: 0, etaMinutes: Math.ceil((ROUTE_DURATION_S[d.branchId] ?? 600) / 60) } : d,
    );
    const vans = snap.vans.map((v) =>
      v.id === DEMO.vanId
        ? { ...v, status: "ON_ROUTE" as const, placement: { kind: "route" as const, routeId: routeIdFor(DEMO.branchId), progress: 0 } }
        : v,
    );
    this.state = { ...this.state, snapshot: { ...snap, deliveries, vans } };
    this.applySimulation("IDLE", id);
  };

  reset = () => {
    this.arrivedFor.clear();
    this.set({ snapshot: getMockSnapshot(), simulation: "IDLE", autoplay: false, demoDeliveryId: null, stateAge: 0 });
  };

  setAutoplay = (autoplay: boolean) => this.set({ autoplay, stateAge: 0 });
}

export const mockOperations = new MockOperations();
