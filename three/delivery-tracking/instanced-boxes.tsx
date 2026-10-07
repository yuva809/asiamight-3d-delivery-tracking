"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GEO } from "./materials";
import { applyBoxInstances, type BoxInstance } from "./utils";

interface InstancedBoxesProps {
  items: BoxInstance[];
  /** Base material. If items carry colours, use a white/neutral base colour. */
  material: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  geometry?: THREE.BufferGeometry;
  renderOrder?: number;
  /** Frustum-cull using the instances' bounding sphere (for spatially compact groups). */
  culled?: boolean;
}

/** One draw call for any number of boxes (racks, cartons, pallets, markings…). */
export function InstancedBoxes({
  items,
  material,
  castShadow = false,
  receiveShadow = false,
  geometry = GEO.box,
  renderOrder = 0,
  culled = false,
}: InstancedBoxesProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const capacity = Math.max(1, items.length);
  const hasColors = useMemo(() => items.some((i) => i.color), [items]);

  useLayoutEffect(() => {
    if (ref.current) applyBoxInstances(ref.current, items);
  }, [items]);

  return (
    <instancedMesh
      // Re-create when capacity or colour mode changes.
      key={`${capacity}-${hasColors}`}
      ref={ref}
      args={[geometry, material, capacity]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={culled}
      renderOrder={renderOrder}
    />
  );
}
