"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";
import { CHART, AXIS_TICK, GRID_PROPS, TOOLTIP_STYLE, CHART_SKELETON_CLASS } from "@/lib/chartTheme";

type HourPoint = { hour: number; enter: number; visitor: number; pasante: number };

const HOUR_MIN = 7;
const HOUR_MAX = 23;

function buildData(rows: HourlyRow[]): HourPoint[] {
  const map = new Map<number, HourPoint>();
  for (const r of rows) {
    if (!["enter", "visitor", "pasante"].includes(r.event_type)) continue;
    if (r.hour < HOUR_MIN || r.hour > HOUR_MAX) continue;
    if (!map.has(r.hour)) map.set(r.hour, { hour: r.hour, enter: 0, visitor: 0, pasante: 0 });
    const cur = map.get(r.hour)!;
    (cur as Record<string, number>)[r.event_type] += r.count;
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

const LABELS: Record<string, string> = {
  enter: "Entradas", visitor: "Visitantes", pasante: "Pasantes",
};

export function CombinedTrafficChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <div className={"h-64 " + CHART_SKELETON_CLASS} />;

  const data = buildData(rows);
  const hasAny = data.some((d) => d.enter > 0 || d.visitor > 0 || d.pasante > 0);
  if (!hasAny)
    return <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos para el período seleccionado</div>;

  return (
    <ResponsiveContainer width="100%" height={270}>
      <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: -16 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="hour" tickFormatter={(h) => fmtHour(Number(h))} tick={AXIS_TICK} axisLine={false} tickLine={false} />

        {/* Eje izquierdo — escala de barras (entradas / salidas) */}
        <YAxis
          yAxisId="bars"
          orientation="left"
          tick={AXIS_TICK}
          axisLine={false} tickLine={false}
        />

        {/* Eje derecho — escala de líneas (visitantes / pasantes) */}
        <YAxis
          yAxisId="lines"
          orientation="right"
          tick={AXIS_TICK}
          axisLine={false} tickLine={false}
          width={40}
        />

        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(h) => fmtHour(Number(h))}
          formatter={(v, name) => [v, LABELS[name as string] ?? name]}
        />
        <Legend formatter={(v) => LABELS[v] ?? v} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

        {/* Barras — eje izquierdo */}
        <Bar yAxisId="bars" dataKey="enter" fill={CHART.brand} radius={[4, 4, 0, 0]} maxBarSize={18} />

        {/* Líneas — eje derecho (escala propia para no aplastar las barras) */}
        <Line yAxisId="lines" type="monotone" dataKey="visitor" stroke={CHART.sky} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: CHART.sky }} />
        <Line yAxisId="lines" type="monotone" dataKey="pasante" stroke={CHART.slate} strokeWidth={2}   dot={false} activeDot={{ r: 4, fill: CHART.slate }} strokeDasharray="5 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
