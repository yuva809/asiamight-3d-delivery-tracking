"use client";

import { Crosshair, MapPin, Navigation, Store, Truck, Warehouse, X } from "lucide-react";
import { DOCKS } from "@/features/delivery-tracking/scene-layout";
import { vanVisualForStatus } from "@/features/delivery-tracking/status-visuals";
import type { DeliveryTrackingSnapshot } from "@/features/delivery-tracking/types";
import { cn } from "@/lib/utils";
import type { Selection } from "@/three/delivery-tracking/delivery-tracking-3d";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Chip, Eyebrow, Panel, Progress, Segmented, SPRING, type Tone } from "./ui";

interface OperationsPanelProps {
  data: DeliveryTrackingSnapshot;
  selection: Selection;
  followingVanId: string | null;
  onSelect: (s: Selection) => void;
  onFollow: (vanId: string) => void;
  onFocusBranch: (branchId: string) => void;
  className?: string;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#f6f7f8] px-3 py-2">
      <p className="text-[11px] font-semibold text-[#6b7080]">{label}</p>
      <p className="mt-0.5 font-display text-[18px] font-bold leading-none tabular-nums">
        {value}
        {sub && <span className="ml-1 text-[11px] font-medium text-[#9aa0aa]">{sub}</span>}
      </p>
    </div>
  );
}

function Inspector({ data, selection, followingVanId, onSelect, onFollow, onFocusBranch }: OperationsPanelProps) {
  const close = (
    <button type="button" onClick={() => onSelect(null)} aria-label="Close details" className="grid size-7 place-items-center rounded-lg text-[#8a8f9a] hover:bg-black/5">
      <X className="size-4" />
    </button>
  );

  if (selection?.kind === "branch") {
    const b = data.branches.find((x) => x.id === selection.id);
    if (!b) return null;
    const active = data.deliveries.find((d) => d.branchId === b.id && (d.status === "ON_ROAD" || d.status === "ARRIVED"));
    return (
      <section aria-label="Branch details" className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e3f4ea] text-[#1f7a4a]">
            <Store className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow>Branch · {b.district}</Eyebrow>
            <h2 className="truncate font-display text-[17px] font-bold leading-tight">{b.name}</h2>
          </div>
          {close}
        </div>
        <p className="mt-3 flex items-start gap-2 text-[13px] text-[#4b5060]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[#9aa0aa]" />
          <span>
            {b.street}
            <br />
            {b.postcode} {b.city}
          </span>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Deliveries today" value={b.stats.deliveriesToday} />
          <Stat label="Pending" value={b.stats.pending} />
        </div>
        {active && (
          <div className="mt-3 rounded-xl border border-[#e6eefc] bg-[#f5f8fe] p-3">
            <div className="flex items-center justify-between text-[12px] font-semibold">
              <span>{active.orderRef} en route</span>
              <span className="tabular-nums text-[#2a5fc4]">{active.status === "ARRIVED" ? "Arrived" : `ETA ${active.etaMinutes} min`}</span>
            </div>
            <div className="mt-2">
              <Progress value={active.progress} tone="blue" />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => onFocusBranch(b.id)}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[12.5px] font-semibold text-white hover:bg-ink/90"
        >
          <Crosshair className="size-4" /> Fly to branch
        </button>
      </section>
    );
  }

  if (selection?.kind === "van") {
    const v = data.vans.find((x) => x.id === selection.id);
    if (!v) return null;
    const visual = vanVisualForStatus(v.status, v.placement.kind === "dock");
    const driver = data.drivers.find((d) => d.id === v.driverId);
    const delivery = data.deliveries.find((d) => d.vanId === v.id && (d.status === "ON_ROAD" || d.status === "ARRIVED" || d.status === "LOADING"));
    const branch = delivery ? data.branches.find((b) => b.id === delivery.branchId) : null;
    const where =
      v.placement.kind === "dock" ? `Dock ${v.placement.dockId.slice(1)}` : v.placement.kind === "parking" ? `Bay ${v.placement.bayId}` : branch ? `To ${branch.shortName}` : "On route";
    return (
      <section aria-label="Van details" className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6eefc] text-[#2a5fc4]">
            <Truck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Eyebrow>Delivery van · {v.plate}</Eyebrow>
            <h2 className="truncate font-display text-[17px] font-bold leading-tight">{v.label}</h2>
          </div>
          {close}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip tone={visual.tone as Tone}>{visual.label}</Chip>
          <span className="text-[12.5px] text-[#6b7080]">{where}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Driver" value={driver ? driver.label.replace("Driver ", "#") : "—"} sub={driver?.name.split(" ")[0]} />
          <Stat label={delivery?.status === "ON_ROAD" ? "ETA" : "Cargo"} value={delivery?.status === "ON_ROAD" ? `${delivery.etaMinutes}` : (delivery?.items ?? 0)} sub={delivery?.status === "ON_ROAD" ? "min" : "items"} />
        </div>
        {delivery && (delivery.status === "ON_ROAD" || delivery.status === "ARRIVED") && (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[12px] font-semibold">
              <span>{delivery.orderRef}</span>
              <span className="tabular-nums text-[#6b7080]">{Math.round(delivery.progress * 100)}%</span>
            </div>
            <Progress value={delivery.progress} tone="blue" />
          </div>
        )}
        {v.placement.kind === "route" && (
          <button
            type="button"
            onClick={() => onFollow(v.id)}
            aria-pressed={followingVanId === v.id}
            className={cn(
              "mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-semibold",
              followingVanId === v.id ? "bg-[#e6eefc] text-[#2a5fc4]" : "bg-ink text-white hover:bg-ink/90",
            )}
          >
            <Navigation className="size-4" /> {followingVanId === v.id ? "Following" : "Follow van"}
          </button>
        )}
      </section>
    );
  }

  // Default: the warehouse summary.
  const docked = data.vans.filter((v) => v.placement.kind === "dock").length;
  return (
    <section aria-label="Warehouse summary" className="p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fbe6e2] text-chili">
          <Warehouse className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Eyebrow>Distribution centre · Berlin</Eyebrow>
          <h2 className="truncate font-display text-[17px] font-bold leading-tight">{data.warehouse.name}</h2>
        </div>
        {selection && close}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip tone="green">Operational</Chip>
        <span className="text-[12px] text-[#6b7080]">
          {docked} docked · {data.workers.length} on shift
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[#f6f7f8] px-3 py-2">
          <p className="text-[11px] font-semibold text-[#6b7080]">Dock usage</p>
          <p className="mt-0.5 font-display text-[18px] font-bold leading-none tabular-nums">
            {docked}
            <span className="text-[12px] font-medium text-[#9aa0aa]"> / {DOCKS.length}</span>
          </p>
          <div className="mt-2">
            <Progress value={docked / DOCKS.length} tone="green" />
          </div>
        </div>
        <div className="rounded-xl bg-[#f6f7f8] px-3 py-2">
          <p className="text-[11px] font-semibold text-[#6b7080]">Pallet storage</p>
          <p className="mt-0.5 font-display text-[18px] font-bold leading-none tabular-nums">
            162<span className="text-[12px] font-medium text-[#9aa0aa]"> / 196</span>
          </p>
          <div className="mt-2">
            <Progress value={162 / 196} tone="chili" />
          </div>
        </div>
      </div>
      {data.warehouse.isPlaceholderLocation && (
        <p className="mt-3 text-[11px] leading-snug text-[#9aa0aa]">Site position is a placeholder in Tempelhof until the warehouse address is confirmed.</p>
      )}
    </section>
  );
}

function OnTheRoad({ data, selection, onSelect, onFollow }: OperationsPanelProps) {
  const rows = data.deliveries.filter((d) => d.status === "ON_ROAD" || d.status === "ARRIVED");
  return (
    <section aria-label="Vans on the road" className="p-4 pt-3">
      {rows.length === 0 && <p className="py-2 text-[12.5px] text-[#9aa0aa]">No vans on the road.</p>}
      <ul className="flex flex-col gap-1">
        {rows.map((d) => {
          const van = data.vans.find((v) => v.id === d.vanId);
          const driver = data.drivers.find((x) => x.id === van?.driverId);
          const branch = data.branches.find((b) => b.id === d.branchId);
          const selected = selection?.kind === "van" && selection.id === van?.id;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => {
                  if (!van) return;
                  onSelect({ kind: "van", id: van.id });
                  onFollow(van.id);
                }}
                className={cn("w-full rounded-xl px-2.5 py-2 text-left transition-colors", selected ? "bg-[#f1f5fd]" : "hover:bg-black/[0.03]")}
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#e6eefc] text-[#2a5fc4]">
                    <Truck className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold">
                      {driver?.label ?? van?.label} <span className="font-medium text-[#9aa0aa]">· {van?.label}</span>
                    </p>
                    <p className="truncate text-[11.5px] text-[#6b7080]">{branch?.shortName}</p>
                  </div>
                  <span className={cn("text-right text-[11.5px] font-bold tabular-nums", d.status === "ARRIVED" ? "text-[#1f7a4a]" : "text-ink")}>
                    {d.status === "ARRIVED" ? "Arrived" : `ETA ${String(d.etaMinutes ?? 0).padStart(2, "0")} min`}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 pl-9">
                  <Progress value={d.progress} tone={d.status === "ARRIVED" ? "green" : "chili"} />
                  <span className="w-8 shrink-0 text-right text-[10.5px] font-semibold tabular-nums text-[#9aa0aa]">{Math.round(d.progress * 100)}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DocksTable({ data }: { data: DeliveryTrackingSnapshot }) {
  return (
    <section aria-label="Docks" className="p-4 pt-3">
      <ul className="flex flex-col gap-1.5">
        {DOCKS.map((d) => {
          const van = data.vans.find((v) => v.placement.kind === "dock" && v.placement.dockId === d.id);
          const visual = van ? vanVisualForStatus(van.status, true) : null;
          return (
            <li key={d.id} className="flex items-center gap-2 text-[12px]">
              <span className="w-12 shrink-0 font-semibold text-[#6b7080]">{d.label}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{van ? van.label : <span className="text-[#b0b4bc]">Free</span>}</span>
              {visual ? <Chip tone={visual.tone as Tone}>{visual.label}</Chip> : <Chip>Available</Chip>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function BranchList({ data, selection, onSelect, onFocusBranch }: OperationsPanelProps) {
  return (
    <section aria-label="Branches" className="p-4 pt-3">
      <ul className="flex flex-col gap-0.5">
        {data.branches.map((b) => {
          const selected = selection?.kind === "branch" && selection.id === b.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect({ kind: "branch", id: b.id });
                  onFocusBranch(b.id);
                }}
                className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors", selected ? "bg-[#eef7f1]" : "hover:bg-black/[0.03]")}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#e3f4ea] text-[#1f7a4a]">
                  <Store className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{b.shortName}</span>
                  <span className="block truncate text-[11px] text-[#8a8f9a]">{b.street}</span>
                </span>
                <span className="text-right text-[11px] leading-tight text-[#6b7080]">
                  <span className="block font-bold tabular-nums text-ink">{b.stats.deliveriesToday}</span>
                  today
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Tab = "live" | "branches" | "docks";

/**
 * Right-hand operations panel. The inspector stays pinned on top (what you
 * selected); below it, one focused list at a time instead of a long scroll.
 */
export function OperationsPanel(props: OperationsPanelProps) {
  const [tab, setTab] = useState<Tab>("live");
  const selKey = props.selection ? `${props.selection.kind}:${props.selection.id}` : "warehouse";
  return (
    <Panel weight="thick" className={cn("flex min-h-0 flex-col overflow-hidden", props.className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={selKey}
          initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
          transition={SPRING}
        >
          <Inspector {...props} />
        </motion.div>
      </AnimatePresence>
      <div className="border-t border-black/[0.06] px-4 pt-3">
        <Segmented<Tab>
          label="Operations list"
          size="sm"
          value={tab}
          onChange={setTab}
          className="w-full [&>button]:flex-1 [&>button]:justify-center"
          options={[
            { value: "live", label: `On the road · ${props.data.summary.onRoad}` },
            { value: "branches", label: "Branches" },
            { value: "docks", label: "Docks" },
          ]}
        />
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          >
            {tab === "live" && <OnTheRoad {...props} />}
            {tab === "branches" && <BranchList {...props} />}
            {tab === "docks" && <DocksTable data={props.data} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </Panel>
  );
}
