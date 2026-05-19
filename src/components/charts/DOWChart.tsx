"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import type { HeatmapRow } from "@/lib/types";

const DOWS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function DOWChart({ rows, loading }: { rows: HeatmapRow[]; loading: boolean }) {
  if (loading) return <div className="h-48 bg-slate-50 rounded-xl animate-pulse" />;

  const map = new Map<number, number>();
  for (const r of rows) map.set(r.dow, (map.get(r.dow) ?? 0) + r.count);
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  const data = DOWS.map((name, i) => {
    const value = map.get(i) ?? 0;
    return { name, value, pct: total > 0 ? +((value / total) * 100).toFixed(1) : 0 };
  });

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
          formatter={(v) => [v, "Eventos"]}
        />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value === max ? "#2DD4BF" : "#CBD5E1"} />
          ))}
          <LabelList
            dataKey="pct"
            position="top"
            formatter={(v: unknown) => typeof v === "number" && v > 0 ? `${v}%` : ""}
            style={{ fontSize: 10, fill: "#64748B", fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
