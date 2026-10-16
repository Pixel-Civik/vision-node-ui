"use client";

import type { ElementType } from "react";

interface StatCardProps {
  label: string;
  value: string;
  sub: string;
  accent: string;
  Icon: ElementType;
  loading?: boolean;
}

/**
 * StatCard — tarjeta de indicador reutilizable (etiqueta + cifra + apoyo).
 * Mismo lenguaje visual que KPIStrip/KPICards para unificar todas las vistas.
 */
export function StatCard({ label, value, sub, accent, Icon, loading }: StatCardProps) {
  return (
    <div className="panel panel-interactive p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon size={15} />
        </span>
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-100" />
      ) : (
        <p className="tnum mt-2 text-2xl font-semibold leading-none tracking-tight text-slate-900">
          {value}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}
