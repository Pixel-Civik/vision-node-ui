"use client";

import type { TIZKpiRow, TIZRaw, DashboardFilters } from "@/lib/types";
import { TIZPanel } from "@/components/dashboard/TIZPanel";
import { TIZDistributionChart } from "@/components/charts/TIZDistributionChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import { exportPDF } from "@/lib/exportPDF";
import { FileText, Clock, BarChart2, Activity } from "lucide-react";

interface Props {
  tizKpis: TIZKpiRow[];
  tizRaw: TIZRaw[];
  loading: boolean;
  analyticsLoading: boolean;
  filters: DashboardFilters;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function fmtSecs(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  return `${(s / 60).toFixed(1)}min`;
}

interface InlineKPIProps {
  label: string;
  value: string;
  sub: string;
  borderColor: string;
  Icon: React.ElementType;
  loading: boolean;
}

function InlineKPI({ label, value, sub, borderColor, Icon, loading }: InlineKPIProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 animate-pulse">
        <div className="h-3 bg-slate-100 rounded w-1/2 mb-3" />
        <div className="h-8 bg-slate-100 rounded w-2/3 mb-2" />
        <div className="h-3 bg-slate-100 rounded w-1/3" />
      </div>
    );
  }
  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 overflow-hidden flex"
      style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
    >
      <div className="flex-1">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${borderColor}18` }}
          >
            <Icon size={16} style={{ color: borderColor }} />
          </div>
        </div>
        <p className="text-3xl font-bold text-slate-900 mt-3 leading-none tracking-tight">{value}</p>
        <p className="text-xs text-slate-400 mt-2">{sub}</p>
      </div>
    </div>
  );
}

export function TIZView({ tizKpis, tizRaw, loading, analyticsLoading, filters }: Props) {
  const durations = tizRaw.map((r) => r.dwell_sec);
  const totalVisitas = tizRaw.length;
  const medianVal = median(durations);
  const avgVal = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const p90Val = pct(durations, 90);

  function handlePDF() {
    exportPDF({
      title: "Tiempo en Zona",
      subtitle: "Análisis de permanencia en zonas monitoreadas",
      startTs: filters.startTs,
      endTs: filters.endTs,
      sections: [
        {
          title: "KPIs de Permanencia",
          rows: [
            ["Total visitas (raw)", totalVisitas.toLocaleString()],
            ["Mediana de permanencia", fmtSecs(medianVal)],
            ["Promedio de permanencia", fmtSecs(avgVal)],
            ["P90 (visitas largas)", fmtSecs(p90Val)],
          ] as [string, string][],
        },
        {
          title: "Por zona",
          rows: tizKpis.map((r) => [r.zone, `Mediana: ${fmtSecs(r.median_s)} · ${r.count} visitas`] as [string, string]),
        },
      ],
    });
  }

  return (
    <section className="px-4 md:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Tiempo en Zona</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Permanencia en zonas monitoreadas — período:{" "}
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
            PDF
          </button>
          <ExportDialog
            kpis={null}
            hourly={[]}
            zones={[]}
            conversion={[]}
            tiz={tizKpis}
            startTs={filters.startTs}
            endTs={filters.endTs}
          />
        </div>
      </div>

      {/* 4 inline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <InlineKPI
          label="Total visitas"
          value={analyticsLoading ? "—" : totalVisitas.toLocaleString()}
          sub="registros con duración"
          borderColor="#7c3aed"
          Icon={Activity}
          loading={analyticsLoading}
        />
        <InlineKPI
          label="Mediana"
          value={analyticsLoading ? "—" : fmtSecs(medianVal)}
          sub="visitante típico"
          borderColor="#6d28d9"
          Icon={Clock}
          loading={analyticsLoading}
        />
        <InlineKPI
          label="Promedio"
          value={analyticsLoading ? "—" : fmtSecs(avgVal)}
          sub="duración media"
          borderColor="#8b5cf6"
          Icon={BarChart2}
          loading={analyticsLoading}
        />
        <InlineKPI
          label="P90"
          value={analyticsLoading ? "—" : fmtSecs(p90Val)}
          sub="visitas largas"
          borderColor="#a78bfa"
          Icon={Clock}
          loading={analyticsLoading}
        />
      </div>

      {/* Distribution + By zone */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Distribución de permanencia</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            Cantidad de visitas por rango de duración
          </p>
          <TIZDistributionChart tizRaw={tizRaw} loading={analyticsLoading} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Por zona</h3>
          <p className="text-xs text-slate-400 mb-4">Mediana y totales por zona monitorizada</p>
          <TIZPanel rows={tizKpis} loading={loading} />
        </div>
      </div>
    </section>
  );
}
