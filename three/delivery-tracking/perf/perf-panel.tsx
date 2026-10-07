"use client";

import { useSyncExternalStore } from "react";
import { perfPanelEnabled, perfStore, type PerfSnapshot } from "./perf-store";

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const noSub = () => () => {};

/** Temporary developer performance panel (dev builds, or `?perf`). */
export function PerfPanel({ onQuality, mode }: { onQuality?: (q: QualityChoice) => void; mode?: QualityChoice }) {
  const enabled = useSyncExternalStore(noSub, perfPanelEnabled, () => false);
  const s: PerfSnapshot | null = useSyncExternalStore(perfStore.subscribe, perfStore.get, () => null);
  if (!enabled || !s) return null;
  const tone = s.fps >= 55 ? "text-[#3fd17c]" : s.fps >= 40 ? "text-[#f2b233]" : "text-[#ff6b57]";
  return (
    <div className="pointer-events-auto absolute bottom-3 right-[372px] z-50 hidden w-[208px] rounded-xl bg-[#111318]/90 p-3 font-mono text-[10.5px] leading-[1.55] text-[#d7dbe2] shadow-lg backdrop-blur lg:block">
      <div className="mb-1 flex items-baseline justify-between">
        <span className={`text-[18px] font-bold ${tone}`}>{s.fps} fps</span>
        <span className="text-[#8a93a3]">{s.frameMs} ms</span>
      </div>
      <Row k="p95 frame" v={`${s.frameP95} ms`} />
      <Row k="CPU / frame" v={`${s.cpuMs} ms`} />
      <Row k="draw calls" v={fmt(s.calls)} />
      <Row k="triangles" v={fmt(s.triangles)} />
      <Row k="geometries" v={fmt(s.geometries)} />
      <Row k="textures" v={fmt(s.textures)} />
      <Row k="programs" v={fmt(s.programs)} />
      <Row k="pixel ratio" v={String(s.dpr)} />
      {s.heapMB !== null && <Row k="JS heap" v={`${s.heapMB} MB`} />}
      <div className="mt-1 border-t border-white/10 pt-1 text-[#8a93a3]">animated / frame</div>
      {Object.entries(s.animated).map(([k, v]) => (
        <Row key={k} k={k} v={String(v)} />
      ))}
      <div className="mt-1 flex items-center justify-between border-t border-white/10 pt-1.5">
        <span className="text-[#8a93a3]">quality</span>
        <span className="font-bold">{s.quality}</span>
      </div>
      {onQuality && (
        <div className="mt-1.5 grid grid-cols-4 gap-1">
          {(["auto", "high", "medium", "low"] as const).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onQuality(q)}
              className={`rounded px-1 py-0.5 text-[10px] uppercase ${mode === q ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type QualityChoice = "auto" | "high" | "medium" | "low";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#8a93a3]">{k}</span>
      <span>{v}</span>
    </div>
  );
}
