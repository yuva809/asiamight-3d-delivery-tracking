import { FLOOR_Y } from "./scene-layout";
import type { Vec2 } from "./types";

/**
 * Worker behaviour as plain data (site-local metres). The 3D Worker just plays
 * a routine back; which routine runs is decided by the data/simulation layer.
 *
 *   walk  → move to a point (optionally carrying a carton)
 *   pick  → reach into a shelf, ends holding a carton
 *   pack  → work at a bench
 *   place → put the carried carton down
 *   idle  → stand, look around (optionally with a tablet)
 */
export type WorkerStep =
  | { t: "walk"; to: Vec2; carry?: boolean }
  | { t: "pick"; s: number; face: number }
  | { t: "pack"; s: number; face: number }
  | { t: "place"; s: number; face?: number }
  | { t: "idle"; s: number; face?: number };

export interface WorkerRoutine {
  id: string;
  /** Where the worker appears when the routine (re)starts, unless already placed. */
  start: Vec2;
  /** Height of the floor the worker stands on. */
  floor: number;
  loop: boolean;
  /** Carrying a carton at the start. */
  carrying?: boolean;
  /** Highlight the carried carton as "the current order" (demo). */
  orderCarton?: boolean;
  steps: WorkerStep[];
}

const N = Math.PI; // face north (-z)
const S = 0; // face south (+z)
const E = Math.PI / 2; // face +x
const W = -Math.PI / 2;
const IN = FLOOR_Y;
const OUT = 0;

const r = (id: string, start: Vec2, steps: WorkerStep[], opts: Partial<WorkerRoutine> = {}): WorkerRoutine => ({
  id,
  start,
  floor: IN,
  loop: true,
  steps,
  ...opts,
});

export const ROUTINES: Record<string, WorkerRoutine> = Object.fromEntries(
  [
    // ---------------- ambient (always running) ----------------
    r("amb-storage", [-21, -11.6], [
      { t: "walk", to: [-21, -11.6] },
      { t: "pick", s: 2.4, face: N },
      { t: "walk", to: [-12, -11.6], carry: true },
      { t: "pick", s: 2, face: S },
      { t: "walk", to: [-7, -11.6], carry: true },
      { t: "walk", to: [-7, -3.2], carry: true },
      { t: "walk", to: [-2.6, -0.6], carry: true },
      { t: "place", s: 1.2, face: E },
      { t: "walk", to: [-14, -3.2] },
      { t: "walk", to: [-21, -3.2] },
    ]),
    r("amb-picker", [3, -8.8], [
      { t: "walk", to: [3, -8.8] },
      { t: "pick", s: 2.2, face: N },
      { t: "walk", to: [11, -8.8], carry: true },
      { t: "pick", s: 2, face: S },
      { t: "walk", to: [19.5, -8.8], carry: true },
      { t: "walk", to: [19.5, -1.0], carry: true },
      { t: "walk", to: [16.5, 2.2], carry: true },
      { t: "place", s: 1.2, face: S },
      { t: "walk", to: [21.5, -1.0] },
      { t: "walk", to: [3, -1.0] },
    ]),
    r("amb-packer-a", [8.5, 2.3], [
      { t: "pack", s: 7, face: S },
      { t: "walk", to: [8.5, 11.5], carry: true },
      { t: "place", s: 1, face: S },
      { t: "walk", to: [8.5, 2.3] },
    ], { carrying: false }),
    r("amb-packer-b", [16.5, 8.3], [
      { t: "pack", s: 9, face: N },
      { t: "idle", s: 1.5, face: E },
    ]),
    r("amb-loader", [-6.4, 9.5], [
      { t: "walk", to: [-6.4, 9.5] },
      { t: "pick", s: 1.4, face: W },
      { t: "walk", to: [-5.4, 14.2], carry: true },
      { t: "walk", to: [-5.4, 16.1], carry: true },
      { t: "place", s: 1.1, face: S },
      { t: "walk", to: [-5.4, 14.2] },
    ]),
    r("amb-supervisor", [21.8, 0.2], [
      { t: "idle", s: 5, face: W },
      { t: "walk", to: [21.8, 5.5] },
      { t: "idle", s: 4, face: W },
      { t: "walk", to: [21.8, 0.2] },
    ]),
    r("amb-yard", [-24, 24], [
      { t: "walk", to: [-24, 24] },
      { t: "idle", s: 4, face: S },
      { t: "walk", to: [-12, 24] },
      { t: "idle", s: 3, face: N },
    ], { floor: OUT }),
    r("amb-driver", [12.4, 26.5], [
      { t: "idle", s: 6, face: E },
      { t: "walk", to: [16, 26.5] },
      { t: "idle", s: 4, face: S },
      { t: "walk", to: [12.4, 26.5] },
    ], { floor: OUT }),

    // ---------------- demo simulation (one per phase) ----------------
    // Picker
    r("demo-picker:wait", [1.6, -0.6], [{ t: "idle", s: 4, face: N }]),
    r("demo-picker:pick", [1.6, -0.6], [
      { t: "walk", to: [1.6, -5.6] },
      { t: "walk", to: [9.5, -5.6] },
      { t: "pick", s: 2.6, face: N },
      { t: "walk", to: [14.5, -5.6], carry: true },
      { t: "pick", s: 2, face: S },
      { t: "walk", to: [14.5, -1.0], carry: true },
      { t: "walk", to: [12.5, 2.2], carry: true },
      { t: "place", s: 1.2, face: S },
      { t: "walk", to: [11, 0.2] },
      { t: "idle", s: 30, face: S },
    ], { loop: false, orderCarton: true }),
    // Packer
    r("demo-packer:wait", [12.5, 4.2], [{ t: "idle", s: 4, face: N }]),
    r("demo-packer:pack", [12.5, 4.2], [
      { t: "pack", s: 6, face: N },
      { t: "walk", to: [13.4, 5.3], carry: true },
      { t: "walk", to: [13.4, 11.5], carry: true },
      { t: "place", s: 1.2, face: S },
      { t: "walk", to: [12.5, 4.2] },
      { t: "idle", s: 30, face: N },
    ], { loop: false, orderCarton: true }),
    // Loader
    r("demo-loader:wait", [3.2, 10.6], [{ t: "idle", s: 4, face: W }]),
    r("demo-loader:load", [3.2, 10.6], [
      { t: "walk", to: [3.6, 11.5] },
      { t: "pick", s: 1.4, face: S },
      { t: "walk", to: [-12, 13.4], carry: true },
      { t: "walk", to: [-15, 14.2], carry: true },
      { t: "walk", to: [-15, 16.4], carry: true },
      { t: "place", s: 1.4, face: S },
      { t: "walk", to: [-15, 13.6] },
      { t: "walk", to: [3.2, 10.6] },
      { t: "idle", s: 30, face: W },
    ], { loop: false, orderCarton: true }),
  ].map((routine) => [routine.id, routine]),
);
