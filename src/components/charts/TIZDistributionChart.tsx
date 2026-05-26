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
import type { TIZRaw } from "@/lib/types";

interface Props {
  tizRaw: TIZRaw[];
  loading: boolean;
}

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "<30s",    min: 0,   max: 30 },
  { label: "30-60s",  min: 30,  max: 60 },
  { label: "1-2min",  min: 60,  max: 120 },
  { label: "2-5min",  min: 120, max: 300 },
  { label: "5-10min", min: 300, max: 600 },
  { label: ">10min",  min: 600, max: Infinity },
];

const PURPLE_SHADES = ["#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6"];

interface BucketPoint {
  rango: string;
  cantidad: number;
  fill: string;
}

function buildBuckets(rows: TIZRaw[]): BucketPoint[] {
  const counts = new Array(BUCKETS.length).fill(0) as number[];
  for (const r of rows) {
    const d = r.dwell_sec;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (d >= BUCKETS[i].min && d < BUCKETS[i].max) {
        counts[i]++;
        break;
      }
    }
  }
  return BUCKETS.map((b, i) => ({
    rango: b.label,
    cantidad: counts[i],
    fill: PURPLE_SHADES[i],
  }));
}

export function TIZDistributionChart({ tizRaw, loading }: Props) {
  if (loading) {
    return <div className="animate-pulse bg-slate-100 rounded-xl h-56" />;
  }

  if (tizRaw.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-400">
        Sin datos de permanencia para el período seleccionado.
      </div>
    );
  }

  const data = buildBuckets(tizRaw);

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
