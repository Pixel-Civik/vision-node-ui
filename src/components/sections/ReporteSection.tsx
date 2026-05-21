/**
 * ReporteSection — full analytics report with filters and tabbed charts.
 * SRP: orchestrates filters + KPIs + chart tabs; no data fetching.
 * Tabs are kept mounted via CSS hidden (fast switching, no remount).
 */
"use client";

import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KPICards } from "@/components/dashboard/KPICards";
import { BehaviorChart } from "@/components/dashboard/BehaviorChart";
import { TrafficPeriodChart } from "@/components/dashboard/TrafficPeriodChart";
import { TIZPanel } from "@/components/dashboard/TIZPanel";
import { ZonePanel } from "@/components/dashboard/ZonePanel";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import { FilterPanel, type FilterValues } from "@/components/filters/FilterPanel";
import { ReporteExportDialog } from "@/components/export/ReporteExportDialog";
import { KPIStrip } from "./KPIStrip";
import { VisionGeneralTab } from "./VisionGeneralTab";
import type { FilterOptions } from "@/hooks/useFilterOptions";
import type {
  KPIResult, HourlyRow, HeatmapRow, ZoneBreakdownRow,
  ChannelBreakdownRow, ConversionHourRow, TIZKpiRow, DashboardFilters,
} from "@/lib/types";

interface ReporteSectionProps {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  heatmap: HeatmapRow[];
  zoneBreakdown: ZoneBreakdownRow[];
  channelBreakdown: ChannelBreakdownRow[];
  conversion: ConversionHourRow[];
  tizKpis: TIZKpiRow[];
  totals: { visitors: number; pasantes: number; conv: number | null };
  filters: DashboardFilters;
  filterValues: FilterValues;
  opts: FilterOptions;
  loading: boolean;
  hasConversion: boolean;
  hasTIZ: boolean;
  onFilterChange: (patch: Partial<FilterValues>) => void;
}

export function ReporteSection({
  kpis, hourly, heatmap, zoneBreakdown, channelBreakdown, conversion, tizKpis,
  totals, filters, filterValues, opts, loading, hasConversion, hasTIZ, onFilterChange,
}: ReporteSectionProps) {
  return (
    <div className="px-4 md:px-6 py-5 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Reporte de Tráfico</h1>
          <p className="text-xs text-slate-500 mt-0.5">Análisis detallado — ajusta los filtros y actualiza</p>
        </div>
        <ReporteExportDialog
          kpis={kpis}
          hourly={hourly}
          heatmap={heatmap}
          zones={zoneBreakdown}
          channels={channelBreakdown}
          startTs={filters.startTs}
          endTs={filters.endTs}
        />
      </div>

      <FilterPanel opts={opts} values={filterValues} onChange={onFilterChange} />

      <KPICards kpis={kpis} loading={loading} />

      <Separator className="my-1" />

      {/* Compact 4-card strip: visitor/pasante/conversion/tracks */}
      <KPIStrip
        visitors={totals.visitors}
        pasantes={totals.pasantes}
        conv={totals.conv}
        uniqueTracks={kpis?.unique_tracks ?? 0}
        loading={loading}
        compact
      />

      <Separator className="my-1" />

      {/* ── Tabs ── */}
      <Tabs defaultValue="combinado">
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="combinado"  className="rounded-lg text-xs font-medium">Visión general</TabsTrigger>
          <TabsTrigger value="resumen"    className="rounded-lg text-xs font-medium">Entradas y Salidas</TabsTrigger>
          {(hasConversion || hasTIZ) && (
            <TabsTrigger value="visitantes" className="rounded-lg text-xs font-medium">Visitantes y Zonas</TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: full overview */}
        <TabsContent value="combinado" className="mt-5">
          <VisionGeneralTab hourly={hourly} heatmap={heatmap} conversion={conversion} loading={loading} />
        </TabsContent>

        {/* Tab 2: entries & exits detail */}
        <TabsContent value="resumen" className="mt-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div id="export-chart-behavior" className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700">Entradas y salidas por hora</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Barras = volumen · Línea = tendencia de entradas</p>
              <BehaviorChart rows={hourly} loading={loading} />
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Franja horaria</h3>
              <p className="text-xs text-slate-400 mb-4">Distribución de entradas por período del día</p>
              <TrafficPeriodChart rows={hourly} loading={loading} />
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">Desglose por zona y cámara</h3>
            <p className="text-xs text-slate-400 mb-4">Entradas y salidas por punto de seguimiento</p>
            <ZonePanel zones={zoneBreakdown} channels={channelBreakdown} loading={loading} />
          </div>
        </TabsContent>

        {/* Tab 3: visitors & zones (conditional) */}
        <TabsContent value="visitantes" className="mt-5 space-y-5">
          {hasConversion && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700">Conversión Pasantes → Ingreso</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">% de transeúntes que ingresaron al local, por hora</p>
              <ConversionChart rows={conversion} loading={loading} />
            </div>
          )}
          {hasTIZ && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-700">Tiempo en Zona</h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Duración de permanencia en zonas monitoreadas</p>
              <TIZPanel rows={tizKpis} loading={loading} />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
