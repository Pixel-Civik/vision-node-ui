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
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-md xl:hidden">
      <button
        onClick={open ? onClose : onOpen}
        className="flex size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 active:scale-95"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        aria-controls="app-sidebar"
      >
        {open ? <X size={19} /> : <Menu size={20} />}
      </button>
      <div className="min-w-0">
        <span className="block truncate text-sm font-bold tracking-tight text-slate-800">
          Vision Node
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-strong">
          Pixel Civik
        </span>
      </div>
      <span className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-muted px-2.5 py-1 text-[10px] font-semibold text-brand-strong">
        <span className="size-1.5 rounded-full bg-brand-strong" />
        Lens
      </span>
    </div>
  );
}
