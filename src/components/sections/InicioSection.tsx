"use client";

import { ArrowRight } from "lucide-react";
import { TrafficFunnel } from "@/components/charts/TrafficFunnel";
import { TrafficPeriodChart } from "@/components/dashboard/TrafficPeriodChart";
import { CombinedTrafficChart } from "@/components/charts/CombinedTrafficChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import type {
  KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow,
  ConversionHourRow, TIZKpiRow, DashboardFilters,
} from "@/lib/types";

interface InicioSectionProps {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  hourlyAvg: HourlyRow[];
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
  kpis, hourly, hourlyAvg, zoneBreakdown, channelBreakdown, conversion, tizKpis,
  filters, loading, dateRange, onNavigateToReporte,
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

      {/* ── Embudo de conversión (reemplaza KPIs) ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-0.5">Embudo de conversión</h2>
        <p className="text-xs text-slate-400 mb-5">
          Pasantes → Visitantes → Entradas · período seleccionado
        </p>
        <TrafficFunnel rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} kpis={kpis} />
      </div>

      {/* ── Gráficas de tráfico ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Tráfico combinado por hora</h3>
          <p className="text-xs text-slate-400 mb-4">Entradas · Salidas · Visitantes · Pasantes</p>
          <CombinedTrafficChart rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Distribución del día</h3>
          <p className="text-xs text-slate-400 mb-4">% de entradas por franja horaria</p>
          <TrafficPeriodChart rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} />
        </div>
      </div>

      {/* ── CTA ── */}
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
