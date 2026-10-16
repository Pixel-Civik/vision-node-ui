/**
 * TopBar — mobile/tablet header with hamburger toggle.
 * SRP: only handles the compact top bar UI.
 */
"use client";

import { Menu, X } from "lucide-react";

interface TopBarProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function TopBar({ open, onOpen, onClose }: TopBarProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur xl:hidden">
      <button
        onClick={open ? onClose : onOpen}
        className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        aria-controls="app-sidebar"
      >
        {open ? <X size={19} /> : <Menu size={20} />}
      </button>
      <div className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-800">Vision Node</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-teal-600">Pixel Civik</span>
      </div>
      <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">Panel</span>
    </div>
  );
}
