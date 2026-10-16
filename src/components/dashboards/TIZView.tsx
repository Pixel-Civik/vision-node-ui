"use client";

import type { TIZKpiRow, TIZDistribution, DashboardFilters } from "@/lib/types";
import { TIZPanel } from "@/components/dashboard/TIZPanel";
import { StatCard } from "@/components/dashboard/StatCard";
import { TIZDistributionChart } from "@/components/charts/TIZDistributionChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import { exportPDF } from "@/lib/exportPDF";
import { PageHeader, PanelTitle } from "@/components/ui/page-header";
import { FileText, Clock, BarChart2, Activity } from "lucide-react";

interface Props {
  tizKpis: TIZKpiRow[];
  tizDistribution: TIZDistribution | null;
  loading: boolean;
  analyticsLoading: boolean;
  filters: DashboardFilters;
}

function fmtSecs(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  return `${(s / 60).toFixed(1)}min`;
}

export function TIZView({ tizKpis, tizDistribution, loading, analyticsLoading, filters }: Props) {
  const totalVisitas = tizDistribution?.count ?? 0;
  const medianVal = tizDistribution?.median_s ?? 0;
  const avgVal = tizDistribution?.avg_s ?? 0;
  const p90Val = tizDistribution?.p90_s ?? 0;

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
            ["Total visitas", totalVisitas.toLocaleString()],
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
      <PageHeader
        title="Tiempo en Zona"
        icon={<Clock size={19} />}
        subtitle={
          <>
            Permanencia en zonas monitoreadas — período:{" "}
            <span className="tnum font-medium text-slate-700">{filters.startTs.slice(0, 10)}</span> →{" "}
            <span className="tnum font-medium text-slate-700">{filters.endTs.slice(0, 10)}</span>
          </>
        }
        actions={
          <>
            <button
              onClick={handlePDF}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
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
          </>
        }
      />

      {/* 4 inline KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Total visitas"
          value={analyticsLoading ? "—" : totalVisitas.toLocaleString()}
          sub="registros con duración"
          accent="#0D9488"
          Icon={Activity}
          loading={analyticsLoading}
        />
        <StatCard
          label="Mediana"
          value={analyticsLoading ? "—" : fmtSecs(medianVal)}
          sub="visitante típico"
          accent="#14B8A6"
          Icon={Clock}
          loading={analyticsLoading}
        />
        <StatCard
          label="Promedio"
          value={analyticsLoading ? "—" : fmtSecs(avgVal)}
          sub="duración media"
          accent="#0B1222"
          Icon={BarChart2}
          loading={analyticsLoading}
        />
        <StatCard
          label="P90"
          value={analyticsLoading ? "—" : fmtSecs(p90Val)}
          sub="visitas largas"
          accent="#64748B"
          Icon={Clock}
          loading={analyticsLoading}
        />
      </div>

      {/* Distribution + By zone */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 panel p-5">
          <PanelTitle
            title="Distribución de permanencia"
            hint="Cantidad de visitas por rango de duración"
          />
          <TIZDistributionChart buckets={tizDistribution?.buckets ?? []} loading={analyticsLoading} />
        </div>

        <div className="panel p-5">
          <PanelTitle title="Por zona" hint="Mediana y totales por zona monitorizada" />
          <TIZPanel rows={tizKpis} loading={loading} />
        </div>
      </div>
    </section>
  );
}
