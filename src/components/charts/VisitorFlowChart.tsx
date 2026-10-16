"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { HourlyRow } from "@/lib/types";
import { CHART, AXIS_TICK, GRID_PROPS, TOOLTIP_STYLE, CHART_SKELETON_CLASS } from "@/lib/chartTheme";

interface Props {
  rows: HourlyRow[];
  loading: boolean;
}

interface ChartPoint {
  hora: string;
  Visitantes: number;
  Pasantes: number;
}

function buildData(rows: HourlyRow[]): ChartPoint[] {
  const map = new Map<number, { visitors: number; pasantes: number }>();

  for (const r of rows) {
    if (r.event_type !== "visitor" && r.event_type !== "pasante") continue;
    const cur = map.get(r.hour) ?? { visitors: 0, pasantes: 0 };
    if (r.event_type === "visitor") cur.visitors += r.count;
    if (r.event_type === "pasante") cur.pasantes += r.count;
    map.set(r.hour, cur);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, d]) => ({
      hora: `${hour}h`,
      Visitantes: d.visitors,
      Pasantes: d.pasantes,
    }));
}

export function VisitorFlowChart({ rows, loading }: Props) {
  if (loading) {
    return <div className={"h-56 " + CHART_SKELETON_CLASS} />;
  }

  const data = buildData(rows);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-400">
        Sin datos de visitantes o pasantes para el período seleccionado.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradVisitor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART.sky} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART.sky} stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="gradPasante" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART.slate} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART.slate} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="hora" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, name) => [(v as number).toLocaleString(), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="Pasantes"
          stroke={CHART.slate}
          strokeWidth={1.5}
          fill="url(#gradPasante)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="Visitantes"
          stroke={CHART.sky}
          strokeWidth={2}
          fill="url(#gradVisitor)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
