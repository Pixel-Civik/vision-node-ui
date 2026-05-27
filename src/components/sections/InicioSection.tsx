/**
 * InicioSection — landing overview for the dashboard.
 * SRP: composes high-level KPIs + combined traffic snapshot.
 * DIP: receives typed data via props; no direct API calls.
 */
"use client";

import { ArrowRight } from "lucide-react";
import { KPICards } from "@/components/dashboard/KPICards";
import { TrafficPeriodChart } from "@/components/dashboard/TrafficPeriodChart";
import { CombinedTrafficChart } from "@/components/charts/CombinedTrafficChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import { KPIStrip } from "./KPIStrip";
import type { KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, ConversionHourRow, TIZKpiRow } from "@/lib/types";
import type { DashboardFilters } from "@/lib/types";

interface InicioSectionProps {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  zoneBreakdown: ZoneBreakdownRow[];
  channelBreakdown: ChannelBreakdownRow[];
  conversion: ConversionHourRow[];
  tizKpis: TIZKpiRow[];
  totals: { visitors: number; pasantes: number; conv: number | null };
  filters: DashboardFilters;
  loading: boolean;
  dateRange: { start: string; end: string };
  onNavigateToReporte: () => void;
}

export function InicioSection({
  kpis, hourly, zoneBreakdown, channelBreakdown, conversion, tizKpis,
  totals, filters, loading, dateRange, onNavigateToReporte,
}: InicioSectionProps) {
  return (
    <div className="px-6 md:px-8 py-7 space-y-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Panel de Inicio</h1>
          <p className="text-sm text-slate-500 mt-1">
            Período:{" "}
            <span className="font-medium text-slate-700">{dateRange.start}</span>
            {" → "}
            <span className="font-medium text-slate-700">{dateRange.end}</span>
          </p>
        </div>
        <ExportDialog
          kpis={kpis}
          hourly={hourly}
          zones={zoneBreakdown}
          channels={channelBreakdown}
          conversion={conversion}
          tiz={tizKpis}
          startTs={filters.startTs}
          endTs={filters.endTs}
        />
      </div>

      {/* ── Primary KPIs ── */}
      <KPICards kpis={kpis} loading={loading} />

      {/* ── Visitor / pasante strip ── */}
      <KPIStrip
        visitors={totals.visitors}
        pasantes={totals.pasantes}
        conv={totals.conv}
        uniqueTracks={kpis?.unique_tracks ?? 0}
        days={kpis?.days ?? 1}
        loading={loading}
      />

      {/* ── Traffic charts: combined (2/3) + period distribution (1/3) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Tráfico combinado por hora</h3>
          <p className="text-xs text-slate-400 mb-4">Entradas · Salidas · Visitantes · Pasantes</p>
          <CombinedTrafficChart rows={hourly} loading={loading} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Distribución del día</h3>
          <p className="text-xs text-slate-400 mb-4">% de entradas por franja horaria</p>
          <TrafficPeriodChart rows={hourly} loading={loading} />
        </div>
      </div>

      {/* ── CTA to full report ── */}
      <button
        onClick={onNavigateToReporte}
        className="flex items-center gap-2 text-sm text-[#2DD4BF] hover:text-[#14B8A6] font-semibold transition-colors"
      >
        Explorar reporte completo con filtros
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
