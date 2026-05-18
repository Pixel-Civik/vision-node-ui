"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, LayoutDashboard, FileBarChart2,
  RefreshCw, ArrowRight, Menu, X, LogIn, Users, Clock,
} from "lucide-react";

import { FilterPanel, type FilterValues } from "@/components/filters/FilterPanel";
import { KPICards } from "@/components/dashboard/KPICards";
import { BehaviorChart } from "@/components/dashboard/BehaviorChart";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import { ZonePanel } from "@/components/dashboard/ZonePanel";
import { HeatmapChart } from "@/components/dashboard/HeatmapChart";
import { TIZPanel } from "@/components/dashboard/TIZPanel";
import { TrafficPeriodChart } from "@/components/dashboard/TrafficPeriodChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import { EntradasView } from "@/components/dashboards/EntradasView";
import { VisitantesView } from "@/components/dashboards/VisitantesView";
import { TIZView } from "@/components/dashboards/TIZView";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { useDashboard } from "@/hooks/useDashboard";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { DashboardFilters } from "@/lib/types";

type Section = "inicio" | "reporte" | "entradas" | "visitantes" | "tiz";

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);

const NAV: { id: Section; label: string; Icon: React.ElementType; group?: string }[] = [
  { id: "inicio",     label: "Inicio",             Icon: LayoutDashboard },
  { id: "reporte",    label: "Reporte General",     Icon: FileBarChart2 },
  { id: "entradas",   label: "Entradas y Salidas",  Icon: LogIn,  group: "Análisis" },
  { id: "visitantes", label: "Visitantes",          Icon: Users,  group: "Análisis" },
  { id: "tiz",        label: "Tiempo en Zona",      Icon: Clock,  group: "Análisis" },
];

export default function App() {
  const [section, setSection] = useState<Section>("reporte");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const opts = useFilterOptions();

  const [fv, setFv] = useState<FilterValues>({
    sites: [], channels: [], zones: [],
    hourMin: 7, hourMax: 22,
    dows: [0, 1, 2, 3, 4, 5, 6],
    startDate: weekAgo, endDate: today,
  });

  const resolvedSites    = fv.sites.length    > 0 ? fv.sites    : opts.sites;
  const resolvedChannels = fv.channels.length > 0 ? fv.channels : opts.channels;
  const resolvedZones    = fv.zones.length    > 0 ? fv.zones    : opts.zones;

  const filters = useMemo<DashboardFilters>(
    () => ({
      startTs: `${fv.startDate}T${String(fv.hourMin).padStart(2, "0")}:00:00+00:00`,
      endTs:   `${fv.endDate}T${String(fv.hourMax).padStart(2, "0")}:59:59+00:00`,
      sites:    resolvedSites.length    < opts.sites.length    ? resolvedSites    : null,
      channels: resolvedChannels.length < opts.channels.length ? resolvedChannels : null,
      zones:    resolvedZones.length    < opts.zones.length    ? resolvedZones    : null,
      hourMin:  fv.hourMin,
      hourMax:  fv.hourMax,
      dows:     fv.dows.length < 7 ? fv.dows : null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fv, opts.sites.length, opts.channels.length, opts.zones.length]
  );

  const data = useDashboard(filters);
  const analytics = useAnalytics(filters);
  const hasConversion = data.conversion.some((r) => r.pasantes > 0);
  const hasTIZ = data.tizKpis.length > 0;

  function navigate(id: Section) {
    setSection(id);
    setSidebarOpen(false);
  }

  /* ── Sidebar content ── */
  const SidebarContent = () => {
    let lastGroup = "";
    return (
      <>
        <div className="px-4 py-5 border-b border-white/10">
          <div className="bg-[#1C2B45] rounded-2xl px-4 py-4 flex items-center justify-center">
            <Image
              src="/pixel_civik.png"
              alt="Pixel Civik"
              width={160}
              height={56}
              className="object-contain"
              style={{ width: "100%", height: "auto" }}
              priority
            />
          </div>
          <p className="text-center text-[10px] text-[#2DD4BF]/60 mt-2.5 tracking-widest uppercase">
            Analytics Platform
          </p>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          <p className="px-3 pb-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
            Navegación
          </p>
          {NAV.map(({ id, label, Icon, group }) => {
            const showGroupLabel = group && group !== lastGroup;
            if (showGroupLabel) lastGroup = group;
            return (
              <div key={id}>
                {showGroupLabel && (
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    {group}
                  </p>
                )}
                <button
                  onClick={() => navigate(id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                    section === id
                      ? "bg-[#2DD4BF]/15 border-l-[3px] border-[#2DD4BF] text-white font-semibold pl-[9px]"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/6"
                  }`}
                >
                  <Icon
                    size={16}
                    strokeWidth={section === id ? 2.5 : 1.75}
                    style={section === id ? { color: "#2DD4BF" } : undefined}
                  />
                  {label}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <button
            onClick={data.refresh}
            disabled={data.loading}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={data.loading ? "animate-spin" : ""} />
            {data.loading ? "Actualizando..." : "Actualizar datos"}
          </button>
          <p className="text-[10px] text-slate-600 mt-3">
            {fv.startDate} → {fv.endDate}
          </p>
        </div>
      </>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar (desktop: static, mobile: slide-over) ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-[#0B1222] flex flex-col transition-transform duration-200
          md:static md:translate-x-0 md:flex
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <SidebarContent />
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-slate-700">Vision Node</span>
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <main className="flex-1 overflow-y-auto">
          {data.error && (
            <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={15} />
              {data.error}
            </div>
          )}

          {/* ── INICIO ── */}
          <div className={section !== "inicio" ? "hidden" : undefined}>
            <div className="px-6 md:px-8 py-7 space-y-6 max-w-6xl mx-auto">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Panel de Inicio</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Período: <span className="font-medium text-slate-700">{fv.startDate}</span> →{" "}
                    <span className="font-medium text-slate-700">{fv.endDate}</span>
                  </p>
                </div>
              </div>

              <KPICards kpis={data.kpis} loading={data.loading} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Tráfico por hora</h3>
                  <p className="text-xs text-slate-400 mb-4">Entradas y salidas hora a hora</p>
                  <BehaviorChart rows={data.hourly} loading={data.loading} />
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Distribución del día</h3>
                  <p className="text-xs text-slate-400 mb-4">% de entradas por franja horaria</p>
                  <TrafficPeriodChart rows={data.hourly} loading={data.loading} />
                </div>
              </div>

              <button
                onClick={() => navigate("reporte")}
                className="flex items-center gap-2 text-sm text-[#2DD4BF] hover:text-[#14B8A6] font-semibold transition-colors"
              >
                Explorar reporte completo con filtros
                <ArrowRight size={15} />
              </button>
            </div>
          </div>

          {/* ── REPORTE ── */}
          <div className={section !== "reporte" ? "hidden" : undefined}>
            <div className="px-4 md:px-6 py-5 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Reporte de Tráfico</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Análisis detallado — ajusta los filtros y actualiza
                  </p>
                </div>
                <ExportDialog
                  kpis={data.kpis}
                  hourly={data.hourly}
                  zones={data.zoneBreakdown}
                  channels={data.channelBreakdown}
                  conversion={data.conversion}
                  tiz={data.tizKpis}
                  startTs={filters.startTs}
                  endTs={filters.endTs}
                />
              </div>

              {/* Filters */}
              <FilterPanel
                opts={opts}
                values={fv}
                onChange={(patch) => setFv((prev) => ({ ...prev, ...patch }))}
              />

              {/* KPIs */}
              <KPICards kpis={data.kpis} loading={data.loading} />

              <Separator className="my-1" />

              {/* Tabs */}
              <Tabs defaultValue="resumen">
                <TabsList className="bg-slate-100 p-1 rounded-xl">
                  <TabsTrigger value="resumen" className="rounded-lg text-xs font-medium">
                    Resumen
                  </TabsTrigger>
                  {(hasConversion || hasTIZ) && (
                    <TabsTrigger value="visitantes" className="rounded-lg text-xs font-medium">
                      Visitantes y Zonas
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="avanzado" className="rounded-lg text-xs font-medium">
                    Avanzado
                  </TabsTrigger>
                </TabsList>

                {/* ─ Resumen ─ */}
                <TabsContent value="resumen" className="mt-5 space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-700">Tráfico por hora</h3>
                      <p className="text-xs text-slate-400 mt-0.5 mb-4">Barras = volumen · Línea = tendencia de entradas</p>
                      <BehaviorChart rows={data.hourly} loading={data.loading} />
                    </div>

                    <div className="space-y-5">
                      <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-700 mb-1">Franja horaria</h3>
                        <p className="text-xs text-slate-400 mb-4">Distribución de entradas por período del día</p>
                        <TrafficPeriodChart rows={data.hourly} loading={data.loading} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700 mb-1">Desglose por zona y cámara</h3>
                    <p className="text-xs text-slate-400 mb-4">Entradas y salidas por punto de seguimiento</p>
                    <ZonePanel
                      zones={data.zoneBreakdown}
                      channels={data.channelBreakdown}
                      loading={data.loading}
                    />
                  </div>
                </TabsContent>

                {/* ─ Visitantes ─ */}
                <TabsContent value="visitantes" className="mt-5 space-y-5">
                  {hasConversion && (
                    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-700">Conversión Pasantes → Ingreso</h3>
                      <p className="text-xs text-slate-400 mt-0.5 mb-4">
                        % de transeúntes que ingresaron al local, por hora del día
                      </p>
                      <ConversionChart rows={data.conversion} loading={data.loading} />
                    </div>
                  )}
                  {hasTIZ && (
                    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                      <h3 className="text-sm font-semibold text-slate-700">Tiempo en Zona</h3>
                      <p className="text-xs text-slate-400 mt-0.5 mb-4">
                        Duración de permanencia en zonas monitoreadas
                      </p>
                      <TIZPanel rows={data.tizKpis} loading={data.loading} />
                    </div>
                  )}
                </TabsContent>

                {/* ─ Avanzado ─ */}
                <TabsContent value="avanzado" className="mt-5">
                  <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-700">Mapa de Calor</h3>
                    <p className="text-xs text-slate-400 mt-0.5 mb-4">
                      Concentración de tráfico por hora × día de semana
                    </p>
                    <HeatmapChart rows={data.heatmap} loading={data.loading} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* ── ENTRADAS ── */}
          <div className={section !== "entradas" ? "hidden" : undefined}>
            <EntradasView
              kpis={data.kpis}
              hourly={data.hourly}
              zoneBreakdown={data.zoneBreakdown}
              channelBreakdown={data.channelBreakdown}
              heatmap={data.heatmap}
              genderEnter={analytics.genderEnter}
              ageEnter={analytics.ageEnter}
              loading={data.loading}
              analyticsLoading={analytics.analyticsLoading}
              filters={filters}
            />
          </div>

          {/* ── VISITANTES ── */}
          <div className={section !== "visitantes" ? "hidden" : undefined}>
            <VisitantesView
              hourly={data.hourly}
              conversion={data.conversion}
              genderVisitor={analytics.genderVisitor}
              loading={data.loading}
              analyticsLoading={analytics.analyticsLoading}
              filters={filters}
            />
          </div>

          {/* ── TIZ ── */}
          <div className={section !== "tiz" ? "hidden" : undefined}>
            <TIZView
              tizKpis={data.tizKpis}
              tizRaw={analytics.tizRaw}
              loading={data.loading}
              analyticsLoading={analytics.analyticsLoading}
              filters={filters}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
