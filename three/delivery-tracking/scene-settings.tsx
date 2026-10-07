"use client";

import { createContext, useContext } from "react";

/**
 * How the warehouse is presented:
 *  - operational: roof turns translucent, upper front walls drop away
 *  - exterior:    the complete closed building
 *  - inside:      roof off; the camera tours Storage → Picking → Packing → Loading
 */
export type BuildingMode = "operational" | "exterior" | "inside";

export interface SceneSettings {
  buildingMode: BuildingMode;
  /** Floating labels for branches, vans, zones. */
  showLabels: boolean;
  /** False when the user prefers reduced motion — idle animations freeze. */
  animate: boolean;
  /** Lower-cost rendering for weak devices (no shadows, fewer props). */
  lowPower: boolean;
}

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  buildingMode: "operational",
  showLabels: true,
  animate: true,
  lowPower: false,
};

const SceneSettingsContext = createContext<SceneSettings>(DEFAULT_SCENE_SETTINGS);

export const SceneSettingsProvider = SceneSettingsContext.Provider;

export function useSceneSettings(): SceneSettings {
  return useContext(SceneSettingsContext);
}
