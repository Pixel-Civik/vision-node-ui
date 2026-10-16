"use client";

import { useState } from "react";
import Image from "next/image";
import { FileBarChart2 } from "lucide-react";
import { PageHeader, PanelTitle } from "@/components/ui/page-header";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrafficFunnel } from "@/components/charts/TrafficFunnel";
import { BehaviorChart } from "@/components/dashboard/BehaviorChart";
import { TrafficPeriodChart } from "@/components/dashboard/TrafficPeriodChart";
import { TIZPanel } from "@/components/dashboard/TIZPanel";
import { ZonePanel } from "@/components/dashboard/ZonePanel";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import {
  FilterPanel,
  type FilterValues,
} from "@/components/filters/FilterPanel";
import { ReporteExportDialog } from "@/components/export/ReporteExportDialog";
import { VisionGeneralTab } from "./VisionGeneralTab";
import { TendenciasTab } from "./TendenciasTab";
import { PerfilVisitantesSection } from "./PerfilVisitantesSection";
import { ComparisonPanel } from "@/components/dashboard/ComparisonPanel";
import type { FilterOptions } from "@/hooks/useFilterOptions";
import type {
  KPIResult,
  HourlyRow,
  HeatmapRow,
  ZoneBreakdownRow,
  ChannelBreakdownRow,
  ConversionHourRow,
  TIZKpiRow,
  DashboardFilters,
} from "@/lib/types";

interface ReporteSectionProps {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  hourlyAvg: HourlyRow[];
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
  kpis,
  hourly,
  hourlyAvg,
  heatmap,
  zoneBreakdown,
  channelBreakdown,
  conversion,
  tizKpis,
  filters,
  filterValues,
  opts,
  loading,
  hasConversion,
  hasTIZ,
  onFilterChange,
}: ReporteSectionProps) {
  const [activeTab, setActiveTab] = useState("combinado");

  const today = new Date().toISOString().slice(0, 10);
  const isPromedioMode =
    !opts.loading &&
    opts.minDate < today &&
    filterValues.startDate === opts.minDate &&
    filterValues.endDate === today;

  return (
    <div className="px-4 md:px-6 py-5 space-y-6">
      {/* ── Header ── */}
      <PageHeader
        title="Reporte de Tráfico"
        icon={<FileBarChart2 size={19} />}
        subtitle="Análisis detallado — ajusta los filtros y actualiza"
        actions={
          <>
            <div className="hidden items-center gap-2 border-r border-slate-200 pr-3 sm:flex">
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-400">
                Cliente
              </span>
              <div className="relative h-10 w-36">
                <Image
                  src="/freshmart.png"
                  alt="Freshmart"
                  fill
                  sizes="124px"
                  className="object-contain scale-200"
                />
              </div>
            </div>
            <ReporteExportDialog
              kpis={kpis}
              hourly={hourly}
              heatmap={heatmap}
              zones={zoneBreakdown}
              channels={channelBreakdown}
              startTs={filters.startTs}
              endTs={filters.endTs}
              filters={filters}
            />
          </>
        }
      />

      <FilterPanel
        opts={opts}
        values={filterValues}
        onChange={onFilterChange}
      />

      {/* Embudo de conversión reemplaza los KPI cards */}
      <div className="panel p-6">
        <PanelTitle title="Embudo de conversión" hint="Pasantes → Visitantes → Entradas · período filtrado" />
        <TrafficFunnel rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} kpis={kpis} />
      </div>

      {/* Contexto comparativo — oculto en modo Promedio */}
      {!isPromedioMode && (
        <div className="panel p-6">
          <ComparisonPanel
            filters={filters}
            kpis={kpis}
            hourly={hourly}
            allSites={opts.sites}
            loading={loading}
          />
        </div>
      )}

      {/* Perfil de visitantes: niños vs adultos (prioridad) y hombres vs mujeres */}
      <PerfilVisitantesSection
        filters={filters}
        filterValues={filterValues}
        enabled={!opts.loading && !!opts.defaultRange}
      />

      <Separator className="my-1" />

      {/* ── Tabs ── */}
      <Tabs defaultValue="combinado" onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="combinado"
            className="rounded-lg text-xs font-medium"
          >
            Visión general
          </TabsTrigger>
          <TabsTrigger
            value="resumen"
            className="rounded-lg text-xs font-medium"
          >
            Entradas
          </TabsTrigger>
          {(hasConversion || hasTIZ) && (
            <TabsTrigger
              value="visitantes"
              className="rounded-lg text-xs font-medium"
            >
              Visitantes y Zonas
            </TabsTrigger>
          )}
          <TabsTrigger
            value="tendencias"
            className="rounded-lg text-xs font-medium"
          >
            Tendencias históricas
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: full overview */}
        <TabsContent value="combinado" className="mt-5">
          <VisionGeneralTab
            hourly={hourly}
            hourlyAvg={hourlyAvg}
            heatmap={heatmap}
            conversion={conversion}
            loading={loading}
            kpis={kpis}
          />
        </TabsContent>

        {/* Tab 2: entries & exits detail */}
        <TabsContent value="resumen" className="mt-5 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div
              id="export-chart-behavior"
              className="lg:col-span-2 panel p-6"
            >
              <h3 className="text-sm font-semibold text-slate-700">
                Entradas por hora
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                Barras = volumen · Línea = tendencia de entradas
              </p>
              <BehaviorChart rows={hourly} loading={loading} />
            </div>
            <div className="panel p-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">
                Franja horaria
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Distribución de entradas por período del día
              </p>
              <TrafficPeriodChart rows={hourly} loading={loading} />
            </div>
          </div>
          <div className="panel p-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">
              Desglose por zona y cámara
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Entradas por punto de seguimiento
            </p>
            <ZonePanel
              zones={zoneBreakdown}
              channels={channelBreakdown}
              loading={loading}
            />
          </div>
        </TabsContent>

        {/* Tab 3: visitors & zones (conditional) */}
        <TabsContent value="visitantes" className="mt-5 space-y-6">
          {hasConversion && (
            <div className="panel p-6">
              <h3 className="text-sm font-semibold text-slate-700">
                Conversión Pasantes → Ingreso
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                % de transeúntes que ingresaron al local, por hora
              </p>
              <ConversionChart rows={conversion} loading={loading} />
            </div>
          )}
          {hasTIZ && (
            <div className="panel p-6">
              <h3 className="text-sm font-semibold text-slate-700">
                Tiempo en Zona
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">
                Duración de permanencia en zonas monitoreadas
              </p>
              <TIZPanel rows={tizKpis} loading={loading} />
            </div>
          )}
        </TabsContent>
        {/* Tab 4: historical trends — lazy mount to avoid parallel query burst on load */}
        <TabsContent value="tendencias" className="mt-5">
          {activeTab === "tendencias" && (
            <TendenciasTab
              filters={filters}
              allSites={opts.sites}
              minDate={opts.minDate}
              maxDate={opts.maxDate}
              availableDates={opts.availableDates}
              loading={loading}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
