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

import { useState, useMemo, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

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

const today     = new Date().toISOString().slice(0, 10);
// "Yesterday" as default end — today's data is always incomplete (day in progress)
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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

  // Always initialise with `yesterday` so SSR and client render the same markup.
  // The useEffect below (didSnapRef) snaps to opts.minDate once data is ready.
  const [fv, setFv] = useState<FilterValues>({
    sites: [], channels: [], zones: [],
    hourMin: 0,
    hourMax: 23,
    dows: [0, 1, 2, 3, 4, 5, 6],
    startDate: yesterday,
    endDate: yesterday,
  });

  // After the fresh DB query completes, snap to complete-days range: minDate..yesterday.
  // useRef ensures this runs exactly once so user selections aren't overwritten.
  const didSnapRef = useRef(false);
  useEffect(() => {
    if (opts.loading || didSnapRef.current) return;
    // Skip if opts.minDate is still the EMPTY placeholder (= today).
    // The effect re-runs when opts.minDate updates, so the snap fires
    // as soon as the DB query resolves with a real past date.
    if (opts.minDate >= today) return;
    didSnapRef.current = true;
    const yd = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    setFv((prev) => ({ ...prev, startDate: opts.minDate, endDate: yd }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.loading, opts.minDate]);

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

  const data      = useDashboard(filters);
  const analytics = useAnalytics(filters);

  const hasConversion = data.conversion.some((r) => r.pasantes > 0);
  const hasTIZ        = data.tizKpis.length > 0;

  // Derived visitor/pasante totals computed from hourly (no extra RPC needed)
  const totals = useMemo(() => {
    let visitors = 0, pasantes = 0;
    for (const r of data.hourly) {
      if (r.event_type === "visitor") visitors += r.count;
      if (r.event_type === "pasante") pasantes += r.count;
    }
    const conv = pasantes > 0 ? Math.round((visitors / pasantes) * 1000) / 10 : null;
    return { visitors, pasantes, conv };
  }, [data.hourly]);

  function navigate(id: Section) {
    setSection(id);
    setSidebarOpen(false);
  }

  return (
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
              kpis={data.kpis} hourly={data.hourly} zoneBreakdown={data.zoneBreakdown}
              channelBreakdown={data.channelBreakdown} conversion={data.conversion}
              tizKpis={data.tizKpis} totals={totals} filters={filters} loading={data.loading}
              dateRange={{ start: fv.startDate, end: fv.endDate }}
              onNavigateToReporte={() => navigate("reporte")}
            />
          </div>

          <div className={section !== "reporte"    ? "hidden" : undefined}>
            <ReporteSection
              kpis={data.kpis} hourly={data.hourly} heatmap={data.heatmap}
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

          <div className={section !== "tecnico" ? "hidden" : undefined}>
            <TecnicoSection
              hourly={data.hourly}
              loading={data.loading}
              kpis={data.kpis}
              totals={totals}
              filterValues={fv}
              opts={opts}
              onFilterChange={(patch) => setFv((prev) => ({ ...prev, ...patch }))}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
