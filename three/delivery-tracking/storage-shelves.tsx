"use client";

import { useMemo } from "react";
import { FLOOR_Y } from "@/features/delivery-tracking/scene-layout";
import { usePalletGeometry } from "./assets";
import { InstancedBoxes } from "./instanced-boxes";
import { MAT, PALETTE } from "./materials";
import { useSceneSettings } from "./scene-settings";
import { seeded, type BoxInstance } from "./utils";

export interface ShelfRow {
  /** West end of the row. */
  x0: number;
  /** Row centre line (rows run along x). */
  z: number;
  bays: number;
  bayLength: number;
  depth: number;
  /** Heights of load levels above the floor (0 = floor position). */
  levels: number[];
  uprightHeight: number;
}

interface StorageShelvesProps {
  rows: ShelfRow[];
  /** "pallet" = racked pallet loads; "carton" = pick shelving with cartons + totes. */
  load: "pallet" | "carton";
  /** 0..1 how full the racking is. */
  fill?: number;
  seed?: number;
  uprightColor?: string;
  beamColor?: string;
}

const CARTON_TONES = [PALETTE.kraft, PALETTE.kraftDark, "#d2b48a", "#bf9a6c"];

/**
 * Racking + stock in four draw calls total, however many bays there are.
 * Each later "PICKING" animation can target a bay by (row, bay, level).
 */
export function StorageShelves({
  rows,
  load,
  fill = 0.85,
  seed = 1,
  uprightColor = PALETTE.indigo,
  beamColor = PALETTE.saffron,
}: StorageShelvesProps) {
  const { lowPower } = useSceneSettings();
  const palletGeo = usePalletGeometry();

  const { uprights, beams, pallets, stock } = useMemo(() => {
    const rand = seeded(seed);
    const uprights: BoxInstance[] = [];
    const beams: BoxInstance[] = [];
    const pallets: BoxInstance[] = [];
    const stock: BoxInstance[] = [];
    const y0 = FLOOR_Y;

    for (const r of rows) {
      const len = r.bays * r.bayLength;
      for (let b = 0; b <= r.bays; b++) {
        const x = r.x0 + b * r.bayLength;
        for (const side of [-1, 1]) {
          uprights.push({
            position: [x, y0 + r.uprightHeight / 2, r.z + (side * r.depth) / 2],
            scale: [0.09, r.uprightHeight, 0.09],
            color: uprightColor,
          });
        }
      }
      for (const lvl of r.levels) {
        if (lvl === 0) continue;
        for (const side of [-1, 1]) {
          beams.push({
            position: [r.x0 + len / 2, y0 + lvl - 0.06, r.z + (side * r.depth) / 2],
            scale: [len, 0.12, 0.07],
            color: beamColor,
          });
        }
        if (load === "carton") {
          // Shelf decks for pick shelving.
          beams.push({
            position: [r.x0 + len / 2, y0 + lvl - 0.02, r.z],
            scale: [len, 0.04, r.depth],
            color: "#c9ccd1",
          });
        }
      }

      for (let b = 0; b < r.bays; b++) {
        const bx = r.x0 + b * r.bayLength;
        for (const lvl of r.levels) {
          const base = y0 + lvl;
          if (load === "pallet") {
            const slots = 2;
            const slotW = r.bayLength / slots;
            for (let s = 0; s < slots; s++) {
              if (rand() > fill) continue;
              const cx = bx + slotW * (s + 0.5);
              pallets.push({ position: [cx, base + 0.07, r.z], scale: [slotW * 0.84, 0.14, r.depth * 0.92], color: PALETTE.pallet });
              const h = 0.7 + rand() * 0.45;
              stock.push({
                position: [cx, base + 0.14 + h / 2, r.z],
                scale: [slotW * 0.78, h, r.depth * 0.86],
                color: CARTON_TONES[Math.floor(rand() * CARTON_TONES.length)],
              });
            }
          } else {
            let cursor = bx + 0.06;
            const end = bx + r.bayLength - 0.06;
            const maxH = Math.min(0.55, (r.levels[1] ?? 0.7) - 0.15);
            while (cursor < end - 0.25) {
              const w = 0.3 + rand() * 0.3;
              if (cursor + w > end) break;
              if (rand() < fill) {
                const tote = rand() < 0.3;
                const h = tote ? 0.3 : 0.22 + rand() * (maxH - 0.22);
                stock.push({
                  position: [cursor + w / 2, base + h / 2 + 0.01, r.z],
                  scale: [w * 0.94, h, r.depth * (tote ? 0.9 : 0.75)],
                  color: tote ? PALETTE.tote : CARTON_TONES[Math.floor(rand() * CARTON_TONES.length)],
                });
              }
              cursor += w + 0.04;
            }
          }
        }
      }
    }
    if (lowPower) {
      // Thin out stock on weak devices; racking keeps the read.
      return { uprights, beams, pallets: pallets.filter((_, i) => i % 2 === 0), stock: stock.filter((_, i) => i % 2 === 0) };
    }
    return { uprights, beams, pallets, stock };
  }, [rows, load, fill, seed, uprightColor, beamColor, lowPower]);

  return (
    <group>
      <InstancedBoxes items={uprights} material={MAT.matte} castShadow />
      <InstancedBoxes items={beams} material={MAT.matte} castShadow />
      {pallets.length > 0 && <InstancedBoxes items={pallets} material={MAT.matte} geometry={palletGeo} castShadow />}
      <InstancedBoxes items={stock} material={MAT.matte} castShadow />
    </group>
  );
}
