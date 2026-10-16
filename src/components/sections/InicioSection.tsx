"use client";

import { ArrowRight, LayoutDashboard } from "lucide-react";
import { PageHeader, PanelTitle } from "@/components/ui/page-header";
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
    <div className="mx-auto max-w-6xl space-y-5 px-6 py-7 md:px-8">
      {/* ── Header ── */}
      <PageHeader
        title="Panel de Inicio"
        icon={<LayoutDashboard size={19} />}
        subtitle={
          <>
            Período:{" "}
            <span className="tnum font-medium text-slate-700">{dateRange.start}</span>
            {" → "}
            <span className="tnum font-medium text-slate-700">{dateRange.end}</span>
          </>
        }
        actions={
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
        }
      />

      {/* ── Embudo de conversión (reemplaza KPIs) ── */}
      <div className="panel cv-auto p-5">
        <PanelTitle title="Embudo de conversión" hint="Pasantes → Visitantes → Entradas · período seleccionado" />
        <TrafficFunnel rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} kpis={kpis} />
      </div>

      {/* ── Gráficas de tráfico ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel cv-auto p-5 lg:col-span-2">
          <PanelTitle title="Tráfico combinado por hora" hint="Entradas · Salidas · Visitantes · Pasantes" />
          <CombinedTrafficChart rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} />
        </div>
        <div className="panel cv-auto p-5">
          <PanelTitle title="Distribución del día" hint="% de entradas por franja horaria" />
          <TrafficPeriodChart rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} />
        </div>
      </div>

      {/* ── CTA ── */}
      <button
        onClick={onNavigateToReporte}
        className="group inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-strong transition-colors hover:text-brand"
      >
        Explorar reporte completo con filtros
        <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
