"use client";

import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

const FIXED_HEIGHTS = [42, 68, 55, 83, 60, 72, 85, 90, 65, 78, 88, 70, 52, 60, 45, 55];

function SkeletonChart() {
  return (
    <div className="h-64 bg-slate-50 rounded-xl animate-pulse flex items-end gap-[3px] px-4 pb-4 pt-6">
      {FIXED_HEIGHTS.map((h, i) => (
        <div key={i} className="bg-slate-200 rounded-t flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

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

export function BehaviorChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <SkeletonChart />;

  const data = buildHourly(rows);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="enterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h) => fmtHour(Number(h))}
          tick={{ fontSize: 11, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
          formatter={(v, name) => [v, name === "enter" ? "Entradas" : "Salidas"]}
          labelFormatter={(h) => fmtHour(Number(h))}
        />
        <Legend
          formatter={(v) => (v === "enter" ? "Entradas" : "Salidas")}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar dataKey="exit" fill="#FCA5A5" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="enter" fill="#6EE7B7" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Area
          type="monotone"
          dataKey="enter"
          stroke="#059669"
          strokeWidth={2.5}
          fill="url(#enterGrad)"
          dot={false}
          activeDot={{ r: 5, fill: "#059669" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
