"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import type { ConversionHourRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

export function OpportunityChart({
  rows,
  loading,
}: {
  rows: ConversionHourRow[];
  loading: boolean;
}) {
  if (loading) return <div className="h-52 bg-slate-50 rounded-xl animate-pulse" />;
  if (!rows.length)
    return <p className="text-xs text-slate-400 text-center py-10">Sin datos de conversión.</p>;

  const avgPas = rows.reduce((s, r) => s + r.pasantes, 0) / rows.length;
  const avgConv = rows.reduce((s, r) => s + r.conv_enter_pct, 0) / rows.length;

  // Opportunity = high pasantes + low conversion
  const data = rows.map((r) => ({
    ...r,
    opportunity: r.pasantes > avgPas && r.conv_enter_pct < avgConv,
  }));

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 leading-relaxed">
        <span className="inline-block w-3 h-3 rounded-sm bg-amber-400 mr-1 align-middle" />
        Barras <strong>naranjas</strong> = horas con alto tráfico de pasantes pero baja conversión —{" "}
        <strong>zona de oportunidad para captación</strong>.
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 32, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => fmtHour(Number(h))}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="pas"
            orientation="left"
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="conv"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
          />
          <ReferenceLine yAxisId="pas"  y={avgPas}  stroke="#94A3B8" strokeDasharray="4 2" strokeOpacity={0.5} />
          <ReferenceLine yAxisId="conv" y={avgConv} stroke="#94A3B8" strokeDasharray="4 2" strokeOpacity={0.5} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 12 }}
            labelFormatter={(h) => fmtHour(Number(h))}
            formatter={(v, name) => {
              if (name === "pasantes") return [v, "Pasantes"];
              if (name === "conv_enter_pct") return [`${v}%`, "Conversión"];
              return [v, name];
            }}
          />
          <Bar yAxisId="pas" dataKey="pasantes" radius={[4, 4, 0, 0]} maxBarSize={22}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.opportunity ? "#F59E0B" : "#CBD5E1"} />
            ))}
          </Bar>
          <Line
            yAxisId="conv"
            type="monotone"
            dataKey="conv_enter_pct"
            stroke="#2DD4BF"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: "#2DD4BF" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-slate-400">
        Líneas punteadas = promedios del período · Conv. promedio: {avgConv.toFixed(1)}%
      </p>
    </div>
  );
}
