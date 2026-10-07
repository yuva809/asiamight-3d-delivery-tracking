"use client";

import { useEffect, useState } from "react";
import { loadBerlinGeo, type BerlinGeo } from "@/features/delivery-tracking/berlin-geo";
import { geoToScene } from "@/features/delivery-tracking/geo";
import type { Branch, WarehouseInfo } from "@/features/delivery-tracking/types";

const VIEW = { x: -15000, z: -9800, w: 21500, h: 13800 };

function path(flat: number[]) {
  let d = "";
  for (let i = 0; i + 1 < flat.length; i += 2) d += `${i === 0 ? "M" : "L"}${Math.round(flat[i])} ${Math.round(flat[i + 1])}`;
  return d;
}

/**
 * Flat SVG map of the same real Berlin data, shown when WebGL is unavailable
 * so the page still communicates warehouse → roads → branches.
 */
export function SiteSchematic({ warehouse, branches }: { warehouse: WarehouseInfo; branches: Branch[] }) {
  const [geo, setGeo] = useState<BerlinGeo | null>(null);
  useEffect(() => {
    let alive = true;
    loadBerlinGeo()
      .then((g) => alive && setGeo(g))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const [wx, wz] = geoToScene(warehouse.location);
  const majors = geo?.majorRoads.filter((r) => r.c !== "secondary").map((r) => path(r.p)).join("") ?? "";
  return (
    <div className="flex h-full w-full flex-col pt-36">
      <p className="mx-auto max-w-md px-4 text-center text-[12.5px] text-[#6b7080]">
        3D view needs WebGL, which is turned off or unsupported in this browser. Showing a flat map of the same data.
      </p>
      <svg viewBox={`${VIEW.x} ${VIEW.z} ${VIEW.w} ${VIEW.h}`} className="min-h-0 w-full flex-1" role="img" aria-label="Map of Berlin with the AsiaMight warehouse, delivery routes and four branches">
        {geo?.water.map((p, i) => <path key={i} d={path(p) + "Z"} fill="#c9dcea" />)}
        <path d={majors} fill="none" stroke="#c6c8d1" strokeWidth={28} strokeLinejoin="round" />
        {geo?.routes.map((r) => <path key={r.branchId} d={path(r.p)} fill="none" stroke="#d6472c" strokeWidth={60} strokeLinejoin="round" opacity={0.7} />)}
        <circle cx={wx} cy={wz} r={220} fill="#d6472c" />
        <text x={wx} y={wz + 620} textAnchor="middle" fontSize={340} fontWeight={700} fill="#1d1b18">
          AsiaMight Warehouse
        </text>
        {branches.map((b) => {
          const [x, z] = geoToScene(b.location);
          return (
            <g key={b.id}>
              <circle cx={x} cy={z} r={170} fill="#3f8a5f" />
              <text x={x} y={z - 300} textAnchor="middle" fontSize={300} fontWeight={700} fill="#1d1b18">
                {b.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
