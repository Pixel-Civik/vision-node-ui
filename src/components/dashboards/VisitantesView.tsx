"use client";

import type {
  HourlyRow,
  ConversionHourRow,
  GenderRow,
  DashboardFilters,
} from "@/lib/types";
import { useState } from "react";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import { StatCard } from "@/components/dashboard/StatCard";
import { ExportDialog } from "@/components/export/ExportDialog";
import { GenderAgePanel } from "@/components/charts/GenderAgePanel";
import { VisitorFlowChart } from "@/components/charts/VisitorFlowChart";
import { exportPDF } from "@/lib/exportPDF";
import { PageHeader, PanelTitle } from "@/components/ui/page-header";
import { SectionTabs } from "@/components/ui/section-tabs";
import { FileText, Users, ArrowRight, Clock, TrendingUp } from "lucide-react";

interface Props {
  hourly: HourlyRow[];
  conversion: ConversionHourRow[];
  genderVisitor: GenderRow[];
  loading: boolean;
  analyticsLoading: boolean;
  filters: DashboardFilters;
}

interface LocalKPIs {
  totalVisitors: number;
  totalPasantes: number;
  conversionPct: number;
  peakHour: number | null;
}

function computeKPIs(hourly: HourlyRow[]): LocalKPIs {
  let totalVisitors = 0;
  let totalPasantes = 0;
  let peakHour: number | null = null;
  let peakCount = -1;

  const visitorByHour = new Map<number, number>();

  for (const r of hourly) {
    if (r.event_type === "visitor") {
      totalVisitors += r.count;
      const cur = (visitorByHour.get(r.hour) ?? 0) + r.count;
      visitorByHour.set(r.hour, cur);
      if (cur > peakCount) {
        peakCount = cur;
        peakHour = r.hour;
      }
    }
    if (r.event_type === "pasante") {
      totalPasantes += r.count;
    }
  }

  const conversionPct =
    totalPasantes > 0
      ? Math.round((totalVisitors / totalPasantes) * 1000) / 10
      : 0;

  return { totalVisitors, totalPasantes, conversionPct, peakHour };
}

export function VisitantesView({
  hourly,
  conversion,
  genderVisitor,
  loading,
  analyticsLoading,
  filters,
}: Props) {
  const kpis = computeKPIs(hourly);

  function handlePDF() {
    exportPDF({
      title: "Visitantes y Pasantes",
      subtitle: "Análisis de tráfico de visitantes y transeúntes",
      startTs: filters.startTs,
      endTs: filters.endTs,
      sections: [
        {
          title: "KPIs de Visitantes",
          rows: [
            ["Total visitantes", kpis.totalVisitors.toLocaleString()],
            ["Total pasantes", kpis.totalPasantes.toLocaleString()],
            ["Conversión (%)", `${kpis.conversionPct}%`],
            ["Hora pico visitantes", kpis.peakHour !== null ? `${kpis.peakHour}:00` : "—"],
          ] as [string, string][],
        },
        {
          title: "Distribución de género (visitantes)",
          rows: genderVisitor.map((g) => [g.gender, g.count.toLocaleString()] as [string, string]),
        },
      ],
    });
  }

  const hasConversion = conversion.some((r) => r.pasantes > 0);
  const [tab, setTab] = useState("resumen");

  return (
    <section className="px-4 md:px-6 py-5 space-y-5">
      {/* Header */}
      <PageHeader
        title="Visitantes y Pasantes"
        icon={<Users size={19} />}
        subtitle={
          <>
            Análisis de transeúntes y conversión — período:{" "}
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
              hourly={hourly}
              zones={[]}
              conversion={conversion}
              tiz={[]}
              startTs={filters.startTs}
              endTs={filters.endTs}
            />
          </>
        }
      />

      {/* 4 inline KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        <StatCard
          label="Total visitantes"
          value={loading ? "—" : kpis.totalVisitors.toLocaleString()}
          sub="con intención de ingreso"
          accent="#0D9488"
          Icon={Users}
          loading={loading}
        />
        <StatCard
          label="Total pasantes"
          value={loading ? "—" : kpis.totalPasantes.toLocaleString()}
          sub="transeúntes detectados"
          accent="#64748B"
          Icon={ArrowRight}
          loading={loading}
        />
        <StatCard
          label="Conversión"
          value={loading ? "—" : `${kpis.conversionPct}%`}
          sub="visitantes / pasantes"
          accent="#14B8A6"
          Icon={ArrowRight}
          loading={loading}
        />
        <StatCard
          label="Hora pico"
          value={loading || kpis.peakHour === null ? "—" : `${kpis.peakHour}:00`}
          sub="mayor flujo de visitantes"
          accent="#0B1222"
          Icon={Clock}
          loading={loading}
        />
      </div>

      <SectionTabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          {
            value: "resumen",
            label: "Flujo y género",
            icon: TrendingUp,
            content: (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 panel p-5">
                  <PanelTitle title="Flujo por hora" hint="Visitantes y pasantes detectados hora a hora" />
                  <VisitorFlowChart rows={hourly} loading={loading} />
                </div>
                <div className="panel p-5">
                  <PanelTitle title="Género visitantes" hint="Distribución de género entre visitantes" />
                  <GenderAgePanel gender={genderVisitor} age={[]} loading={analyticsLoading} />
                </div>
              </div>
            ),
          },
          ...(hasConversion
            ? [
                {
                  value: "conversion",
                  label: "Conversión",
                  icon: ArrowRight,
                  content: (
                    <div className="panel p-5">
                      <PanelTitle
                        title="Conversión Pasantes → Ingreso"
                        hint="% de transeúntes que ingresaron al local, por hora del día"
                      />
                      <ConversionChart rows={conversion} loading={loading} />
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </section>
  );
}
