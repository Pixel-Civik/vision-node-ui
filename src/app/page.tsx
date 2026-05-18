"use client";

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle } from "lucide-react";

import { Sidebar, type SidebarFilters } from "@/components/filters/Sidebar";
import { KPICards } from "@/components/dashboard/KPICards";
import { BehaviorChart } from "@/components/dashboard/BehaviorChart";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import { ZonePanel } from "@/components/dashboard/ZonePanel";
import { HeatmapChart } from "@/components/dashboard/HeatmapChart";
import { TIZPanel } from "@/components/dashboard/TIZPanel";
import { ExportDialog } from "@/components/export/ExportDialog";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { useDashboard } from "@/hooks/useDashboard";
import type { DashboardFilters } from "@/lib/types";

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);

export default function DashboardPage() {
  const opts = useFilterOptions();

  const [sidebar, setSidebar] = useState<SidebarFilters>({
    sites: [],
    channels: [],
    zones: [],
    hourMin: 7,
    hourMax: 23,
    dows: [0, 1, 2, 3, 4, 5, 6],
    metricMode: "Eventos",
    startDate: weekAgo,
    endDate: today,
  });

  const resolvedSites    = sidebar.sites.length    > 0 ? sidebar.sites    : opts.sites;
  const resolvedChannels = sidebar.channels.length > 0 ? sidebar.channels : opts.channels;
  const resolvedZones    = sidebar.zones.length    > 0 ? sidebar.zones    : opts.zones;

  const filters = useMemo<DashboardFilters>(
    () => ({
      startTs: `${sidebar.startDate}T${String(sidebar.hourMin).padStart(2, "0")}:00:00+00:00`,
      endTs:   `${sidebar.endDate}T${String(sidebar.hourMax).padStart(2, "0")}:59:59+00:00`,
      sites:    resolvedSites.length    < opts.sites.length    ? resolvedSites    : null,
      channels: resolvedChannels.length < opts.channels.length ? resolvedChannels : null,
      zones:    resolvedZones.length    < opts.zones.length    ? resolvedZones    : null,
      hourMin:  sidebar.hourMin,
      hourMax:  sidebar.hourMax,
      dows:     sidebar.dows.length < 7 ? sidebar.dows : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sidebar, opts.sites.length, opts.channels.length, opts.zones.length]
  );

  const data = useDashboard(filters);

  const hasConversion = data.conversion.some((r) => r.pasantes > 0);
  const hasTIZ        = data.tizKpis.length > 0;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        opts={opts}
        filters={sidebar}
        onChange={(p) => setSidebar((prev) => ({ ...prev, ...p }))}
        onRefresh={data.refresh}
        loading={data.loading}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Dashboard de Análisis de Tráfico</h2>
            <p className="text-xs text-gray-400">
              {sidebar.startDate} → {sidebar.endDate} · {sidebar.hourMin}h – {sidebar.hourMax}h (hora Lima)
            </p>
          </div>
          <ExportDialog
            kpis={data.kpis}
            hourly={data.hourly}
            zones={data.zoneBreakdown}
            conversion={data.conversion}
            tiz={data.tizKpis}
            startTs={filters.startTs}
            endTs={filters.endTs}
          />
        </div>

        <div className="px-6 py-5 space-y-6">
          {data.error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} />
              {data.error}
            </div>
          )}

          <KPICards kpis={data.kpis} loading={data.loading} />

          <Separator />

          <Tabs defaultValue="resumen">
            <TabsList>
              <TabsTrigger value="resumen">Resumen Ejecutivo</TabsTrigger>
              {(hasConversion || hasTIZ) && (
                <TabsTrigger value="visitantes">Visitantes y Zonas</TabsTrigger>
              )}
              <TabsTrigger value="avanzado">Avanzado</TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="mt-5 space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">Entradas y Salidas por hora</h3>
                  <BehaviorChart rows={data.hourly} loading={data.loading} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Por zona y cámara</h3>
                  <ZonePanel
                    zones={data.zoneBreakdown}
                    channels={data.channelBreakdown}
                    loading={data.loading}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="visitantes" className="mt-5 space-y-6">
              {hasConversion && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-700">Conversión Pasantes → Ingreso</h3>
                  <ConversionChart rows={data.conversion} loading={data.loading} />
                </div>
              )}
              {hasTIZ && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-700">Tiempo en Zona</h3>
                    <TIZPanel rows={data.tizKpis} loading={data.loading} />
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="avanzado" className="mt-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Mapa de calor — hora × día de semana</h3>
              <HeatmapChart rows={data.heatmap} loading={data.loading} />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
