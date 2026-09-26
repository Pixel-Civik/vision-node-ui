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


interface Props {
  buckets: { label: string; count: number }[];
  loading: boolean;
}

const PURPLE_SHADES = ["#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6"];

export function TIZDistributionChart({ buckets, loading }: Props) {
  if (loading) {
    return <div className="animate-pulse bg-slate-100 rounded-xl h-56" />;
  }

  if (!buckets.some(bucket => bucket.count > 0)) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-400">
        Sin datos de permanencia para el período seleccionado.
      </div>
    );
  }

  const data = buckets.map((bucket, i) => ({ rango: bucket.label, cantidad: bucket.count, fill: PURPLE_SHADES[i] }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="rango" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
          formatter={(v) => [(v as number).toLocaleString(), "Visitas"]}
          labelFormatter={(l) => `Rango: ${l}`}
        />
        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
