"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ConversionHourRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

function SkeletonChart() {
  return <div className="h-72 bg-gray-100 rounded-lg animate-pulse" />;
}

export function ConversionChart({
  rows,
  loading,
}: {
  rows: ConversionHourRow[];
  loading: boolean;
}) {
  if (loading) return <SkeletonChart />;
  const visibleRows = rows.filter((r) => r.hour >= 7 && r.hour <= 23);
  if (!visibleRows.length)
    return (
      <p className="text-sm text-gray-400 py-8 text-center">
        Sin datos de conversión.
      </p>
    );

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        <strong>Tasa de conversión por hora</strong> — % de pasantes que
        ingresan al local.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={visibleRows}
          margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="hour"
            tickFormatter={(h) => fmtHour(Number(h))}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="pasantes"
            orientation="left"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="conv"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            formatter={(v, name) => {
              if (name === "pasantes") return [`${v}`, "Pasantes/día"];
              if (name === "conv_enter_pct") return [`${v}%`, "Conversión"];
              return [v, name];
            }}
            labelFormatter={(h) => fmtHour(Number(h))}
          />
          <Legend
            formatter={(v) =>
              v === "pasantes"
                ? "Pasantes"
                : v === "conv_enter_pct"
                  ? "Conversión (%)"
                  : v
            }
          />
          <ReferenceLine
            yAxisId="conv"
            y={20}
            stroke="#EF4444"
            strokeDasharray="4 2"
            strokeOpacity={0.4}
          />
          <ReferenceLine
            yAxisId="conv"
            y={40}
            stroke="#F59E0B"
            strokeDasharray="4 2"
            strokeOpacity={0.4}
          />
          <Bar
            yAxisId="pasantes"
            dataKey="pasantes"
            fill="#9CA3AF"
            opacity={0.3}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="conv"
            type="monotone"
            dataKey="conv_enter_pct"
            stroke="#10B981"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#10B981" }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400">
        Línea roja punteada = 20% (zona baja) · Línea naranja = 40% (zona media)
      </p>
    </div>
  );
}
