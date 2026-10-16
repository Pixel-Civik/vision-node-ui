/**
 * Sidebar — branding, navigation and refresh control.
 * SRP: renders sidebar UI only; no data fetching.
 * DIP: depends on typed props (Section, NavItem), not on concrete hooks.
 */
"use client";

import Image from "next/image";
import { RefreshCw, CalendarRange } from "lucide-react";
import { NAV_ITEMS, type Section } from "./nav";

interface SidebarProps {
  section: Section;
  onNavigate: (id: Section) => void;
  loading: boolean;
  onRefresh: () => void;
  dateRange: { start: string; end: string };
  alertCount?: number;
}

export function Sidebar({
  section,
  onNavigate,
  loading,
  onRefresh,
  dateRange,
  alertCount = 0,
}: SidebarProps) {
  return (
    <>
      {/* ── Logo & brand ──────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-5 pb-4">
        <div className="relative overflow-hidden rounded-xl bg-navy-raised p-4 ring-1 ring-inset ring-white/[0.06]">
          {/* Glow de marca: da profundidad sin coste de scroll */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120px_64px_at_50%_-10%,rgba(45,212,191,0.22),transparent)]"
          />
          {/* fill + aspect-ratio evita el warning de width/height de Next.js */}
          <div className="relative w-full" style={{ aspectRatio: "160 / 110" }}>
            <Image
              src="/pixel_civik.png"
              alt="Pixel Civik"
              fill
              sizes="160px"
              className="object-contain scale-125"
              priority
            />
          </div>
        </div>
        <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.22em] text-brand/70">
          Analytics Platform
        </p>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="scroll-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
        <NavList section={section} onNavigate={onNavigate} alertCount={alertCount} />
      </nav>

      {/* ── Footer: refresh + date range ──────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 px-3 py-3">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex size-6 items-center justify-center rounded-lg bg-white/5 text-brand transition-colors group-hover:bg-white/10">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </span>
          {loading ? "Actualizando…" : "Actualizar datos"}
        </button>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2 text-[10px] text-slate-400">
          <CalendarRange size={12} className="shrink-0 text-slate-500" />
          <span className="tnum truncate" suppressHydrationWarning>
            {dateRange.start} → {dateRange.end}
          </span>
        </div>
      </div>
    </>
  );
}

// ── NavList — renders items with group separators ──────────────────────────────
function NavList({
  section,
  onNavigate,
  alertCount = 0,
}: Pick<SidebarProps, "section" | "onNavigate" | "alertCount">) {
  return (
    <>
      {NAV_ITEMS.map(({ id, label, Icon, group }, index) => {
        const showGroup = !!group && group !== NAV_ITEMS[index - 1]?.group;
        const active = section === id;

        return (
          <div key={id}>
            {showGroup && (
              <p className="px-3 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 first:pt-1">
                {group}
              </p>
            )}
            <button
              onClick={() => onNavigate(id)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 ${
                active
                  ? "bg-brand/15 font-semibold text-white"
                  : "font-medium text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand"
                />
              )}
              <Icon
                size={16}
                strokeWidth={active ? 2.5 : 1.75}
                className={active ? "text-brand" : "transition-colors group-hover:text-slate-200"}
              />
              <span className="truncate">{label}</span>
              {id === "alertas" && alertCount > 0 && (
                <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm shadow-red-950/30">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </>
  );
}
