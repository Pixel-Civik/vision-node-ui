"use client";

import type { KPIResult } from "@/lib/types";
import { LogIn, LogOut, Activity } from "lucide-react";

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

  const d = Math.max(1, kpis.days);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KPICard
        label="Entradas / día"
        value={(kpis.enters / d).toFixed(1)}
        total={`${kpis.enters.toLocaleString()} total · ${kpis.days} día(s)`}
        accent="#059669"
        Icon={LogIn}
      />
      <KPICard
        label="Salidas / día"
        value={(kpis.exits / d).toFixed(1)}
        total={`${kpis.exits.toLocaleString()} total`}
        accent="#DC2626"
        Icon={LogOut}
      />
      <KPICard
        label="Neto / día"
        value={(kpis.net / d).toFixed(1)}
        total={`${kpis.net > 0 ? "+" : ""}${kpis.net.toLocaleString()} total`}
        accent="#2563EB"
        Icon={Activity}
      />
    </div>
  );
}
