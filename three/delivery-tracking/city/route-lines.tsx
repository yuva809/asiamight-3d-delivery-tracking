"use client";

import { useEffect, useMemo } from "react";
import { buildRibbonGeometry, makeRouteMaterial } from "./ribbon";
import type { RoutePath } from "./route-paths";

const baseMat = makeRouteMaterial("#d6472c", "#d6472c", 0.16);
const activeMat = makeRouteMaterial("#d6472c", "#ffd9cf", 0.95);

interface RouteLinesProps {
  routes: Map<string, RoutePath>;
  /** Routes with a van currently on them (animated, emphasised). */
  activeRouteIds: string[];
  /** Route of the selected branch/van (also emphasised). */
  highlightRouteId?: string | null;
}

/**
 * Delivery routes on the real road network. All known routes are drawn
 * faintly; routes with vans on them get a brighter animated flow.
 */
export function RouteLines({ routes, activeRouteIds, highlightRouteId }: RouteLinesProps) {
  const base = useMemo(
    () => buildRibbonGeometry([...routes.values()].map((r) => ({ points: r.line.points, half: 0.22, minPx: 2 })), 0.12),
    [routes],
  );
  const activeKey = [...new Set([...activeRouteIds, ...(highlightRouteId ? [highlightRouteId] : [])])].sort().join("|");
  const active = useMemo(() => {
    const lines = activeKey
      .split("|")
      .filter(Boolean)
      .map((id) => routes.get(id))
      .filter((r): r is RoutePath => !!r)
      .map((r) => ({ points: r.line.points, half: 0.38, minPx: 3.5 }));
    return lines.length ? buildRibbonGeometry(lines, 0.14) : null;
  }, [routes, activeKey]);

  useEffect(() => () => base.dispose(), [base]);
  useEffect(() => () => active?.dispose(), [active]);

  return (
    <group>
      <mesh geometry={base} material={baseMat} frustumCulled={false} renderOrder={2} />
      {active && <mesh geometry={active} material={activeMat} frustumCulled={false} renderOrder={3} />}
    </group>
  );
}
