"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useState, type Ref } from "react";
import { useBerlinGeo } from "@/features/delivery-tracking/berlin-geo";
import { geoToScene } from "@/features/delivery-tracking/geo";
import { ROUTE_DURATION_S } from "@/features/delivery-tracking/mock-data";
import { SIM_SPEED } from "@/features/delivery-tracking/mock-operations";
import {
  CAMERA_VIEWS,
  DEFAULT_VIEW,
  SITE,
  VAN_BAYS,
  WAREHOUSE,
  dockPose,
  siteHeading,
  siteToWorld,
} from "@/features/delivery-tracking/scene-layout";
import type { SimulationDirectives } from "@/features/delivery-tracking/simulation";
import { vanVisualForStatus } from "@/features/delivery-tracking/status-visuals";
import type { DeliveryTrackingSnapshot, Vec3 } from "@/features/delivery-tracking/types";
import { Branch, resolveBranchSite, type BranchSite } from "./branch";
import { CameraController, type CameraControllerHandle } from "./camera-controller";
import { CityBuildings, findBranchBuilding } from "./city/city-buildings";
import { CityMap } from "./city/city-map";
import { RouteLines } from "./city/route-lines";
import { buildRoutePaths } from "./city/route-paths";
import { StreetDetails } from "./city/street-details";
import { CityTraffic } from "./city/traffic";
import { DeliveryVan } from "./delivery-van";
import { SCENE_BACKGROUND, SceneLighting } from "./environment";
import { MapPin } from "./map-pin";
import { PALETTE } from "./materials";
import { fx } from "./debug-flags";
import { PostFX } from "./post-fx";
import { PerfPanel } from "./perf/perf-panel";
import { PerfProbe } from "./perf/perf-probe";
import { qualityStore, useQuality, useQualityMode } from "./perf/quality";
import { QualityGovernor } from "./perf/quality-governor";
import { createLabelStore, LabelLayer, LabelProjector, LabelStoreProvider, SceneLabel } from "./scene-label";
import { SceneSettingsProvider, type SceneSettings } from "./scene-settings";
import { SiteGrounds } from "./site-grounds";
import { Warehouse } from "./warehouse";
import { WarehouseInterior } from "./warehouse-interior";
import { Workers } from "./workers";

export type Selection = { kind: "branch" | "van" | "warehouse"; id: string } | null;

export interface DeliveryTracking3DProps {
  data: DeliveryTrackingSnapshot;
  directives: SimulationDirectives;
  settings: SceneSettings;
  selection: Selection;
  onSelect: (s: Selection) => void;
  cameraRef?: Ref<CameraControllerHandle>;
  /** Called after the first frame renders (to fade out the loading poster). */
  onReady?: () => void;
  /** Fired when the user starts orbiting/panning/zooming. */
  onCameraInteract?: () => void;
}

/**
 * Root of the 3D Delivery Tracking scene. Purely presentational: it takes
 * domain data + simulation directives + view settings and renders them.
 */
export default function DeliveryTracking3D(props: DeliveryTracking3DProps) {
  const { settings, cameraRef, onReady, onCameraInteract, onSelect } = props;
  // Weak devices start at LOW; the governor steps quality from there.
  useState(() => qualityStore.init(settings.lowPower));
  const quality = useQuality();
  const qualityMode = useQualityMode();
  const [labels] = useState(createLabelStore);
  const view = CAMERA_VIEWS[DEFAULT_VIEW];

  return (
    <LabelStoreProvider value={labels}>
      <div className="relative h-full w-full">
        <Canvas
          shadows={settings.lowPower ? false : "percentage"}
          dpr={quality.dpr}
          camera={{ position: view.position, fov: 34, near: 0.5, far: 20000 }}
          gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
          style={{ background: SCENE_BACKGROUND, touchAction: "none" }}
          onCreated={(state) => {
            if (process.env.NODE_ENV !== "production" || fx("expose")) (window as unknown as { __amScene?: unknown }).__amScene = state;
          }}
          onPointerMissed={() => onSelect(null)}
          aria-label="3D view of the AsiaMight distribution centre, delivery vans and Berlin branch network"
        >
          {/* Automatic quality: resolution → post → shadows → city detail → traffic. */}
          <QualityGovernor />
          <SceneSettingsProvider value={settings}>
            <SceneLighting />
            <Suspense fallback={null}>
              <World {...props} />
              <ShaderWarmup onReady={onReady} />
            </Suspense>
            <PostFX />
            <PerfProbe quality={`${quality.name} · ${quality.step}${qualityMode === "auto" ? " auto" : ""}`} />
            <LabelProjector />
            <CameraController ref={cameraRef} instant={!settings.animate} onInteract={onCameraInteract} intro />
          </SceneSettingsProvider>
        </Canvas>
        <LabelLayer store={labels} visible={settings.showLabels} />
        <PerfPanel mode={qualityMode} onQuality={qualityStore.setMode} />
      </div>
    </LabelStoreProvider>
  );
}

/**
 * Compile every shader program before the poster lifts. Without this the
 * first rendered frame compiles ~60 programs synchronously — the 0.9 s
 * freeze measured on load. compileAsync uses KHR_parallel_shader_compile.
 */
function ShaderWarmup({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    gl.compileAsync(scene, camera)
      .catch(() => undefined)
      .then(() => alive && onReady?.());
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

function World({ data, directives, settings, selection, onSelect }: DeliveryTracking3DProps) {
  const geo = useBerlinGeo();
  const routes = useMemo(() => buildRoutePaths(geo), [geo]);
  const [hovered, setHovered] = useState<string | null>(null);

  // Each branch is drawn on the real OSM building at its address. Keyed on
  // id + location only, so live stat updates never rebuild geometry.
  const branchKey = data.branches.map((b) => `${b.id}@${b.location.lat},${b.location.lon}`).join("|");
  const branchSites = useMemo(() => {
    const map = new Map<string, BranchSite>();
    for (const entry of branchKey.split("|")) {
      const [id, ll] = entry.split("@");
      const [lat, lon] = ll.split(",").map(Number);
      const point = geoToScene({ lat, lon });
      const route = geo.routes.find((r) => r.branchId === id);
      const street = route ? ([route.end[0], route.end[1]] as [number, number]) : null;
      const idx = findBranchBuilding(geo.buildings, point, street);
      map.set(id, resolveBranchSite(geo, { lat, lon }, idx, street));
    }
    return map;
  }, [geo, branchKey]);
  const excludedKey = [...branchSites.values()].map((s) => s.buildingIndex).join(",");
  const excluded = useMemo(
    () => new Set(excludedKey.split(",").map(Number).filter((i) => i >= 0)),
    [excludedKey],
  );

  // Visualization state for vans: placement → pose, status → visuals.
  const vans = useMemo(
    () =>
      data.vans.map((v) => {
        const atDock = v.placement.kind === "dock";
        const visual = vanVisualForStatus(v.status, atDock);
        const delivery = data.deliveries.find((d) => d.vanId === v.id && (d.status === "ON_ROAD" || d.status === "ARRIVED"));
        const branch = delivery ? data.branches.find((b) => b.id === delivery.branchId) : null;
        let position: Vec3 = [0, 0, 0];
        let rotation = 0;
        let route;
        let progress;
        let speed;
        const p = v.placement;
        if (p.kind === "dock") {
          const pose = dockPose(p.dockId);
          const [x, z] = siteToWorld(pose.position);
          position = [x, 0, z];
          rotation = siteHeading(pose.heading);
        } else if (p.kind === "parking") {
          const bay = VAN_BAYS.find((b) => b.id === p.bayId) ?? VAN_BAYS[0];
          const [x, z] = siteToWorld(bay.position);
          position = [x, 0, z];
          rotation = siteHeading(bay.heading);
        } else if (p.kind === "route") {
          const r = routes.get(p.routeId);
          if (r) {
            route = r.line;
            progress = p.progress;
            speed = (r.line.length / (ROUTE_DURATION_S[r.branchId] ?? r.duration)) * SIM_SPEED;
          }
        } else {
          const [x, z] = geoToScene(p.location);
          position = [x, 0, z];
          rotation = p.heading;
        }
        const subtitle =
          v.status === "ON_ROUTE" && delivery && branch
            ? `${branch.shortName} · ETA ${delivery.etaMinutes ?? "–"} min`
            : v.status === "ARRIVED" && branch
              ? `Arrived · ${branch.shortName}`
              : visual.label;
        return { van: v, visual, position, rotation, route, progress, speed, subtitle };
      }),
    [data.vans, data.deliveries, data.branches, routes],
  );

  const openDocksKey = data.vans
    .flatMap((v) => (v.placement.kind === "dock" && v.status === "LOADING" ? [v.placement.dockId] : []))
    .join(",");
  const openDocks = useMemo(() => (openDocksKey ? openDocksKey.split(",") : []), [openDocksKey]);
  const warehouseId = data.warehouse.id;
  const selectWarehouse = useCallback(() => onSelect({ kind: "warehouse", id: warehouseId }), [onSelect, warehouseId]);
  const activeRouteIds = useMemo(
    () => data.vans.flatMap((v) => (v.status === "ON_ROUTE" && v.placement.kind === "route" ? [v.placement.routeId] : [])),
    [data.vans],
  );
  const selectedVan = selection?.kind === "van" ? data.vans.find((v) => v.id === selection.id) : undefined;
  const highlightRouteId =
    selection?.kind === "branch"
      ? `route:${selection.id}`
      : selectedVan?.placement.kind === "route"
        ? selectedVan.placement.routeId
        : null;

  const activeBranchIds = new Set(data.deliveries.filter((d) => d.status === "ON_ROAD").map((d) => d.branchId));
  const selectBranch = (id: string) => onSelect({ kind: "branch", id });
  const selectVan = (id: string) => onSelect({ kind: "van", id });
  const warehouseTop = siteToWorld([0, 0]);

  return (
    <group>
      <CityMap geo={geo} />
      <CityBuildings geo={geo} exclude={excluded} />
      <StreetDetails geo={geo} lowPower={settings.lowPower} />
      <CityTraffic geo={geo} />
      <RouteLines routes={routes} activeRouteIds={activeRouteIds} highlightRouteId={highlightRouteId} />

      {/* The AsiaMight site, placed on the real map beside its access road. */}
      <group position={[SITE.position[0], 0, SITE.position[1]]} rotation-y={SITE.rotation}>
        <SiteGrounds />
        <Warehouse
          openDocks={openDocks}
          selected={selection?.kind === "warehouse"}
          onSelect={selectWarehouse}
        />
        <WarehouseInterior activeZone={directives.activeZone === "office" ? null : directives.activeZone} pinZone={directives.pinZone} />
        <Workers workers={data.workers} />
      </group>

      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelect({ kind: "warehouse", id: data.warehouse.id });
        }}
      >
        <MapPin position={[warehouseTop[0], WAREHOUSE.height + 6, warehouseTop[1]]} color={PALETTE.chili} size={2.4} minPx={40} hideBelow={160} />
      </group>
      <SceneLabel
        kind="warehouse"
        title="AsiaMight Warehouse"
        subtitle="Distribution Centre"
        position={[warehouseTop[0], WAREHOUSE.height + 6, warehouseTop[1]]}
        screenOffsetY={-60}
        minDistance={140}
      />

      {vans.map((v) => (
        <DeliveryVan
          key={v.van.id}
          id={v.van.id}
          label={v.van.label}
          plateText={v.van.plate}
          visual={v.visual}
          position={v.position}
          rotation={v.rotation}
          route={v.route}
          progress={v.progress}
          speed={v.speed}
          subtitle={v.subtitle}
          selected={selection?.kind === "van" && selection.id === v.van.id}
          onSelect={selectVan}
        />
      ))}

      {data.branches.map((b) => {
        const site = branchSites.get(b.id);
        if (!site) return null;
        return (
          <Branch
            key={b.id}
            branch={b}
            site={site}
            selected={(selection?.kind === "branch" && selection.id === b.id) || hovered === b.id}
            hasActiveDelivery={activeBranchIds.has(b.id)}
            onSelect={selectBranch}
            onHover={setHovered}
          />
        );
      })}
    </group>
  );
}
