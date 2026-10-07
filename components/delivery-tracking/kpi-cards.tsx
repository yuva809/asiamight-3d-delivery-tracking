"use client";

import { motion } from "motion/react";
import { CircleCheck, ClipboardList, TriangleAlert, Truck, type LucideIcon } from "lucide-react";
import type { OpsSummary } from "@/features/delivery-tracking/types";
import { cn } from "@/lib/utils";
import { Panel, SPRING, Ticker } from "./ui";

const ITEMS: { key: keyof OpsSummary; label: string; icon: LucideIcon; tile: string; hint: string }[] = [
  { key: "ordersToday", label: "Orders today", icon: ClipboardList, tile: "bg-[#fbe6e2] text-chili", hint: "from 4 branches" },
  { key: "onRoad", label: "On the road", icon: Truck, tile: "bg-[#e6eefc] text-[#2a5fc4]", hint: "live vans" },
  { key: "delivered", label: "Delivered", icon: CircleCheck, tile: "bg-[#e3f4ea] text-[#1f7a4a]", hint: "today" },
  { key: "delayed", label: "Delayed", icon: TriangleAlert, tile: "bg-[#fdf1dc] text-[#a96a07]", hint: "> 10 min late" },
];

export function KpiCards({ summary, className, show = true }: { summary: OpsSummary; className?: string; show?: boolean }) {
  return (
    <dl className={cn("flex gap-2", className)}>
      {ITEMS.map(({ key, label, icon: Icon, tile, hint }, i) => (
        <motion.div
          key={key}
          className="shrink-0"
          initial={false}
          animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: -8, filter: "blur(6px)" }}
          transition={{ ...SPRING, delay: show ? 0.08 + i * 0.05 : 0 }}
        >
        <Panel weight="thin" className="flex min-w-[148px] items-center gap-3 px-3 py-2.5">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tile)}>
            <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden />
          </span>
          <div className="min-w-0">
            <dt className="truncate text-[11.5px] font-semibold text-[#6b7080]">{label}</dt>
            <dd className="flex items-baseline gap-1.5">
              <Ticker value={summary[key]} className="font-display text-[22px] font-bold leading-none tracking-[-0.02em]" />
              <span className="truncate text-[10.5px] font-medium text-[#9aa0aa]">{hint}</span>
            </dd>
          </div>
        </Panel>
        </motion.div>
      ))}
    </dl>
  );
}
