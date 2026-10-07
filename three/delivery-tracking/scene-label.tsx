"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { createContext, useContext, useEffect, useId, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { useSceneSettings } from "./scene-settings";

export type LabelKind = "warehouse" | "branch" | "van" | "zone";

const DOT: Record<LabelKind, string> = {
  warehouse: "#d6472c",
  branch: "#4c7a5a",
  van: "#3e4e77",
  zone: "transparent",
};

export interface LabelSpec {
  id: string;
  title: string;
  subtitle?: string;
  kind: LabelKind;
  accent?: string;
  maxDistance: number;
  minDistance: number;
  /** Extra screen-space offset in px (negative = up). */
  screenOffsetY: number;
  /** Pulsing "live" dot. */
  live?: boolean;
  /** Expanded card rows (shown e.g. while a branch is hovered). */
  details?: { label: string; value?: string }[];
  anchor: THREE.Object3D;
}

/**
 * Labels are plain DOM in one overlay layer (outside the canvas), positioned
 * each frame by a single projector. One React tree, no per-label roots, no
 * re-renders while the camera moves.
 */
export function createLabelStore() {
  let specs: LabelSpec[] = [];
  const listeners = new Set<() => void>();
  const elements = new Map<string, HTMLDivElement>();
  const emit = () => listeners.forEach((l) => l());
  return {
    elements,
    add(spec: LabelSpec) {
      specs = [...specs.filter((s) => s.id !== spec.id), spec];
      emit();
    },
    remove(id: string) {
      specs = specs.filter((s) => s.id !== id);
      elements.delete(id);
      emit();
    },
    getSpecs: () => specs,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}
export type LabelStore = ReturnType<typeof createLabelStore>;

const LabelStoreContext = createContext<LabelStore | null>(null);
export const LabelStoreProvider = LabelStoreContext.Provider;

interface SceneLabelProps {
  position: [number, number, number];
  title: string;
  subtitle?: string;
  kind: LabelKind;
  /** Fade out when the camera is further than this (scene units). */
  maxDistance?: number;
  /** Fade out when the camera is closer than this. */
  minDistance?: number;
  accent?: string;
  screenOffsetY?: number;
  live?: boolean;
  details?: { label: string; value?: string }[];
}

/** Declares a label anchored to a point in the 3D scene (follows its parent). */
export function SceneLabel({
  position,
  title,
  subtitle,
  kind,
  maxDistance = Infinity,
  minDistance = 0,
  accent,
  screenOffsetY = 0,
  live = false,
  details,
}: SceneLabelProps) {
  const store = useContext(LabelStoreContext);
  const anchor = useRef<THREE.Group>(null);
  const id = useId();

  // Compare details by content so a new array with the same rows is a no-op.
  const detailsKey = details ? JSON.stringify(details) : "";

  useEffect(() => {
    if (!store || !anchor.current) return;
    const parsed = detailsKey ? (JSON.parse(detailsKey) as LabelSpec["details"]) : undefined;
    store.add({ id, title, subtitle, kind, accent, maxDistance, minDistance, screenOffsetY, live, details: parsed, anchor: anchor.current });
    return () => store.remove(id);
  }, [store, id, title, subtitle, kind, accent, maxDistance, minDistance, screenOffsetY, live, detailsKey]);

  return <group ref={anchor} position={position} />;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
/** Last style state written per label element, to skip redundant DOM writes. */
const written = new WeakMap<HTMLElement, string>();

/** Inside the Canvas: projects every label anchor to screen space once per frame. */
export function LabelProjector() {
  const store = useContext(LabelStoreContext);
  const { showLabels } = useSceneSettings();
  const size = useThree((s) => s.size);

  useFrame(({ camera }) => {
    if (!store || !showLabels) return;
    for (const spec of store.getSpecs()) {
      const el = store.elements.get(spec.id);
      if (!el) continue;
      spec.anchor.getWorldPosition(_w);
      const d = camera.position.distanceTo(_w);
      _v.copy(_w).project(camera);
      const onScreen = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      const fadeOut = Number.isFinite(spec.maxDistance)
        ? THREE.MathUtils.clamp((spec.maxDistance - d) / (spec.maxDistance * 0.15), 0, 1)
        : 1;
      const fadeIn = spec.minDistance > 0 ? THREE.MathUtils.clamp((d - spec.minDistance) / (spec.minDistance * 0.25), 0, 1) : 1;
      const o = onScreen ? fadeOut * fadeIn : 0;
      // Hidden labels: one write, then nothing until they come back.
      const hidden = o < 0.02;
      const prev = written.get(el);
      if (hidden) {
        if (prev !== "hidden") {
          el.style.visibility = "hidden";
          written.set(el, "hidden");
        }
        continue;
      }
      const x = ((_v.x + 1) / 2) * size.width;
      const y = ((1 - _v.y) / 2) * size.height + spec.screenOffsetY;
      const key = `${x.toFixed(1)},${y.toFixed(1)},${o.toFixed(2)},${Math.round(d / 4)}`;
      if (prev === key) continue; // camera still → zero style writes / no relayout
      written.set(el, key);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = o.toFixed(2);
      el.style.visibility = "visible";
      // Nearer labels on top.
      el.style.zIndex = String(Math.max(0, 1000 - Math.round(d)));
    }
  });
  return null;
}

/** Outside the Canvas: the DOM layer that holds every label. */
export function LabelLayer({ store, visible }: { store: LabelStore; visible: boolean }) {
  const specs = useSyncExternalStore(store.subscribe, store.getSpecs, store.getSpecs);
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {specs.map((s) => (
        <div
          key={s.id}
          ref={(el) => {
            if (el) store.elements.set(s.id, el);
          }}
          className="absolute left-0 top-0 select-none whitespace-nowrap will-change-transform"
          style={{ visibility: "hidden" }}
        >
          {s.details ? (
            <div className="w-[220px] -translate-y-[30%] rounded-2xl border border-black/[0.06] bg-white/95 p-3 shadow-[0_14px_34px_-14px_rgba(24,22,30,0.4)]">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: s.accent ?? DOT[s.kind] }} />
                <span className="truncate text-[13px] font-bold text-[#18140f]">{s.title}</span>
              </div>
              <dl className="mt-2 flex flex-col gap-1">
                {s.details.map((d) =>
                  d.value === undefined ? (
                    <dd key={d.label} className="text-[11.5px] leading-snug text-[#5b6170]">
                      {d.label}
                    </dd>
                  ) : (
                    <div key={d.label} className="flex items-center justify-between text-[11.5px]">
                      <dt className="text-[#6b7080]">{d.label}</dt>
                      <dd className="font-bold tabular-nums text-[#18140f]">{d.value}</dd>
                    </div>
                  ),
                )}
              </dl>
            </div>
          ) : s.kind === "zone" ? (
            <div
              className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-sm"
              style={{ background: s.accent ?? "#3e4e77" }}
            >
              {s.title}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full border border-black/5 bg-white/92 py-1 pl-1.5 pr-2.5 shadow-[0_4px_14px_-6px_rgba(24,20,15,0.35)]">
              <span
                className={s.live ? "live-pulse relative size-2 rounded-full" : "size-2 rounded-full"}
                style={{ background: s.accent ?? DOT[s.kind], color: s.accent ?? DOT[s.kind] }}
              />
              <span className="text-[11px] font-bold leading-none text-[#18140f]">{s.title}</span>
              {s.subtitle ? <span className="text-[10px] font-medium leading-none text-[#5b5344]">{s.subtitle}</span> : null}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
