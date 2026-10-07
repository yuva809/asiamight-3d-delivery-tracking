"use client";

import { useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  CONVEYOR,
  DOCKS,
  FLOOR_Y,
  PACKING_TABLES,
  WAREHOUSE,
  ZONES,
} from "@/features/delivery-tracking/scene-layout";
import type { ZoneId } from "@/features/delivery-tracking/types";
import { usePalletGeometry } from "./assets";
import { AnimatedForklift, PalletJack, PickCart } from "./equipment";
import { InstancedBoxes } from "./instanced-boxes";
import { MapPin } from "./map-pin";
import { GEO, MAT, PALETTE } from "./materials";
import { Conveyor, PackingStation } from "./packing-station";
import { SceneLabel } from "./scene-label";
import { useSceneSettings } from "./scene-settings";
import { StorageShelves, type ShelfRow } from "./storage-shelves";
import { rectToBox, seeded, type BoxInstance } from "./utils";

// Bulk pallet racking (storage) — rows run east-west.
const STORAGE_ROWS: ShelfRow[] = [-13.6, -9.8, -8.7, -5.0].map((z) => ({
  x0: -22.6,
  z,
  bays: 7,
  bayLength: 2.7,
  depth: 1.1,
  levels: [0, 1.5, 2.95, 4.4],
  uprightHeight: 5.6,
}));

// Pick-face shelving (picking).
const PICK_ROWS: ShelfRow[] = [-13.6, -10.4, -7.2, -4.0].map((z) => ({
  x0: 1.6,
  z,
  bays: 11,
  bayLength: 1.8,
  depth: 0.8,
  levels: [0.15, 0.85, 1.55],
  uprightHeight: 2.3,
}));

const FORKLIFT_PATH: [number, number][] = [
  [-21.5, -3.1],
  [-14, -3.1],
  [-8, -3.1],
];

interface WarehouseInteriorProps {
  /** Zone highlighted by the order flow (null = none). */
  activeZone: ZoneId | null;
  /** Where the floating order pin sits (null = hidden). */
  pinZone: ZoneId | null;
}

/**
 * Everything inside the building, grouped by operational zone. Zone ids match
 * the domain ZoneId so the order flow can highlight a zone without knowing
 * its geometry.
 */
export const WarehouseInterior = memo(function WarehouseInterior({ activeZone, pinZone }: WarehouseInteriorProps) {
  const { buildingMode } = useSceneSettings();
  const pinRect = ZONES.find((z) => z.id === pinZone);
  const pin = pinRect ? rectToBox(pinRect.rect) : null;

  return (
    <group>
      <ZoneFloor activeZone={activeZone} />
      <StorageShelves rows={STORAGE_ROWS} load="pallet" fill={0.84} seed={11} />
      <StorageShelves rows={PICK_ROWS} load="carton" fill={0.9} seed={23} uprightColor={PALETTE.steel} beamColor={PALETTE.jade} />
      {PACKING_TABLES.map(([x, z], i) => (
        <PackingStation key={i} position={[x, z]} rotation={i < 3 ? 0 : Math.PI} />
      ))}
      <Conveyor from={CONVEYOR.from} to={CONVEYOR.to} cartons={5} />
      <LoadingStaging />
      <ChargingBay />

      <AnimatedForklift path={FORKLIFT_PATH} />
      <PalletJack position={[-12.4, FLOOR_Y, 4.6]} rotation={Math.PI / 2} />
      <PickCart position={[20.6, FLOOR_Y, -2.6]} rotation={0} />
      <PickCart position={[6.2, FLOOR_Y, -12]} rotation={0} />
      <PickCart position={[-3, FLOOR_Y, -0.6]} rotation={Math.PI / 2} />

      {pin && (
        <MapPin position={[pin.cx, pinZone === "storage" ? 6.6 : 3.4, pin.cz]} color={PALETTE.chili} size={0.55} minPx={26} />
      )}

      {buildingMode !== "exterior" &&
        ZONES.map((z) => {
          const r = rectToBox(z.rect);
          return (
            <SceneLabel
              key={z.id}
              kind="zone"
              title={z.label}
              accent={z.color}
              position={[r.cx, z.id === "storage" ? 6.6 : 3.2, z.id === "loading" ? r.cz - 3 : r.cz]}
              maxDistance={150}
            />
          );
        })}
    </group>
  );
});

const FLOOR_TONE = new THREE.Color(PALETTE.floor);

function ZoneFloor({ activeZone }: { activeZone: ZoneId | null }) {
  const { animate } = useSceneSettings();
  const glow = useRef<THREE.Mesh>(null);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: PALETTE.chili, transparent: true, opacity: 0.18, depthWrite: false }), []);
  const active = ZONES.find((z) => z.id === activeZone);

  const { tints, lines, walkway } = useMemo(() => {
    const tints: BoxInstance[] = [];
    const lines: BoxInstance[] = [];
    const walkway: BoxInstance[] = [];
    const y = FLOOR_Y + 0.004;
    for (const z of ZONES) {
      const r = rectToBox(z.rect);
      const tone = FLOOR_TONE.clone().lerp(new THREE.Color(z.color), 0.1);
      tints.push({ position: [r.cx, y, r.cz], scale: [r.w, 0.006, r.d], color: `#${tone.getHexString()}` });
      const lw = 0.12;
      const [x0, z0, x1, z1] = z.rect;
      const ly = y + 0.004;
      lines.push({ position: [r.cx, ly, z0], scale: [r.w, 0.006, lw], color: PALETTE.markingYellow });
      lines.push({ position: [r.cx, ly, z1], scale: [r.w, 0.006, lw], color: PALETTE.markingYellow });
      lines.push({ position: [x0, ly, r.cz], scale: [lw, 0.006, r.d], color: PALETTE.markingYellow });
      lines.push({ position: [x1, ly, r.cz], scale: [lw, 0.006, r.d], color: PALETTE.markingYellow });
    }
    // Green pedestrian walkway along the central aisle.
    walkway.push({ position: [0, y + 0.006, -0.6], scale: [46, 0.006, 1.2], color: "#cfe3d3" });
    for (const d of DOCKS) {
      for (const s of [-1, 1]) {
        lines.push({ position: [d.x + s * 1.55, y + 0.006, WAREHOUSE.maxZ - 1.8], scale: [0.12, 0.006, 3.6], color: PALETTE.markingYellow });
      }
    }
    return { tints, lines, walkway };
  }, []);

  useFrame(({ clock }) => {
    if (!glow.current) return;
    const t = animate ? clock.elapsedTime : 0;
    (glow.current.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(t * 3));
  });

  const ar = active ? rectToBox(active.rect) : null;
  return (
    <>
      <InstancedBoxes items={tints} material={MAT.matte} receiveShadow />
      <InstancedBoxes items={lines} material={MAT.matte} />
      <InstancedBoxes items={walkway} material={MAT.matte} receiveShadow />
      {ar && (
        <mesh ref={glow} position={[ar.cx, FLOOR_Y + 0.02, ar.cz]} scale={[ar.w, 1, ar.d]} geometry={GEO.plane} material={glowMat} renderOrder={5} />
      )}
    </>
  );
}

/** Wrapped pallets queued behind the dock doors, ready for vans. */
function LoadingStaging() {
  const palletGeo = usePalletGeometry();
  const { pallets, loads, wrap } = useMemo(() => {
    const rand = seeded(5);
    const pallets: BoxInstance[] = [];
    const loads: BoxInstance[] = [];
    const wrap: BoxInstance[] = [];
    for (const d of DOCKS) {
      for (const z of [5.4, 7.6, 9.8]) {
        for (const side of [-0.7, 0.7]) {
          if (rand() < 0.3) continue;
          const x = d.x + side;
          pallets.push({ position: [x, FLOOR_Y + 0.07, z], scale: [1.2, 0.14, 1.0], color: PALETTE.pallet });
          const h = 0.7 + rand() * 0.7;
          const blue = rand() < 0.25;
          loads.push({
            position: [x, FLOOR_Y + 0.14 + h / 2, z],
            scale: [1.1, h, 0.92],
            color: blue ? PALETTE.tote : rand() < 0.5 ? PALETTE.kraft : PALETTE.kraftDark,
          });
          wrap.push({ position: [x, FLOOR_Y + 0.14 + h * 0.52, z], scale: [1.13, h * 0.9, 0.95] });
        }
      }
    }
    return { pallets, loads, wrap };
  }, []);
  return (
    <>
      <InstancedBoxes items={pallets} material={MAT.matte} geometry={palletGeo} castShadow />
      <InstancedBoxes items={loads} material={MAT.matte} castShadow />
      <InstancedBoxes items={wrap} material={MAT.wrap} />
    </>
  );
}

function ChargingBay() {
  const items = useMemo<BoxInstance[]>(
    () => [
      { position: [21.8, FLOOR_Y + 0.75, 14.4], scale: [0.6, 1.5, 0.35], color: "#f4f4f2" },
      { position: [19.6, FLOOR_Y + 0.75, 14.4], scale: [0.6, 1.5, 0.35], color: "#f4f4f2" },
      { position: [21.8, FLOOR_Y + 1.25, 14.2], scale: [0.4, 0.22, 0.04], color: "#3fae6a" },
      { position: [19.6, FLOOR_Y + 1.25, 14.2], scale: [0.4, 0.22, 0.04], color: "#3fae6a" },
    ],
    [],
  );
  return <InstancedBoxes items={items} material={MAT.matte} castShadow />;
}
