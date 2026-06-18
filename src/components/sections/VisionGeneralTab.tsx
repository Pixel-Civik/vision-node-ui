/**
 * VisionGeneralTab — "Visión general" tab content for Reporte.
 * SRP: composes chart rows; no data fetching, no filter logic.
 * Charts below the fold are wrapped in LazyChart to avoid
 * burst ResizeObserver callbacks on section visibility change.
 */
"use client";

import { LazyChart } from "@/components/ui/LazyChart";
import { CombinedTrafficChart } from "@/components/charts/CombinedTrafficChart";
import { OpportunityChart } from "@/components/charts/OpportunityChart";
import { DOWChart } from "@/components/charts/DOWChart";
import { HeatmapChart } from "@/components/dashboard/HeatmapChart";
import { ConversionChart } from "@/components/dashboard/ConversionChart";
import type { HourlyRow, HeatmapRow, ConversionHourRow, KPIResult } from "@/lib/types";

interface VisionGeneralTabProps {
  hourly: HourlyRow[];
  hourlyAvg: HourlyRow[];
  heatmap: HeatmapRow[];
  conversion: ConversionHourRow[];
  loading: boolean;
  kpis?: KPIResult | null;
}

/** Reusable card wrapper for chart sections */
function ChartCard({ id, title, subtitle, children }: {
  id?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="text-xs text-slate-400 mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

export function VisionGeneralTab({ hourly, hourlyAvg, heatmap, conversion, loading, kpis }: VisionGeneralTabProps) {
  const isMultiDay = (kpis?.days ?? 1) > 1;
  const trafficSubtitle = isMultiDay
    ? `Promedio por día · Barras: Entradas (verde) · Líneas: Visitantes (indigo) / Pasantes (gris)`
    : "Barras: Entradas (verde) · Líneas: Visitantes (indigo) / Pasantes (gris)";

  return (
    <div className="space-y-5">
      {/* Row 1: Combined traffic — data from server-averaged RPC */}
      <ChartCard
        id="export-chart-combined"
        title="Tráfico combinado por hora"
        subtitle={trafficSubtitle}
      >
        <CombinedTrafficChart rows={hourlyAvg.length > 0 ? hourlyAvg : hourly} loading={loading} />
      </ChartCard>

      {/* Row 2: Heatmap — fila completa */}
      <ChartCard id="export-chart-heatmap" title="Mapa de calor hora × día" subtitle="Concentración de tráfico — azul oscuro = mayor actividad">
        <LazyChart height={220}><HeatmapChart rows={heatmap} loading={loading} /></LazyChart>
      </ChartCard>

      {/* Últimas 3 gráficas — cuadrícula 2×2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard id="export-chart-conversion" title="Conversión por hora" subtitle="% de pasantes que ingresaron al local, hora a hora">
          <LazyChart height={200}><ConversionChart rows={conversion} loading={loading} /></LazyChart>
        </ChartCard>

        <ChartCard
          id="export-chart-dow"
          title="Tráfico por día de semana"
          subtitle="¿Qué día concentra más eventos? · El día destacado en teal es el de mayor volumen"
        >
          <LazyChart height={200}><DOWChart rows={heatmap} loading={loading} /></LazyChart>
        </ChartCard>

        <ChartCard
          id="export-chart-opportunity"
          title="Zona de oportunidad de captación"
          subtitle="Horas con alto tráfico de pasantes y baja conversión — mayor potencial de captación"
        >
          <LazyChart height={200}><OpportunityChart rows={conversion} loading={loading} /></LazyChart>
        </ChartCard>
      </div>
    </div>
  );
}
