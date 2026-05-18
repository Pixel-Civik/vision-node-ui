"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { HourlyRow } from "@/lib/types";

const COLORS = { enter: "#10B981", exit: "#EF4444" };

function buildHourly(rows: HourlyRow[]) {
  const map = new Map<number, { hour: number; enter: number; exit: number }>();
  for (let h = 7; h <= 22; h++) map.set(h, { hour: h, enter: 0, exit: 0 });
  for (const r of rows) {
    if (r.event_type !== "enter" && r.event_type !== "exit") continue;
    const cur = map.get(r.hour) ?? { hour: r.hour, enter: 0, exit: 0 };
    cur[r.event_type] += r.count;
    map.set(r.hour, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

function SkeletonChart() {
  return (
    <div className="h-64 bg-gray-100 rounded-lg animate-pulse flex items-end gap-1 p-4">
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          className="bg-gray-200 rounded flex-1"
          style={{ height: `${30 + Math.random() * 60}%` }}
        />
      ))}
    </div>
  );
}

export function BehaviorChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <SkeletonChart />;

  const data = buildHourly(rows);
  const fmt = (h: number) => `${h}h`;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Picos de tráfico por hora (hora Lima). Las barras muestran entradas/salidas; la línea señala tendencia.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="hour" tickFormatter={fmt} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v, name) => [v, name === "enter" ? "Entradas" : "Salidas"]}
            labelFormatter={(h) => `Hora ${h}:00`}
          />
          <Legend formatter={(v) => (v === "enter" ? "Entradas" : "Salidas")} />
          <Bar dataKey="enter" fill={COLORS.enter} opacity={0.85} radius={[3, 3, 0, 0]} />
          <Bar dataKey="exit" fill={COLORS.exit} opacity={0.85} radius={[3, 3, 0, 0]} />
          <Line
            type="monotone"
            dataKey="enter"
            stroke={COLORS.enter}
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
