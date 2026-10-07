"use client";

import { ChevronUp } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { INSIDE_ORDER, type InsideStop } from "@/features/delivery-tracking/scene-layout";
import { DEMO, simulationDirectives } from "@/features/delivery-tracking/simulation";
import { useDeliveryTrackingData } from "@/features/delivery-tracking/use-delivery-tracking-data";
import { useIsLowPowerDevice, useMediaQuery } from "@/lib/use-media-query";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { supportsWebGL } from "@/lib/webgl-support";
import type { CameraControllerHandle } from "@/three/delivery-tracking/camera-controller";
import type { Selection } from "@/three/delivery-tracking/delivery-tracking-3d";
import type { BuildingMode } from "@/three/delivery-tracking/scene-settings";
import { InsideTour } from "./inside-tour";
import { KpiCards } from "./kpi-cards";
import { MapTools } from "./map-tools";
import { OperationsPanel } from "./operations-panel";
import { OrderFlowCard } from "./order-flow-card";
import { SiteSchematic } from "./site-schematic";
import { TopBar, type ViewChoice } from "./top-bar";
import { Segmented, SPRING } from "./ui";
import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";

/** Materialise: fade + settle + blur-to-sharp, critically damped. */
function Enter({ show, delay = 0, from = "above", className, children }: { show: boolean; delay?: number; from?: "above" | "below" | "right"; className?: string; children: ReactNode }) {
  const off = from === "right" ? { x: 22, y: 0 } : { x: 0, y: from === "below" ? 14 : -10 };
  return (
    <motion.div
      className={className}
      initial={false}
      animate={show ? { opacity: 1, x: 0, y: 0, filter: "blur(0px)" } : { opacity: 0, ...off, filter: "blur(6px)" }}
      transition={{ ...SPRING, delay: show ? delay : 0 }}
      style={{ pointerEvents: show ? undefined : "none" }}
    >
      {children}
    </motion.div>
  );
}

// three.js + R3F + map data load in their own chunk, client-only.
const DeliveryTracking3D = dynamic(() => import("@/three/delivery-tracking/delivery-tracking-3d"), {
  ssr: false,
  loading: () => null,
});

let webglCache: boolean | null = null;
const noopSubscribe = () => () => {};
const getWebGL = () => (webglCache ??= supportsWebGL());
const getWebGLServer = () => null;

export function DeliveryTrackingView() {
  const { snapshot: data, simulation, autoplay, demoDeliveryId, actions } = useDeliveryTrackingData();
  const directives = useMemo(() => simulationDirectives(simulation), [simulation]);
  const webgl = useSyncExternalStore(noopSubscribe, getWebGL, getWebGLServer);
  const reducedMotion = useReducedMotion();
  const lowPower = useIsLowPowerDevice();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const camera = useRef<CameraControllerHandle>(null);
  const [mode, setMode] = useState<BuildingMode>("operational");
  const [insideStop, setInsideStop] = useState<InsideStop>("storage");
  const [tourPlaying, setTourPlaying] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [view, setView] = useState<ViewChoice | null>("overview");
  const [selection, setSelection] = useState<Selection>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // UI enters mid-way through the establishing shot (immediately with reduced motion).
  const [uiIn, setUiIn] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => setUiIn(true), reducedMotion ? 0 : 1500);
    return () => clearTimeout(id);
  }, [ready, reducedMotion]);

  // Inside view: walk the order path automatically.
  useEffect(() => {
    if (mode !== "inside" || !tourPlaying) return;
    const id = setInterval(() => {
      setInsideStop((s) => {
        const next = INSIDE_ORDER[(INSIDE_ORDER.indexOf(s) + 1) % INSIDE_ORDER.length];
        camera.current?.inside(next);
        return next;
      });
    }, 6500);
    return () => clearInterval(id);
  }, [mode, tourPlaying]);

  const firstOnRoute = data.vans.find((v) => v.status === "ON_ROUTE")?.id ?? null;

  const follow = (vanId: string | null) => {
    setFollowing(vanId);
    camera.current?.follow(vanId);
    if (vanId) setView("follow");
  };

  const chooseView = (v: ViewChoice) => {
    setView(v);
    if (v === "follow") {
      const id = following ?? firstOnRoute;
      if (id) {
        setSelection({ kind: "van", id });
        follow(id);
      }
      return;
    }
    setFollowing(null);
    camera.current?.follow(null);
    if (mode === "inside" && v !== "warehouse" && v !== "loading") setMode("operational");
    camera.current?.goTo(v);
  };

  const chooseMode = (m: BuildingMode) => {
    setMode(m);
    if (m === "inside") {
      setFollowing(null);
      setView(null);
      setInsideStop("storage");
      camera.current?.inside("storage");
    } else if (mode === "inside") {
      setView("warehouse");
      camera.current?.goTo("warehouse");
    }
  };

  const select = useCallback((s: Selection) => {
    setSelection(s);
    if (s) setSheetOpen(true);
  }, []);

  const focusBranch = (branchId: string) => {
    setFollowing(null);
    setView(null);
    camera.current?.follow(null);
    camera.current?.focusBranch(branchId);
  };

  const demoOrder = data.deliveries.find((d) => d.id === demoDeliveryId) ?? null;
  const demoBranch = data.branches.find((b) => b.id === (demoOrder?.branchId ?? DEMO.branchId)) ?? null;

  const panelProps = {
    data,
    selection,
    followingVanId: following,
    onSelect: select,
    onFollow: (id: string) => follow(id),
    onFocusBranch: focusBranch,
  };
  const orderFlow = (
    <OrderFlowCard
      simulation={simulation}
      autoplay={autoplay}
      order={demoOrder}
      branch={demoBranch}
      onAdvance={actions.advance}
      onDispatch={actions.dispatch}
      onReset={() => {
        actions.reset();
        setSelection(null);
      }}
      onAutoplay={actions.setAutoplay}
      compact={!isDesktop}
    />
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#eef0f3]">
      {/* 3D world (full bleed) */}
      <div className="absolute inset-0">
        {webgl === false ? (
          <SiteSchematic warehouse={data.warehouse} branches={data.branches} />
        ) : webgl ? (
          <DeliveryTracking3D
            data={data}
            directives={directives}
            settings={{ buildingMode: mode, showLabels, animate: !reducedMotion, lowPower }}
            selection={selection}
            onSelect={select}
            cameraRef={camera}
            onReady={() => setReady(true)}
            onCameraInteract={() => setView(null)}
          />
        ) : null}
      </div>

      {/* Loading poster */}
      {webgl !== false && (
        <div
          aria-hidden={ready}
          className={cn(
            "pointer-events-none absolute inset-0 z-40 grid place-items-center bg-[#eef0f3] transition-opacity duration-700",
            ready ? "opacity-0" : "opacity-100",
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-11 animate-pulse place-items-center rounded-xl bg-chili font-display text-[22px] font-extrabold text-white">A</span>
            <p className="text-[12.5px] font-semibold text-[#6b7080]">Loading Berlin operations…</p>
          </div>
        </div>
      )}

      {/* Floating UI — materialises in sequence during the establishing shot */}
      <MotionConfig reducedMotion="user">
      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col gap-2 p-2 sm:gap-3 sm:p-3">
        <Enter show={uiIn} delay={0}>
          <TopBar view={view} onView={chooseView} mode={mode} onMode={chooseMode} canFollow={!!(following ?? firstOnRoute)} />
        </Enter>

        {/* Phone/tablet: presets under the bar */}
        <div className="pointer-events-auto -mx-2 flex gap-2 overflow-x-auto px-2 pb-0.5 md:hidden">
          <Segmented<ViewChoice>
            label="Camera view"
            size="sm"
            value={view}
            onChange={chooseView}
            className="bg-white/90 shadow-sm"
            options={[
              { value: "overview", label: "Overview" },
              { value: "warehouse", label: "Warehouse" },
              { value: "loading", label: "Loading" },
              { value: "network", label: "Network" },
              { value: "follow", label: "Follow" },
            ]}
          />
          <Segmented<BuildingMode>
            label="Building view"
            size="sm"
            value={mode}
            onChange={chooseMode}
            className="bg-white/90 shadow-sm"
            options={[
              { value: "operational", label: "Operational" },
              { value: "exterior", label: "Exterior" },
              { value: "inside", label: "Inside" },
            ]}
          />
        </div>

        <div className="relative flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <KpiCards show={uiIn} summary={data.summary} className="pointer-events-auto -mx-2 overflow-x-auto px-2 pb-1 sm:mx-0 sm:px-0" />
              <Enter show={uiIn} delay={0.3} from="right" className="hidden lg:block">
                <MapTools
                  onZoomIn={() => camera.current?.zoom(0.6)}
                  onZoomOut={() => camera.current?.zoom(1.6)}
                  onReset={() => chooseView("overview")}
                  showLabels={showLabels}
                  onToggleLabels={() => setShowLabels((s) => !s)}
                />
              </Enter>
            </div>
            {mode === "inside" && (
              <div className="mt-2 flex justify-center">
                <InsideTour
                  stop={insideStop}
                  playing={tourPlaying}
                  onPlaying={setTourPlaying}
                  onStop={(s) => {
                    setTourPlaying(false);
                    setInsideStop(s);
                    camera.current?.inside(s);
                  }}
                />
              </div>
            )}
            <div className="mt-auto hidden items-end justify-between gap-3 lg:flex">
              <Enter show={uiIn} delay={0.36} from="below" className="w-full max-w-[560px]">
                {orderFlow}
              </Enter>
              <span className="shrink-0 text-[10px] text-[#8a8f9a]">Map data © OpenStreetMap contributors · Routes OSRM · Models CC0 Quaternius, Kenney</span>
            </div>
          </div>

          {/* Desktop: right operations panel */}
          <Enter show={uiIn} delay={0.18} from="right" className="hidden max-h-full min-h-0 w-[330px] shrink-0 self-start lg:flex xl:w-[350px]">
            <OperationsPanel {...panelProps} className="max-h-full w-full" />
          </Enter>
        </div>
      </div>
      </MotionConfig>

      {/* Phone/tablet: bottom sheet */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 p-2 lg:hidden">
        <div className="pointer-events-auto">{orderFlow}</div>
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-black/[0.06] bg-white/95 shadow-lg backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setSheetOpen((o) => !o)}
            aria-expanded={sheetOpen}
            className="flex h-11 w-full items-center justify-between px-4 text-[13px] font-semibold"
          >
            <span>
              Live operations <span className="font-medium text-[#8a8f9a]">· {data.summary.onRoad} on the road</span>
            </span>
            <ChevronUp className={cn("size-4 transition-transform duration-200", sheetOpen ? "rotate-0" : "rotate-180")} />
          </button>
          {sheetOpen && <OperationsPanel {...panelProps} className="max-h-[46dvh] rounded-none border-0 shadow-none" />}
        </div>
      </div>

    </div>
  );
}
