"use client";

import type { KPIResult } from "@/lib/types";
import { Users, LogIn, LogOut, Activity } from "lucide-react";

interface CardProps {
  label: string;
  value: string;
  total: string;
  help: string;
  accent: string;
  Icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
}

function KPICard({ label, value, total, help, accent, Icon, badge, badgeColor }: CardProps) {
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
        <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
          <p className="text-[11px] text-slate-400 leading-relaxed">{help}</p>
          {badge && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2"
              style={{ backgroundColor: `${badgeColor ?? accent}18`, color: badgeColor ?? accent }}
            >
              {badge}
            </span>
          )}
        </div>
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
  const exitRate = kpis.enters > 0 ? Math.round((kpis.exits / kpis.enters) * 1000) / 10 : 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Entradas / día"
          value={(kpis.enters / d).toFixed(1)}
          total={`${kpis.enters.toLocaleString()} total · ${kpis.days} día(s)`}
          help="Promedio diario de personas que ingresaron al local."
          accent="#059669"
          Icon={LogIn}
        />
        <KPICard
          label="Salidas / día"
          value={(kpis.exits / d).toFixed(1)}
          total={`${kpis.exits.toLocaleString()} total`}
          help="Promedio diario de salidas capturadas por sensores."
          accent="#DC2626"
          Icon={LogOut}
          badge={`Captura ${exitRate}%`}
          badgeColor={exitRate >= 80 ? "#059669" : "#D97706"}
        />
        <KPICard
          label="Neto / día"
          value={(kpis.net / d).toFixed(1)}
          total={`${kpis.net > 0 ? "+" : ""}${kpis.net.toLocaleString()} total`}
          help="Diferencia entradas − salidas. Neto alto indica salidas no capturadas."
          accent="#2563EB"
          Icon={Activity}
        />
      </div>
      {exitRate < 80 && (
        <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">
          <Users size={13} />
          Tasa de captura de salidas {exitRate}% — revisar sensores de salida para mayor precisión.
        </div>
      )}
    </div>
  );
}
