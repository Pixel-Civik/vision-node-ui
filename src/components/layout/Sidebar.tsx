/**
 * Sidebar — branding, navigation and refresh control.
 * SRP: renders sidebar UI only; no data fetching.
 * DIP: depends on typed props (Section, NavItem), not on concrete hooks.
 */
"use client";

import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { NAV_ITEMS, type Section } from "./nav";

interface SidebarProps {
  section: Section;
  onNavigate: (id: Section) => void;
  loading: boolean;
  onRefresh: () => void;
  dateRange: { start: string; end: string };
}

export function Sidebar({
  section,
  onNavigate,
  loading,
  onRefresh,
  dateRange,
}: SidebarProps) {
  return (
    <>
      {/* ── Logo & brand ──────────────────────────────────────────────── */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="bg-[#1C2B45] rounded-2xl px-4 py-4 flex items-center justify-center">
          {/* fill + aspect-ratio avoids the Next.js width/height mismatch warning */}
          <div className="relative w-full" style={{ aspectRatio: "160 / 56" }}>
            <Image
              src="/freshmart.png"
              alt="Freshmart"
              fill
              sizes="160px"
              className="object-cover scale-110"
              priority
            />
          </div>
        </div>
        <p className="text-center text-[10px] text-[#2DD4BF]/60 mt-2.5 tracking-widest uppercase">
          Analytics Platform
        </p>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-5 space-y-1">
        <p className="px-3 pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Navegación
        </p>
        <NavList section={section} onNavigate={onNavigate} />
      </nav>

      {/* ── Footer: refresh + date range ──────────────────────────────── */}
      <div className="px-4 py-4 border-t border-white/10">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "Actualizando..." : "Actualizar datos"}
        </button>
        <p className="text-[10px] text-slate-600 mt-3">
          {dateRange.start} → {dateRange.end}
        </p>
        <div className="flex items-center gap-1.5 mt-3 opacity-30">
          <div className="relative w-full h-8">
            <Image
              src="/pixel_civik.png"
              alt="Pixel Civik"
              fill
              sizes="130px"
              className="object-contain scale-125"
            />
          </div>
        </div>
      </div>
    </>
  );
}

// ── NavList — renders items with group separators ──────────────────────────────
function NavList({
  section,
  onNavigate,
}: Pick<SidebarProps, "section" | "onNavigate">) {
  let lastGroup = "";

  return (
    <>
      {NAV_ITEMS.map(({ id, label, Icon, group }) => {
        const showGroup = !!group && group !== lastGroup;
        if (showGroup) lastGroup = group!;

        return (
          <div key={id}>
            {showGroup && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                {group}
              </p>
            )}
            <button
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                section === id
                  ? "bg-[#2DD4BF]/15 border-l-[3px] border-[#2DD4BF] text-white font-semibold pl-[9px]"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/6"
              }`}
            >
              <Icon
                size={16}
                strokeWidth={section === id ? 2.5 : 1.75}
                style={section === id ? { color: "#2DD4BF" } : undefined}
              />
              {label}
            </button>
          </div>
        );
      })}
    </>
  );
}
