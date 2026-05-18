"use client";

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
import { exportPDF } from "@/lib/exportPDF";
import { FileText, TrendingUp } from "lucide-react";

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
  const peaks = peakHours(hourly);
  const d = Math.max(1, kpis?.days ?? 1);

  function handlePDF() {
    exportPDF({
      title: "Entradas y Salidas",
      subtitle: "Análisis detallado de flujo de tráfico de personas",
      startTs: filters.startTs,
      endTs: filters.endTs,
      kpis: kpis ?? undefined,
      hourly,
      zones: zoneBreakdown,
      channels: channelBreakdown,
      gender: genderEnter,
      age: ageEnter,
      sections: [
        {
          title: "Promedios diarios",
          rows: [
            ["Entradas / día", kpis ? (kpis.enters / d).toFixed(1) : "—"],
            ["Salidas / día", kpis ? (kpis.exits / d).toFixed(1) : "—"],
            ["Neto / día", kpis ? (kpis.net / d).toFixed(1) : "—"],
            ["Hora pico (entradas)", peaks[0] ? `${peaks[0].hour}:00 h (${peaks[0].count})` : "—"],
          ] as [string, string][],
        },
      ],
    });
  }

  return (
    <section className="px-4 md:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Entradas y Salidas</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Análisis detallado de flujo — período:{" "}
            <span className="font-medium text-slate-700">{filters.startTs.slice(0, 10)}</span> →{" "}
            <span className="font-medium text-slate-700">{filters.endTs.slice(0, 10)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePDF}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <FileText size={13} />
            PDF detallado
          </button>
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
        </div>
      </div>

      {/* KPI cards */}
      <KPICards kpis={kpis} loading={loading} />

      {/* Hourly + Gender/Age */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Tráfico por hora</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">Barras = volumen · Línea = tendencia de entradas</p>
          <BehaviorChart rows={hourly} loading={loading} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Género y Edad</h3>
          <p className="text-xs text-slate-400 mb-4">Distribución de personas que ingresaron</p>
          <GenderAgePanel gender={genderEnter} age={ageEnter} loading={analyticsLoading} />
        </div>
      </div>

      {/* Net flow + Peak hours + Camera ranking */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Flujo neto por hora</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            Verde = más entradas que salidas · Rojo = más salidas que entradas
          </p>
          <NetFlowChart rows={hourly} loading={loading} />
        </div>

        <div className="space-y-5">
          {/* Peak hours */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-[#2DD4BF]" />
              <h3 className="text-sm font-semibold text-slate-700">Horas pico</h3>
            </div>
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
                            className="h-full bg-[#2DD4BF] rounded-full"
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

          {/* Camera ranking */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Rendimiento por cámara</h3>
            <CameraTable channels={channelBreakdown} loading={loading} />
          </div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700">Mapa de calor</h3>
        <p className="text-xs text-slate-400 mt-0.5 mb-4">
          Concentración de tráfico por hora × día de semana
        </p>
        <HeatmapChart rows={heatmap} loading={loading} />
      </div>
    </section>
  );
}
