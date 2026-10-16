"use client";

import { useState } from "react";
import type {
  KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow,
  HeatmapRow, GenderRow, AgeRow, DashboardFilters,
} from "@/lib/types";
import { KPICards } from "@/components/dashboard/KPICards";
import { BehaviorChart } from "@/components/dashboard/BehaviorChart";
import { HeatmapChart } from "@/components/dashboard/HeatmapChart";
import { GenderAgePanel } from "@/components/charts/GenderAgePanel";
import { NetFlowChart } from "@/components/charts/NetFlowChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import { PDFExportDialog } from "@/components/export/PDFExportDialog";
import { PageHeader, PanelTitle } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { TrendingUp, LogIn, Users, Grid2x2 } from "lucide-react";

interface Props {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  zoneBreakdown: ZoneBreakdownRow[];
  channelBreakdown: ChannelBreakdownRow[];
  heatmap: HeatmapRow[];
  genderEnter: GenderRow[];
  ageEnter: AgeRow[];
  loading: boolean;
  analyticsLoading: boolean;
  filters: DashboardFilters;
}

function peakHours(rows: HourlyRow[], top = 5) {
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.event_type !== "enter") continue;
    map.set(r.hour, (map.get(r.hour) ?? 0) + r.count);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([hour, count]) => ({ hour, count }));
}

function CameraTable({ channels, loading }: { channels: ChannelBreakdownRow[]; loading: boolean }) {
  if (loading) return <div className="h-24 bg-slate-50 rounded-xl animate-pulse" />;
  const map = new Map<string, { enters: number; exits: number }>();
  for (const r of channels) {
    if (!["enter", "exit"].includes(r.event_type)) continue;
    const cur = map.get(r.channel) ?? { enters: 0, exits: 0 };
    if (r.event_type === "enter") cur.enters += r.count;
    else cur.exits += r.count;
    map.set(r.channel, cur);
  }
  const rows = Array.from(map.entries()).sort((a, b) => b[1].enters - a[1].enters);
  if (!rows.length) return <p className="text-xs text-slate-400 py-4 text-center">Sin datos</p>;
  const maxEnters = rows[0][1].enters;

  return (
    <div className="space-y-2">
      {rows.map(([ch, d]) => (
        <div key={ch} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium truncate max-w-[60%]">{ch}</span>
            <span className="text-slate-400">
              <span className="text-emerald-600 font-semibold">{d.enters}</span>
              {" ent · "}
              <span className="text-red-500 font-semibold">{d.exits}</span>
              {" sal"}
            </span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full"
              style={{ width: maxEnters > 0 ? `${(d.enters / maxEnters) * 100}%` : "0%" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EntradasView({
  kpis, hourly, zoneBreakdown, channelBreakdown,
  heatmap, genderEnter, ageEnter, loading, analyticsLoading, filters,
}: Props) {
  const [tab, setTab] = useState("resumen");
  const peaks = peakHours(hourly);

  return (
    <section className="px-4 md:px-6 py-5 space-y-5">
      {/* Header */}
      <PageHeader
        title="Entradas y Salidas"
        icon={<LogIn size={19} />}
        subtitle={
          <>
            Análisis detallado de flujo — período:{" "}
            <span className="tnum font-medium text-slate-700">{filters.startTs.slice(0, 10)}</span> →{" "}
            <span className="tnum font-medium text-slate-700">{filters.endTs.slice(0, 10)}</span>
          </>
        }
        actions={
          <>
            <PDFExportDialog
              kpis={kpis}
              hourly={hourly}
              heatmap={heatmap}
              zones={zoneBreakdown}
              channels={channelBreakdown}
              gender={genderEnter}
              age={ageEnter}
              filters={filters}
            />
            <ExportDialog
              kpis={kpis}
              hourly={hourly}
              zones={zoneBreakdown}
              channels={channelBreakdown}
              conversion={[]}
              tiz={[]}
              startTs={filters.startTs}
              endTs={filters.endTs}
            />
          </>
        }
      />

      {/* KPI cards — contexto común a todas las sub-pestañas */}
      <KPICards kpis={kpis} loading={loading} />

      <SectionTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: "resumen",
            label: "Resumen",
            icon: TrendingUp,
            content: (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 panel p-5">
                  <PanelTitle title="Tráfico por hora" hint="Barras = volumen · Línea = tendencia de entradas" />
                  <BehaviorChart rows={hourly} loading={loading} />
                </div>
                <div className="panel p-5">
                  <PanelTitle title="Horas pico" hint="Franjas con mayor volumen de entradas" />
                  {loading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-6 bg-slate-50 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : peaks.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">Sin datos</p>
                  ) : (
                    <div className="space-y-2">
                      {peaks.map(({ hour, count }, i) => {
                        const max = peaks[0].count;
                        return (
                          <div key={hour} className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 w-4">{i + 1}</span>
                            <div className="flex-1 space-y-0.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-600 font-medium">{hour}:00 h</span>
                                <span className="text-emerald-600 font-semibold">{count}</span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand rounded-full"
                                  style={{ width: `${(count / max) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ),
          },
          {
            value: "flujo",
            label: "Flujo y cámaras",
            icon: LogIn,
            content: (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 panel p-5">
                  <PanelTitle
                    title="Flujo neto por hora"
                    hint="Verde = más entradas que salidas · Rojo = más salidas que entradas"
                  />
                  <NetFlowChart rows={hourly} loading={loading} />
                </div>
                <div className="panel p-5">
                  <PanelTitle title="Rendimiento por cámara" hint="Entradas y salidas por punto de seguimiento" />
                  <CameraTable channels={channelBreakdown} loading={loading} />
                </div>
              </div>
            ),
          },
          {
            value: "demografia",
            label: "Género y edad",
            icon: Users,
            content: (
              <div className="panel p-5">
                <PanelTitle title="Género y edad" hint="Distribución de personas que ingresaron" />
                <GenderAgePanel gender={genderEnter} age={ageEnter} loading={analyticsLoading} />
              </div>
            ),
          },
          {
            value: "heatmap",
            label: "Mapa de calor",
            icon: Grid2x2,
            content: (
              <div className="panel p-5">
                <PanelTitle title="Mapa de calor" hint="Concentración de tráfico por hora × día de semana" />
                <HeatmapChart rows={heatmap} loading={loading} />
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
