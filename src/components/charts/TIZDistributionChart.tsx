"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TIZDistribution } from "@/lib/types";
import { CATEGORICAL, AXIS_TICK, GRID_PROPS, TOOLTIP_STYLE, CHART_SKELETON_CLASS } from "@/lib/chartTheme";

interface Props {
  buckets: TIZDistribution["buckets"];
  loading: boolean;
}

export function TIZDistributionChart({ buckets, loading }: Props) {
  if (loading) {
    return <div className={`h-56 ${CHART_SKELETON_CLASS}`} />;
  }

  if (buckets.length === 0 || buckets.every((bucket) => bucket.count === 0)) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-400">
        Sin datos de permanencia para el período seleccionado.
      </div>
    );
  }

  const chartData = buckets.map((bucket, index) => ({
    rango: bucket.label,
    cantidad: bucket.count,
    fill: CATEGORICAL[index] ?? CATEGORICAL.at(-1),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID_PROPS} vertical={false} />
        <XAxis dataKey="rango" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v) => [(v as number).toLocaleString(), "Visitas"]}
          labelFormatter={(l) => `Rango: ${l}`}
        />
        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
