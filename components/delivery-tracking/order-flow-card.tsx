"use client";

import { Check, ClipboardCheck, Hand, Package, PackageCheck, Pause, Play, RefreshCw, Send, SkipForward, Truck, type LucideIcon } from "lucide-react";
import { SIMULATION_LABELS, SIMULATION_STEPS, type SimulationState } from "@/features/delivery-tracking/simulation";
import type { Delivery, Branch } from "@/features/delivery-tracking/types";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { Chip, Eyebrow, Panel, SPRING } from "./ui";

/** Half of the track between two steps; fills left→right as the order advances. */
function Connector({ filled, hidden }: { filled: boolean; hidden: boolean }) {
  if (hidden) return <span className="h-0.5 flex-1" />;
  return (
    <span className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-[#e3e5e9]">
      <motion.span className="absolute inset-0 origin-left bg-chili" initial={false} animate={{ scaleX: filled ? 1 : 0 }} transition={SPRING} />
    </span>
  );
}

const ICONS: Record<SimulationState, LucideIcon> = {
  IDLE: Hand,
  ORDER_RECEIVED: ClipboardCheck,
  PICKING: Package,
  PACKING: PackageCheck,
  LOADING: Truck,
  READY: Check,
};

interface OrderFlowCardProps {
  simulation: SimulationState;
  autoplay: boolean;
  order: Delivery | null;
  branch: Branch | null;
  onAdvance: () => void;
  onDispatch: () => void;
  onReset: () => void;
  onAutoplay: (on: boolean) => void;
  compact?: boolean;
  className?: string;
}

/**
 * Demo control for the Phase 1 order-flow simulation. In Phase 2 the same
 * stepper is driven by real order events instead of the buttons.
 */
export function OrderFlowCard({ simulation, autoplay, order, branch, onAdvance, onDispatch, onReset, onAutoplay, compact, className }: OrderFlowCardProps) {
  const index = SIMULATION_STEPS.indexOf(simulation);
  const info = SIMULATION_LABELS[simulation];
  const primary =
    simulation === "IDLE"
      ? { label: "New order", icon: ClipboardCheck, action: onAdvance }
      : simulation === "READY"
        ? { label: "Dispatch van", icon: Send, action: onDispatch }
        : { label: "Next step", icon: SkipForward, action: onAdvance };
  const PrimaryIcon = primary.icon;

  return (
    <Panel weight="regular" className={cn("p-3.5 sm:p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Eyebrow>Order flow</Eyebrow>
            <Chip className="h-[18px] px-1.5 text-[10px]">Demo simulation</Chip>
          </div>
          <p className="mt-1 truncate text-[13px] font-semibold">
            {order ? (
              <>
                {order.orderRef} <span className="font-medium text-[#8a8f9a]">→ {branch?.shortName} · {order.items} items</span>
              </>
            ) : (
              <span className="text-[#6b7080]">{info.detail}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onAutoplay(!autoplay)}
            aria-pressed={autoplay}
            title={autoplay ? "Pause auto demo" : "Play auto demo"}
            className={cn("grid size-8 place-items-center rounded-lg", autoplay ? "bg-[#e3f4ea] text-[#1f7a4a]" : "text-[#5f6470] hover:bg-black/5")}
          >
            {autoplay ? <Pause className="size-4" /> : <Play className="size-4" />}
            <span className="sr-only">{autoplay ? "Pause auto demo" : "Play auto demo"}</span>
          </button>
          <button type="button" onClick={onReset} title="Reset simulation" className="grid size-8 place-items-center rounded-lg text-[#5f6470] hover:bg-black/5">
            <RefreshCw className="size-4" />
            <span className="sr-only">Reset simulation</span>
          </button>
        </div>
      </div>

      {/* Stepper */}
      <ol className="mt-3 flex items-start" aria-label="Order stages">
        {SIMULATION_STEPS.map((s, i) => {
          const Icon = ICONS[s];
          const done = i < index;
          const current = i === index;
          return (
            <li key={s} className="flex flex-1 flex-col items-center gap-1.5" aria-current={current ? "step" : undefined}>
              <div className="flex w-full items-center">
                <Connector hidden={i === 0} filled={i <= index} />
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors duration-300",
                    current ? "border-chili bg-chili text-white shadow-[0_0_0_4px_rgba(214,71,44,0.15)]" : done ? "border-chili bg-white text-chili" : "border-[#e3e5e9] bg-white text-[#a3a8b0]",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={2.6} /> : <Icon className="size-[15px]" />}
                </span>
                <Connector hidden={i === SIMULATION_STEPS.length - 1} filled={i < index} />
              </div>
              {!compact && (
                <span className={cn("text-center text-[10.5px] font-semibold leading-tight", current ? "text-ink" : "text-[#9aa0aa]")}>
                  {SIMULATION_LABELS[s].title}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12px] text-[#6b7080]">
          <span className="font-semibold text-ink">{info.title}.</span> {info.detail}
        </p>
        <button
          type="button"
          onClick={primary.action}
          className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-chili px-3.5 text-[12.5px] font-semibold text-white shadow-[0_6px_14px_-6px_rgba(214,71,44,0.7)] transition-colors hover:bg-chili-strong active:scale-[0.98]"
        >
          <PrimaryIcon className="size-4" />
          {primary.label}
        </button>
      </div>
    </Panel>
  );
}
