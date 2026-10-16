"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import type { HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

function buildNet(rows: HourlyRow[]) {
  const map = new Map<number, { enters: number; exits: number }>();
  for (let h = 7; h <= 22; h++) map.set(h, { enters: 0, exits: 0 });
  for (const r of rows) {
    if (r.event_type !== "enter" && r.event_type !== "exit") continue;
    const cur = map.get(r.hour) ?? { enters: 0, exits: 0 };
    if (r.event_type === "enter") cur.enters += r.count;
    else cur.exits += r.count;
    map.set(r.hour, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, d]) => ({ hour, net: d.enters - d.exits, enters: d.enters, exits: d.exits }));
}

export function NetFlowChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <div className="h-48 bg-slate-50 rounded-xl animate-pulse" />;

  const data = buildNet(rows);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h) => fmtHour(Number(h))}
          tick={{ fontSize: 11, fill: "#94A3B8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <ReferenceLine y={0} stroke="#CBD5E1" strokeWidth={1.5} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
          formatter={(v, name) => [
            v,
            name === "net" ? "Flujo neto (Ent − Sal)" : name,
          ]}
          labelFormatter={(h) => fmtHour(Number(h))}
        />
        <Bar dataKey="net" maxBarSize={22} radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.net >= 0 ? "#34D399" : "#F87171"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
