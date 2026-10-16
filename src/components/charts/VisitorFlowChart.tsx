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
    return <div className="animate-pulse bg-slate-100 rounded-xl h-56" />;
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
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="gradPasante" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="hora" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v, name) => [(v as number).toLocaleString(), name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area
          type="monotone"
          dataKey="Pasantes"
          stroke="#94a3b8"
          strokeWidth={1.5}
          fill="url(#gradPasante)"
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="Visitantes"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#gradVisitor)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
