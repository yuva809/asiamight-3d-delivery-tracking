"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * Tracks prefers-reduced-motion live (not just at mount), since users can
 * toggle the OS setting while the page is open. Built on
 * useSyncExternalStore rather than useState+useEffect, since that's the
 * idiomatic way to subscribe to a browser API without a setState-in-effect
 * render cascade.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
