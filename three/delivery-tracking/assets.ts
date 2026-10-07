"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

/**
 * Shared GLB-derived geometry. Models live in public/models (CC0 sources,
 * Meshopt-compressed; see README → Assets).
 */
const PALLET = "/models/pallet.glb";
useGLTF.preload(PALLET);

/** Unit-box-normalised geometry (centred, 1×1×1) so it drops into InstancedBoxes. */
function normalizeToUnit(source: THREE.BufferGeometry) {
  const g = source.clone();
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  b.getSize(size);
  b.getCenter(centre);
  g.translate(-centre.x, -centre.y, -centre.z);
  g.scale(1 / size.x, 1 / size.y, 1 / size.z);
  g.computeVertexNormals();
  return g;
}

/** Quaternius pallet (CC0) as a unit geometry, oriented with its long side on x. */
export function usePalletGeometry(): THREE.BufferGeometry {
  const { scene } = useGLTF(PALLET);
  return useMemo(() => {
    let geo: THREE.BufferGeometry | null = null;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!geo && m.isMesh) geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    });
    const g = normalizeToUnit(geo ?? new THREE.BoxGeometry());
    g.computeBoundingBox();
    return g;
  }, [scene]);
}
