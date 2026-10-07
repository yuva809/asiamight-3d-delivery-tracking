"use client";

import {
  Boxes,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Settings,
  Store,
  Truck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Only routes that exist in this build are navigable. */
  enabled?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Operations",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Orders", href: "/orders", icon: ClipboardList },
      { label: "Inventory", href: "/inventory", icon: Boxes },
      { label: "Picking & Packing", href: "/fulfilment", icon: PackageCheck },
    ],
  },
  {
    section: "Logistics",
    items: [
      { label: "Delivery Tracking", href: "/delivery-tracking", icon: Truck, enabled: true },
      { label: "Drivers", href: "/drivers", icon: Users },
      { label: "Branches", href: "/branches", icon: Store },
    ],
  },
  {
    section: "Admin",
    items: [
      { label: "Reports", href: "/reports", icon: ChartColumn },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-chili font-display text-[17px] font-extrabold text-mist">
        A
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-[17px] font-bold tracking-tight text-mist">AsiaMight</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-soft">Operations</span>
        </span>
      )}
    </div>
  );
}

function NavList({ onNavigate, collapsible }: { onNavigate?: () => void; collapsible?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.section}>
          <p
            className={cn(
              "mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-mist-soft/70",
              collapsible && "md:sr-only 2xl:not-sr-only",
            )}
          >
            {group.section}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              const content = (
                <>
                  <Icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden />
                  <span className={cn("truncate", collapsible && "md:sr-only 2xl:not-sr-only")}>{item.label}</span>
                </>
              );
              const base = cn(
                "flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors",
                collapsible && "md:justify-center md:px-0 2xl:justify-start 2xl:px-3",
              );
              return (
                <li key={item.href}>
                  {item.enabled ? (
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={item.label}
                      className={cn(
                        base,
                        active ? "bg-mist/10 text-mist" : "text-mist-soft hover:bg-mist/5 hover:text-mist",
                      )}
                    >
                      {content}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      title={`${item.label} — part of the main AsiaMight app`}
                      className={cn(base, "cursor-default text-mist-soft/55")}
                    >
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Application sidebar. Full width on large screens, icon rail on tablets /
 * small laptops, and a slide-over drawer on phones.
 */
export function AppSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Phone top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between bg-void px-4 md:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="grid size-9 place-items-center rounded-[10px] text-mist hover:bg-mist/10"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-void/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[272px] flex-col gap-8 bg-void p-4">
            <div className="flex items-center justify-between">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-[10px] text-mist hover:bg-mist/10"
                aria-label="Close navigation"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Rail (md) / full sidebar (lg+) */}
      <aside className="hidden shrink-0 flex-col gap-8 border-r border-line-dark bg-void px-3 py-5 md:flex md:w-[72px] 2xl:w-[248px]">
        <div className="px-2 md:flex md:justify-center 2xl:block">
          <span className="2xl:hidden">
            <Wordmark compact />
          </span>
          <span className="hidden 2xl:block">
            <Wordmark />
          </span>
        </div>
        <NavList collapsible />
        <div className="mt-auto hidden items-center gap-3 rounded-[12px] bg-mist/5 p-3 2xl:flex">
          <span className="grid size-8 place-items-center rounded-full bg-indigo text-[12px] font-bold text-mist">WA</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-mist">Warehouse Admin</span>
            <span className="block truncate text-[11px] text-mist-soft">Berlin DC</span>
          </span>
        </div>
      </aside>
    </>
  );
}
