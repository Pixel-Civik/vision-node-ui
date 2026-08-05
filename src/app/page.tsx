/**
 * page.tsx — Application shell (thin orchestration layer).
 *
 * Responsibilities:
 *  - Holds global state: active section, sidebar open, filter values
 *  - Calls data hooks and passes results down as props
 *  - Renders layout (sidebar + main) and mounts all sections
 *
 * Sections stay mounted via CSS `hidden` (not conditional rendering)
 * to avoid remount cost when the user switches between them.
 *
 * DIP: all data comes from hooks; sections receive typed props only.
 */
"use client";

import { useState, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import dynamic from "next/dynamic";

const Toaster = dynamic(
  () => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })),
  { ssr: false }
);
// Alerta de frescura desactivada: el stream de Supabase está cortado y solo hay
// data histórica, por lo que esta alerta dispararía permanentemente.
// import { useDataFreshnessAlert } from "@/hooks/useDataFreshnessAlert";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { type Section } from "@/components/layout/nav";
import { InicioSection } from "@/components/sections/InicioSection";
import { ReporteSection } from "@/components/sections/ReporteSection";
import { EntradasView } from "@/components/dashboards/EntradasView";
import { VisitantesView } from "@/components/dashboards/VisitantesView";
import { TIZView } from "@/components/dashboards/TIZView";
import { TecnicoSection } from "@/components/sections/TecnicoSection";
import { type FilterValues } from "@/components/filters/FilterPanel";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import { useDashboard } from "@/hooks/useDashboard";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { DashboardFilters } from "@/lib/types";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

// Lima = UTC-5 (no DST). Convert a Lima local date+hour to a UTC ISO string.
// This avoids relying on timezone-offset literals that Postgres may strip
// when the RPC function parameter is `timestamp without time zone`.
function limaToUtc(date: string, h: number, m: number, s: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  // UTC = Lima + 5h; Date.UTC handles hour overflow automatically
  return new Date(Date.UTC(y, mo - 1, d, h + 5, m, s)).toISOString();
}

export default function App() {
  const [section, setSection]       = useState<Section>("reporte");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const opts = useFilterOptions();

  // Las fechas arrancan vacías a propósito: el rango de apertura lo decide la
  // BD (dashboard_default_range = mes en curso, o el último mes con datos) y
  // se DERIVA abajo en vez de copiarse al estado con un efecto. Así no hay
  // render en cascada ni una primera consulta con fechas provisionales.
  //
  // Antes acá se hacía un "snap" a minDate..maxDate, o sea TODO el histórico
  // (170k eventos): eso era lo que mostraba fechas viejas al abrir y lo que
  // hacía que la carga tardara o se cayera por statement timeout.
  const [fvRaw, setFv] = useState<FilterValues>({
    sites: [], channels: [], zones: [],
    hourMin: 0,
    hourMax: 23,
    dows: [0, 1, 2, 3, 4, 5, 6],
    startDate: "",
    endDate: "",
  });

  const dr = opts.defaultRange;

  // Lo que el usuario eligió gana; si todavía no eligió, manda la BD.
  const fv = useMemo<FilterValues>(() => ({
    ...fvRaw,
    startDate: fvRaw.startDate || dr?.start_date || today.slice(0, 8) + "01",
    endDate:   fvRaw.endDate   || dr?.end_date   || today,
  }), [fvRaw, dr]);

  // Resolve "all selected" as null (no filter applied) for the RPC
  const resolvedSites    = fv.sites.length    > 0 ? fv.sites    : opts.sites;
  const resolvedChannels = fv.channels.length > 0 ? fv.channels : opts.channels;
  const resolvedZones    = fv.zones.length    > 0 ? fv.zones    : opts.zones;

  const filters = useMemo<DashboardFilters>(() => ({
    startTs:  limaToUtc(fv.startDate, fv.hourMin, 0, 0),
    endTs:    limaToUtc(fv.endDate, fv.hourMax, 59, 59),
    sites:    resolvedSites.length    < opts.sites.length    ? resolvedSites    : null,
    channels: resolvedChannels.length < opts.channels.length ? resolvedChannels : null,
    zones:    resolvedZones.length    < opts.zones.length    ? resolvedZones    : null,
    hourMin:  fv.hourMin,
    hourMax:  fv.hourMax,
    dows:     fv.dows.length < 7 ? fv.dows : null,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [fv, opts.sites.length, opts.channels.length, opts.zones.length]);

  // No consultar hasta conocer el rango de apertura: si no, se dispararía una
  // consulta con fechas provisionales y otra con las definitivas.
  const dashboardReady = !opts.loading && !!dr;

  const data      = useDashboard(filters, { enabled: dashboardReady });
  const analytics = useAnalytics(filters);

  // useDataFreshnessAlert();  // desactivada — ver nota en el import

  const hasConversion = data.conversion.some((r) => r.pasantes > 0);
  const hasTIZ        = data.tizKpis.length > 0;

  // Los totales (visitors/pasantes/conv) los calcula dashboard_overview.
  // Antes se recorría data.hourly en el cliente en cada render.
  const totals = data.totals;

  function navigate(id: Section) {
    setSection(id);
    setSidebarOpen(false);
  }

  return (
    <>
    <Toaster position="top-right" />
    <div className="flex h-screen bg-slate-50">
      {/* ── Mobile overlay ───────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-[#0B1222] flex flex-col transition-transform duration-200
        md:static md:translate-x-0 md:flex ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar
          section={section}
          onNavigate={navigate}
          loading={data.loading}
          onRefresh={data.refresh}
          dateRange={{ start: fv.startDate, end: fv.endDate }}
        />
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar open={sidebarOpen} onOpen={() => setSidebarOpen(true)} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto overscroll-contain">
          {data.error && (
            <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={15} />
              {data.error}
            </div>
          )}

          {/* Sections — all mounted; visibility toggled via CSS `hidden` */}
          <div className={section !== "inicio"     ? "hidden" : undefined}>
            <InicioSection
              kpis={data.kpis} hourly={data.hourly} hourlyAvg={data.hourlyAvg}
              zoneBreakdown={data.zoneBreakdown} channelBreakdown={data.channelBreakdown}
              conversion={data.conversion} tizKpis={data.tizKpis} totals={totals}
              filters={filters} loading={data.loading}
              dateRange={{ start: fv.startDate, end: fv.endDate }}
              onNavigateToReporte={() => navigate("reporte")}
            />
          </div>

          <div className={section !== "reporte"    ? "hidden" : undefined}>
            <ReporteSection
              kpis={data.kpis} hourly={data.hourly} hourlyAvg={data.hourlyAvg} heatmap={data.heatmap}
              zoneBreakdown={data.zoneBreakdown} channelBreakdown={data.channelBreakdown}
              conversion={data.conversion} tizKpis={data.tizKpis}
              totals={totals} filters={filters} filterValues={fv} opts={opts}
              loading={data.loading} hasConversion={hasConversion} hasTIZ={hasTIZ}
              onFilterChange={(patch) => setFv((prev) => ({ ...prev, ...patch }))}
            />
          </div>

          <div className={section !== "entradas"   ? "hidden" : undefined}>
            <EntradasView
              kpis={data.kpis} hourly={data.hourly} zoneBreakdown={data.zoneBreakdown}
              channelBreakdown={data.channelBreakdown} heatmap={data.heatmap}
              genderEnter={analytics.genderEnter} ageEnter={analytics.ageEnter}
              loading={data.loading} analyticsLoading={analytics.analyticsLoading} filters={filters}
            />
          </div>

          <div className={section !== "visitantes" ? "hidden" : undefined}>
            <VisitantesView
              hourly={data.hourly} conversion={data.conversion}
              genderVisitor={analytics.genderVisitor}
              loading={data.loading} analyticsLoading={analytics.analyticsLoading} filters={filters}
            />
          </div>

          <div className={section !== "tiz"        ? "hidden" : undefined}>
            <TIZView
              tizKpis={data.tizKpis} tizRaw={analytics.tizRaw}
              loading={data.loading} analyticsLoading={analytics.analyticsLoading} filters={filters}
            />
          </div>

          {section === "tecnico" && (
            <TecnicoSection
              hourly={data.hourly}
              loading={data.loading}
              kpis={data.kpis}
              totals={totals}
              filterValues={fv}
              opts={opts}
              onFilterChange={(patch) => setFv((prev) => ({ ...prev, ...patch }))}
            />
          )}
        </main>
      </div>
    </div>
    </>
  );
}
