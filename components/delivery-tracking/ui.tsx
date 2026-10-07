"use client";

import { motion, useSpring, useTransform } from "motion/react";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Floating glass materials. Weight encodes hierarchy (Apple HIG): the
 * inspector is "thick" (stronger blur + deeper shadow), chips are "thin".
 * A bright top edge reads as light catching the material.
 */
export const GLASS = {
  thick:
    "border border-white/70 bg-white/[0.93] shadow-[0_24px_60px_-28px_rgba(28,26,40,0.42),0_2px_8px_-2px_rgba(28,26,40,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-2xl backdrop-saturate-150",
  regular:
    "border border-white/70 bg-white/[0.9] shadow-[0_16px_40px_-22px_rgba(28,26,40,0.38),0_1px_4px_-1px_rgba(28,26,40,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150",
  thin: "border border-white/60 bg-white/[0.84] shadow-[0_10px_28px_-18px_rgba(28,26,40,0.35),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150",
} as const;

/** Default spring: critically damped, no overshoot (UI that wasn't flicked). */
export const SPRING = { type: "spring", bounce: 0, duration: 0.55 } as const;

export function Panel({ className, weight = "regular", ...props }: ComponentProps<"div"> & { weight?: keyof typeof GLASS }) {
  return <div className={cn("pointer-events-auto rounded-2xl", GLASS[weight], className)} {...props} />;
}

export type Tone = "neutral" | "amber" | "green" | "blue" | "red" | "chili";

const TONES: Record<Tone, string> = {
  neutral: "bg-[#eef0f2] text-[#5b6170]",
  amber: "bg-[#fdf1dc] text-[#a96a07]",
  green: "bg-[#e3f4ea] text-[#1f7a4a]",
  blue: "bg-[#e6eefc] text-[#2a5fc4]",
  red: "bg-[#fbe6e2] text-[#b3361f]",
  chili: "bg-[#fbe6e2] text-[#b3361f]",
};

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center rounded-md px-2 text-[11px] font-semibold tracking-[0.01em]", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#8a8f9a]", className)}>{children}</p>;
}

/** Number that springs to its new value instead of snapping. */
export function Ticker({ value, className, pad = 0 }: { value: number; className?: string; pad?: number }) {
  const spring = useSpring(value, { stiffness: 140, damping: 24 });
  const text = useTransform(spring, (v) => String(Math.round(v)).padStart(pad, "0"));
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  return <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>;
}

export function Progress({ value, tone = "chili" }: { value: number; tone?: "chili" | "green" | "blue" | "amber" }) {
  const color = { chili: "bg-chili", green: "bg-[#2fae6a]", blue: "bg-[#3b7bea]", amber: "bg-[#f0a524]" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eceef1]" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={cn("h-full origin-left rounded-full", color)} initial={false} animate={{ scaleX: Math.max(0.001, value) }} transition={SPRING} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: T | null;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("relative flex items-center gap-0.5 rounded-xl bg-[#eceef1]/80 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            title={o.label}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 rounded-[10px] font-semibold transition-colors duration-150 active:scale-[0.97]",
              size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]",
              active ? "text-ink" : "text-[#5f6470] hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${label}-${size}`}
                className="absolute inset-0 rounded-[10px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)]"
                transition={SPRING}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              <span className={o.icon ? "max-xl:sr-only" : undefined}>{o.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
