import * as THREE from "three";

/**
 * Per-frame camera metrics shared by the whole scene without React state.
 * Written once per frame by CameraController, read by anything that adapts
 * to zoom (road widths, level of detail, label fading).
 */
export const sceneMetrics = {
  /** Distance from camera to orbit target (m). */
  distance: 200,
  /** World metres covered by one screen pixel at the orbit target. */
  metersPerPx: 0.2,
  target: new THREE.Vector3(),
};

/** Shared uniforms so every widening material updates with one write. */
export const sharedUniforms = {
  uMetersPerPx: { value: 0.2 },
  uTime: { value: 0 },
};

/** Distance at which fine street detail (trees, lamps, cars, markings) is hidden. */
export const DETAIL_DISTANCE = 2600;
