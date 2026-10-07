"use client";

import { ArrowRight, Pause, Play } from "lucide-react";
import { Fragment } from "react";
import { INSIDE_ORDER, type InsideStop } from "@/features/delivery-tracking/scene-layout";
import { cn } from "@/lib/utils";
import { Panel } from "./ui";

const LABELS: Record<InsideStop, string> = { storage: "Storage", picking: "Picking", packing: "Packing", loading: "Loading" };

/** Inside view: walk the order path Storage → Picking → Packing → Loading. */
interface InsideTourProps {
  stop: InsideStop;
  onStop: (s: InsideStop) => void;
  playing: boolean;
  onPlaying: (p: boolean) => void;
  className?: string;
}

export function InsideTour({ stop, onStop, playing, onPlaying, className }: InsideTourProps) {
  return (
    <Panel className={cn("flex items-center gap-1 p-1", className)} role="group" aria-label="Inside view tour">
      <button
        type="button"
        onClick={() => onPlaying(!playing)}
        aria-pressed={playing}
        title={playing ? "Pause tour" : "Play tour"}
        className="grid size-8 place-items-center rounded-[10px] text-[#4b5060] hover:bg-black/5"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        <span className="sr-only">{playing ? "Pause tour" : "Play tour"}</span>
      </button>
      {INSIDE_ORDER.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <ArrowRight className="size-3.5 shrink-0 text-[#b0b4bc]" aria-hidden />}
          <button
            type="button"
            onClick={() => onStop(s)}
            aria-pressed={stop === s}
            className={cn(
              "h-8 rounded-[10px] px-3 text-[12.5px] font-semibold transition-colors",
              stop === s ? "bg-chili text-white" : "text-[#4b5060] hover:bg-black/5",
            )}
          >
            {LABELS[s]}
          </button>
        </Fragment>
      ))}
    </Panel>
  );
}
