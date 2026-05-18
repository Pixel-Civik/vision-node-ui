"use client";

import type {
  HourlyRow,
  ConversionHourRow,
  GenderRow,
  DashboardFilters,
} from "@/lib/types";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import { ExportDialog } from "@/components/export/ExportDialog";
import { GenderAgePanel } from "@/components/charts/GenderAgePanel";
import { VisitorFlowChart } from "@/components/charts/VisitorFlowChart";
import { exportPDF } from "@/lib/exportPDF";
import { FileText, Users, ArrowRight, Clock } from "lucide-react";

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

  return (
    <section className="px-4 md:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Visitantes y Pasantes</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Análisis de transeúntes y conversión — período:{" "}
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
            hourly={hourly}
            zones={[]}
            conversion={conversion}
            tiz={[]}
            startTs={filters.startTs}
            endTs={filters.endTs}
          />
        </div>
      </div>

      {/* 4 inline KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <InlineKPI
          label="Total visitantes"
          value={loading ? "—" : kpis.totalVisitors.toLocaleString()}
          sub="con intención de ingreso"
          borderColor="#3b82f6"
          Icon={Users}
          loading={loading}
        />
        <InlineKPI
          label="Total pasantes"
          value={loading ? "—" : kpis.totalPasantes.toLocaleString()}
          sub="transeúntes detectados"
          borderColor="#94a3b8"
          Icon={ArrowRight}
          loading={loading}
        />
        <InlineKPI
          label="Conversión"
          value={loading ? "—" : `${kpis.conversionPct}%`}
          sub="visitantes / pasantes"
          borderColor="#10b981"
          Icon={ArrowRight}
          loading={loading}
        />
        <InlineKPI
          label="Hora pico"
          value={loading || kpis.peakHour === null ? "—" : `${kpis.peakHour}:00`}
          sub="mayor flujo de visitantes"
          borderColor="#f59e0b"
          Icon={Clock}
          loading={loading}
        />
      </div>

      {/* Visitor flow + Gender */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Flujo por hora</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">Visitantes y pasantes detectados hora a hora</p>
          <VisitorFlowChart rows={hourly} loading={loading} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Género visitantes</h3>
          <p className="text-xs text-slate-400 mb-4">Distribución de género entre visitantes</p>
          <GenderAgePanel gender={genderVisitor} age={[]} loading={analyticsLoading} />
        </div>
      </div>

      {/* Conversion chart */}
      {hasConversion && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700">Conversión Pasantes → Ingreso</h3>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">
            % de transeúntes que ingresaron al local, por hora del día
          </p>
          <ConversionChart rows={conversion} loading={loading} />
        </div>
      )}
    </section>
  );
}
