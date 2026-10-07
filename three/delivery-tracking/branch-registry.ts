import type { Vec2 } from "@/features/delivery-tracking/types";

/** Street-facing facade of each branch building, so the camera can frame the storefront. */
export const branchRegistry = new Map<string, { point: Vec2; facadeMid: Vec2; normal: Vec2; height: number }>();
