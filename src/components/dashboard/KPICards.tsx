"use client";

import type { KPIResult } from "@/lib/types";
import { LogIn, LogOut, Users } from "lucide-react";

interface CardProps {
  label: string;
  value: string;
  total: string;
  accent: string;
  Icon: React.ElementType;
}

function KPICard({ label, value, total, accent, Icon }: CardProps) {
  return (
    <div className="panel panel-interactive relative overflow-hidden p-5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}14`, color: accent }}
        >
          <Icon size={16} />
        </span>
      </div>
      <p className="tnum mt-3 text-3xl font-semibold leading-none tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{total}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="panel animate-pulse p-5">
      <div className="flex items-start justify-between">
        <div className="h-3 w-1/2 rounded bg-slate-100" />
        <div className="size-8 rounded-lg bg-slate-100" />
      </div>
      <div className="mt-3 h-9 w-2/3 rounded bg-slate-100" />
      <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
    </div>
  );
}

export function KPICards({ kpis, loading }: { kpis: KPIResult | null; loading: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // enters_per_day / exits_per_day come pre-computed from the DB function —
  // no frontend division needed.
  const ingresantes_per_day = (kpis.enters_per_day + kpis.exits_per_day) / 2;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KPICard
        label="Entradas / día"
        value={Math.round(kpis.enters_per_day).toLocaleString()}
        total={`${kpis.enters.toLocaleString()} total · ${kpis.days} día(s)`}
        accent="#0D9488"
        Icon={LogIn}
      />
      <KPICard
        label="Salidas / día"
        value={Math.round(kpis.exits_per_day).toLocaleString()}
        total={`${kpis.exits.toLocaleString()} total`}
        accent="#64748B"
        Icon={LogOut}
      />
      <KPICard
        label="Ingresantes / día"
        value={Math.round(ingresantes_per_day).toLocaleString()}
        total={`${kpis.unique_tracks.toLocaleString()} trazas únicas · prom. (ent+sal)÷2`}
        accent="#0B1222"
        Icon={Users}
      />
    </div>
  );
}
