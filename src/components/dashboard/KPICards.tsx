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
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex">
      <div className="w-1 shrink-0" style={{ backgroundColor: accent }} />
      <div className="flex-1 px-5 py-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}18` }}>
            <Icon size={16} style={{ color: accent }} />
          </div>
        </div>
        <p className="text-4xl font-bold text-slate-900 mt-3 leading-none tracking-tight">{value}</p>
        <p className="text-xs text-slate-400 mt-2">{total}</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex animate-pulse">
      <div className="w-1 bg-slate-200 shrink-0" />
      <div className="flex-1 px-5 py-5 space-y-3">
        <div className="h-3 bg-slate-100 rounded w-1/2" />
        <div className="h-9 bg-slate-100 rounded w-2/3" />
        <div className="h-3 bg-slate-100 rounded w-1/3" />
      </div>
    </div>
  );
}

export function KPICards({ kpis, loading }: { kpis: KPIResult | null; loading: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KPICard
        label="Entradas / día"
        value={Math.round(kpis.enters_per_day).toLocaleString()}
        total={`${kpis.enters.toLocaleString()} total · ${kpis.days} día(s)`}
        accent="#059669"
        Icon={LogIn}
      />
      <KPICard
        label="Salidas / día"
        value={Math.round(kpis.exits_per_day).toLocaleString()}
        total={`${kpis.exits.toLocaleString()} total`}
        accent="#DC2626"
        Icon={LogOut}
      />
      <KPICard
        label="Ingresantes / día"
        value={Math.round(ingresantes_per_day).toLocaleString()}
        total={`${kpis.unique_tracks.toLocaleString()} trazas únicas · prom. (ent+sal)÷2`}
        accent="#7C3AED"
        Icon={Users}
      />
    </div>
  );
}
