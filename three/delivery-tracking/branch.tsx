"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { BerlinGeo } from "@/features/delivery-tracking/berlin-geo";
import { geoToScene } from "@/features/delivery-tracking/geo";
import { unflatten } from "@/features/delivery-tracking/route-math";
import type { Branch as BranchData, GeoPoint, Vec2 } from "@/features/delivery-tracking/types";
import { branchRegistry } from "./branch-registry";
import { extrudeFootprint, pointInRing, splitExtrude } from "./city/city-buildings";
import { MapPin } from "./map-pin";
import { GEO, MAT, PALETTE } from "./materials";
import { SceneLabel } from "./scene-label";
import { sceneMetrics } from "./scene-metrics";
import { useSceneSettings } from "./scene-settings";
import { useSignTexture } from "./sign-texture";
import { Worker } from "./worker";
import type { WorkerRoutine } from "@/features/delivery-tracking/worker-routines";

export interface BranchSite {
  /** Index of the real OSM building at the address (-1 = none found). */
  buildingIndex: number;
  footprint: Vec2[] | null;
  height: number;
  /** Address point in scene metres. */
  point: Vec2;
  /** Facade edge facing the street: midpoint, outward normal, length. */
  facade: { mid: Vec2; normal: Vec2; length: number };
}

/**
 * The storefront is the street-facing edge of the branch building closest to
 * where the van stops (OSRM route end), centred as near the address as fits.
 */
export function resolveBranchSite(geo: BerlinGeo, location: GeoPoint, buildingIndex: number, streetPoint: Vec2 | null): BranchSite {
  const point = geoToScene(location);
  const b = buildingIndex >= 0 ? geo.buildings[buildingIndex] : null;
  const footprint = b ? unflatten(b.p) : null;
  const height = b ? Math.max(8, Math.min(b.h, 26)) : 12;
  const street = streetPoint ?? point;
  const sd = Math.hypot(street[0] - point[0], street[1] - point[1]) || 1;
  let facade = {
    mid: [point[0], point[1]] as Vec2,
    normal: [(street[0] - point[0]) / sd, (street[1] - point[1]) / sd] as Vec2,
    length: 10,
  };
  if (footprint) {
    let best = Infinity;
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i];
      const c = footprint[(i + 1) % footprint.length];
      const ex = c[0] - a[0];
      const ez = c[1] - a[1];
      const len = Math.hypot(ex, ez);
      if (len < 4) continue;
      let nx = -ez / len;
      let nz = ex / len;
      const midx = (a[0] + c[0]) / 2;
      const midz = (a[1] + c[1]) / 2;
      if (pointInRing([midx + nx * 0.6, midz + nz * 0.6], footprint)) {
        nx = -nx;
        nz = -nz;
      }
      // Closest point on the edge to the van's stop.
      const u = Math.min(1, Math.max(0, ((street[0] - a[0]) * ex + (street[1] - a[1]) * ez) / (len * len)));
      const px = a[0] + ex * u;
      const pz = a[1] + ez * u;
      const faces = nx * (street[0] - px) + nz * (street[1] - pz) > 0;
      const score = Math.hypot(street[0] - px, street[1] - pz) + (faces ? 0 : 80);
      if (score >= best) continue;
      best = score;
      // Centre the shop on the address projected onto this edge, kept inside it.
      const ua = Math.min(1, Math.max(0, ((point[0] - a[0]) * ex + (point[1] - a[1]) * ez) / (len * len)));
      const half = Math.min(4.5, len / 2);
      const uu = Math.min(1 - half / len, Math.max(half / len, (ua + u) / 2));
      facade = { mid: [a[0] + ex * uu, a[1] + ez * uu], normal: [nx, nz], length: Math.min(len, 12) };
    }
  }
  return { buildingIndex, footprint, height, point, facade };
}

const ringGeo = new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2);

interface BranchProps {
  branch: BranchData;
  site: BranchSite;
  selected: boolean;
  hasActiveDelivery: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

/**
 * An AsiaMight branch, rendered on the REAL building at its address: branded
 * ground-floor storefront + fascia sign on the street facade, a status glow
 * ring and a map pin. Clicking it opens the branch card.
 */
export const Branch = memo(function Branch({ branch, site, selected, hasActiveDelivery, onSelect, onHover }: BranchProps) {
  const { animate } = useSceneSettings();
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: PALETTE.jade, transparent: true, opacity: 0.5, depthWrite: false }),
    [],
  );

  const fascia = useSignTexture({
    title: "AsiaMight",
    subtitle: branch.shortName,
    background: "#d6472c",
    foreground: "#fff7ee",
    mark: true,
    markColor: "#fff7ee",
    width: 1024,
    height: 256,
  });

  const geometry = useMemo(() => {
    if (!site.footprint) return null;
    const storefront = extrudeFootprint(site.footprint, 4.2);
    const upper = extrudeFootprint(site.footprint, site.height - 4.2, 4.2);
    const [, storeSides] = splitExtrude(storefront);
    const [upperCaps, upperSides] = splitExtrude(upper);
    storefront.dispose();
    upper.dispose();
    return { storeSides, upperCaps, upperSides };
  }, [site]);
  useEffect(
    () => () => {
      geometry?.storeSides.dispose();
      geometry?.upperCaps.dispose();
      geometry?.upperSides.dispose();
    },
    [geometry],
  );

  useEffect(() => {
    branchRegistry.set(branch.id, { point: site.point, facadeMid: site.facade.mid, normal: site.facade.normal, height: site.height });
    return () => {
      branchRegistry.delete(branch.id);
    };
  }, [branch.id, site]);

  const radius = useMemo(() => {
    if (!site.footprint) return 14;
    return Math.max(12, ...site.footprint.map(([x, z]) => Math.hypot(x - site.point[0], z - site.point[1]))) + 6;
  }, [site]);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = animate ? clock.elapsedTime : 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    const s = Math.max(radius, 14 * sceneMetrics.metersPerPx);
    ring.current.scale.setScalar(s * (1 + pulse * 0.08));
    ringMat.opacity = (selected ? 0.55 : 0.22) + pulse * 0.15;
  });

  // Street life: two passers-by on the sidewalk in front of the shop.
  const pedestrians = useMemo(() => {
    const [mx, mz] = site.facade.mid;
    const [nx, nz] = site.facade.normal;
    const tx = -nz;
    const tz = nx;
    const walk = (off: number, span: number, id: string, startLeft: boolean): WorkerRoutine => {
      const a: Vec2 = [mx + nx * off - tx * span, mz + nz * off - tz * span];
      const b: Vec2 = [mx + nx * off + tx * span, mz + nz * off + tz * span];
      const [p, q] = startLeft ? [a, b] : [b, a];
      return {
        id,
        start: p,
        floor: 0.06,
        loop: true,
        steps: [
          { t: "walk", to: q },
          { t: "idle", s: 2.5 },
          { t: "walk", to: p },
          { t: "idle", s: 3.5 },
        ],
      };
    };
    return [walk(3.2, 13, `${branch.id}-ped-a`, true), walk(4.4, 9, `${branch.id}-ped-b`, false)];
  }, [site, branch.id]);

  const { mid, normal, length } = site.facade;
  const facadeYaw = Math.atan2(normal[0], normal[1]);
  const signW = Math.min(9, Math.max(5, length * 0.7));
  const pinTop = site.height + 4;

  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect(branch.id);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHover(branch.id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      onHover(null);
      document.body.style.cursor = "";
    },
  };

  return (
    <group>
      {geometry ? (
        <group {...handlers}>
          <mesh name="city-buildings" geometry={geometry.storeSides} material={MAT.chili} castShadow receiveShadow />
          <mesh name="city-buildings" geometry={geometry.upperSides} material={MAT.wallWhite} castShadow receiveShadow />
          <mesh name="city-buildings" geometry={geometry.upperCaps} material={MAT.roof} castShadow receiveShadow />
        </group>
      ) : (
        <mesh position={[site.point[0], 6, site.point[1]]} scale={[14, 12, 10]} geometry={GEO.box} material={MAT.wallWhite} castShadow {...handlers} />
      )}

      {/* Street facade: glazing + fascia sign */}
      <group position={[mid[0] + normal[0] * 0.08, 0, mid[1] + normal[1] * 0.08]} rotation-y={facadeYaw}>
        <mesh position={[0, 1.9, 0.02]} scale={[Math.min(length - 1.2, 10), 2.8, 0.06]} geometry={GEO.box} material={MAT.glassBlue} />
        <mesh position={[0, 3.55, 0.6]} scale={[Math.min(length, 11), 0.14, 1.3]} geometry={GEO.box} material={MAT.ink} castShadow />
        <mesh position={[0, 5.15, 0.1]}>
          <planeGeometry args={[signW, signW / 4]} />
          <meshStandardMaterial map={fascia} roughness={0.5} />
        </mesh>
      </group>

      {pedestrians.map((r, i) => (
        <Worker key={r.id} role={i === 0 ? "pedestrian" : "pedestrianAlt"} routine={r} seed={i + 3} cullDistance={260} />
      ))}

      <mesh ref={ring} geometry={ringGeo} material={ringMat} position={[site.point[0], 0.2, site.point[1]]} renderOrder={4} />

      <group {...handlers}>
        <MapPin position={[site.point[0], pinTop, site.point[1]]} color={hasActiveDelivery ? PALETTE.chili : PALETTE.jade} size={2.2} minPx={38} />
      </group>
      <SceneLabel
        position={[site.point[0], pinTop, site.point[1]]}
        kind="branch"
        title={branch.name}
        subtitle={hasActiveDelivery ? "Delivery en route" : `${branch.stats.deliveriesToday} today`}
        screenOffsetY={-58}
        details={
          selected
            ? [
                { label: branch.street },
                { label: `${branch.postcode} ${branch.city}` },
                { label: "Deliveries today", value: String(branch.stats.deliveriesToday) },
                { label: "Pending", value: String(branch.stats.pending) },
              ]
            : undefined
        }
      />
    </group>
  );
});
