/**
 * TopBar — mobile-only header with hamburger toggle.
 * SRP: only handles the mobile top bar UI.
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
    <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
      <button
        onClick={onOpen}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>
      <span className="text-sm font-semibold text-slate-700">Vision Node</span>
      {open && (
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Cerrar menú"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}
