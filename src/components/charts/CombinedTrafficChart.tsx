"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

type HourPoint = { hour: number; enter: number; exit: number; visitor: number; pasante: number };

function buildData(rows: HourlyRow[]): HourPoint[] {
  const map = new Map<number, HourPoint>();
  for (let h = 7; h <= 22; h++)
    map.set(h, { hour: h, enter: 0, exit: 0, visitor: 0, pasante: 0 });
  for (const r of rows) {
    if (!["enter", "exit", "visitor", "pasante"].includes(r.event_type)) continue;
    const cur = map.get(r.hour)!;
    (cur as Record<string, number>)[r.event_type] += r.count;
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

const LABELS: Record<string, string> = {
  enter: "Entradas", exit: "Salidas", visitor: "Visitantes", pasante: "Pasantes",
};

export function CombinedTrafficChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <div className="h-64 bg-slate-50 rounded-xl animate-pulse" />;

  const data = buildData(rows);
  const hasAny = data.some((d) => d.enter > 0 || d.exit > 0 || d.visitor > 0 || d.pasante > 0);
  if (!hasAny)
    return <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Sin datos para el período seleccionado</div>;

  return (
    <ResponsiveContainer width="100%" height={270}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="hour" tickFormatter={(h) => fmtHour(Number(h))} tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
          labelFormatter={(h) => fmtHour(Number(h))}
          formatter={(v, name) => [v, LABELS[name as string] ?? name]}
        />
        <Legend formatter={(v) => LABELS[v] ?? v} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

        {/* Bars: primary volume metrics */}
        <Bar dataKey="enter"   fill="#34D399" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="exit"    fill="#F87171" radius={[4, 4, 0, 0]} maxBarSize={18} />

        {/* Lines: contextual / secondary */}
        <Line type="monotone" dataKey="visitor" stroke="#818CF8" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#818CF8" }} strokeDasharray="0" />
        <Line type="monotone" dataKey="pasante" stroke="#94A3B8" strokeWidth={2}   dot={false} activeDot={{ r: 4, fill: "#94A3B8" }} strokeDasharray="5 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
