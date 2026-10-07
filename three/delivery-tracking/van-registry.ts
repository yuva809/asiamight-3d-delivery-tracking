import type * as THREE from "three";

/** Live van objects by id — lets the camera follow a moving van without React state. */
export const vanRegistry = new Map<string, THREE.Object3D>();
