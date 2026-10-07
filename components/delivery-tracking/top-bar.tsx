"use client";

import { Bell, Building2, Eye, Layers, Navigation, Network, ScanLine, Truck, Warehouse } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { BuildingMode } from "@/three/delivery-tracking/scene-settings";
import { Panel, Segmented } from "./ui";

export type ViewChoice = "overview" | "warehouse" | "loading" | "network" | "follow";

function subscribeClock(cb: () => void) {
  const id = setInterval(cb, 15_000);
  return () => clearInterval(id);
}
const clock = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

interface TopBarProps {
  view: ViewChoice | null;
  onView: (v: ViewChoice) => void;
  mode: BuildingMode;
  onMode: (m: BuildingMode) => void;
  canFollow: boolean;
}

export function TopBar({ view, onView, mode, onMode, canFollow }: TopBarProps) {
  const time = useSyncExternalStore(subscribeClock, clock, () => "--:--");
  const i = "size-[15px]";
  return (
    <Panel className="flex h-14 items-center gap-3 px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-bold leading-tight tracking-tight sm:text-[17px]">Delivery Tracking</p>
          <p className="hidden truncate text-[11.5px] font-medium text-[#8a8f9a] sm:block">Berlin control tower</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#e3f4ea] px-2.5 py-1 text-[11px] font-bold text-[#1f7a4a]">
          <span className="live-pulse relative size-1.5 rounded-full bg-[#2fae6a] text-[#2fae6a]" aria-hidden />
          Live <span className="tabular-nums">{time}</span>
        </span>
      </div>

      <div className="ml-auto hidden min-w-0 items-center gap-2 md:flex">
        <Segmented<ViewChoice>
          label="Camera view"
          value={view}
          onChange={onView}
          options={[
            { value: "overview", label: "Overview", icon: <Eye className={i} /> },
            { value: "warehouse", label: "Warehouse", icon: <Warehouse className={i} /> },
            { value: "loading", label: "Loading", icon: <Truck className={i} /> },
            { value: "network", label: "Network", icon: <Network className={i} /> },
            ...(canFollow ? [{ value: "follow" as const, label: "Follow", icon: <Navigation className={i} /> }] : []),
          ]}
        />
        <Segmented<BuildingMode>
          label="Building view"
          value={mode}
          onChange={onMode}
          options={[
            { value: "operational", label: "Operational", icon: <Layers className={i} /> },
            { value: "exterior", label: "Exterior", icon: <Building2 className={i} /> },
            { value: "inside", label: "Inside", icon: <ScanLine className={i} /> },
          ]}
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 md:ml-1">
        <button
          type="button"
          className="relative grid size-9 place-items-center rounded-xl text-[#5f6470] hover:bg-black/5"
          aria-label="Notifications (sample)"
          title="Notifications"
        >
          <Bell className="size-[18px]" />
          <span className="absolute right-2 top-2 size-1.5 rounded-full bg-chili" aria-hidden />
        </button>
        <span className="hidden items-center gap-2 rounded-xl py-1 pl-1 pr-2 2xl:flex">
          <span className="grid size-8 place-items-center rounded-full bg-indigo text-[11px] font-bold text-mist">WA</span>
          <span className="leading-tight">
            <span className="block text-[12.5px] font-semibold">Warehouse Admin</span>
            <span className="block text-[11px] text-[#8a8f9a]">Operations</span>
          </span>
        </span>
      </div>
    </Panel>
  );
}
