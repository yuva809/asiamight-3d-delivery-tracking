import type { Vec2 } from "./types";

/** A polyline with cumulative distances, for O(log n) sampling by distance. */
export interface Polyline {
  points: Vec2[];
  /** cumulative[i] = distance from points[0] to points[i]. */
  cumulative: number[];
  length: number;
}

export function toPolyline(points: Vec2[]): Polyline {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    cumulative.push(cumulative[i - 1] + Math.hypot(bx - ax, bz - az));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] ?? 0 };
}

/** Flat [x0, z0, x1, z1, …] → Vec2[] */
export function unflatten(flat: number[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

export interface PolylineSample {
  x: number;
  z: number;
  /** Heading in radians around +y; 0 = facing +z. */
  heading: number;
}

/** Point + heading at `distance` metres along the polyline (clamped). */
export function sampleAt(line: Polyline, distance: number): PolylineSample {
  const { points, cumulative, length } = line;
  if (points.length === 0) return { x: 0, z: 0, heading: 0 };
  if (points.length === 1) return { x: points[0][0], z: points[0][1], heading: 0 };
  const d = Math.min(Math.max(distance, 0), length);
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cumulative[hi] - cumulative[lo] || 1e-6;
  const t = (d - cumulative[lo]) / seg;
  const [ax, az] = points[lo];
  const [bx, bz] = points[hi];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, heading: Math.atan2(bx - ax, bz - az) };
}

/** Concatenate polylines, dropping duplicate joints. */
export function joinPaths(...paths: Vec2[][]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of paths) {
    for (const pt of p) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 0.05) out.push(pt);
    }
  }
  return out;
}
