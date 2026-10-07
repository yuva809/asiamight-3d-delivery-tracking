"use client";

import { Info, Minus, Plus, RotateCcw, Tag } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "./ui";

interface MapToolsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  className?: string;
}

const LEGEND = [
  { label: "Warehouse", color: "#d6472c" },
  { label: "Branch", color: "#3f8a5f" },
  { label: "Delivery van", color: "#3b7bea" },
  { label: "Route", color: "#e8806b" },
  { label: "Worker", color: "#f2b233" },
];

function Tool({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={cn("grid size-9 place-items-center rounded-xl transition-colors", pressed ? "bg-ink text-white" : "text-[#4b5060] hover:bg-black/5")}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** Vertical map controls + legend popover. */
export function MapTools({ onZoomIn, onZoomOut, onReset, showLabels, onToggleLabels, className }: MapToolsProps) {
  const [legend, setLegend] = useState(false);
  return (
    <div className={cn("pointer-events-none flex flex-col items-end gap-2", className)}>
      <Panel className="flex flex-col gap-0.5 p-1">
        <Tool label="Zoom in" onClick={onZoomIn}>
          <Plus className="size-4" />
        </Tool>
        <Tool label="Zoom out" onClick={onZoomOut}>
          <Minus className="size-4" />
        </Tool>
        <span className="mx-1.5 my-0.5 h-px bg-black/[0.07]" aria-hidden />
        <Tool label="Reset view" onClick={onReset}>
          <RotateCcw className="size-4" />
        </Tool>
        <Tool label="Labels" onClick={onToggleLabels} pressed={showLabels}>
          <Tag className="size-4" />
        </Tool>
        <Tool label="Legend" onClick={() => setLegend((l) => !l)} pressed={legend}>
          <Info className="size-4" />
        </Tool>
      </Panel>
      {legend && (
        <Panel className="w-[164px] px-3 py-2.5">
          <ul className="flex flex-col gap-1.5">
            {LEGEND.map((l) => (
              <li key={l.label} className="flex items-center gap-2 text-[12px] font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden />
                {l.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-black/[0.06] pt-2 text-[10.5px] leading-snug text-[#9aa0aa]">Map data © OpenStreetMap contributors</p>
        </Panel>
      )}
    </div>
  );
}
