"use client";

import { useSyncExternalStore } from "react";
import { mockOperations, type OperationsState } from "./mock-operations";

const getServerState = (() => {
  let cached: OperationsState | null = null;
  return () => (cached ??= mockOperations.getState());
})();

/**
 * The page's only data entry point.
 *
 * Phase 1: a local mock "backend" (mock-operations.ts) that moves vans and
 * runs the demo order flow.
 * Phase 2: swap the store for an API/WebSocket-backed one with the same
 * OperationsState shape — callers and the 3D scene stay unchanged.
 */
export function useDeliveryTrackingData() {
  const state = useSyncExternalStore(mockOperations.subscribe, mockOperations.getState, getServerState);
  return {
    ...state,
    actions: {
      advance: mockOperations.advance,
      dispatch: mockOperations.dispatch,
      reset: mockOperations.reset,
      setAutoplay: mockOperations.setAutoplay,
    },
  };
}
