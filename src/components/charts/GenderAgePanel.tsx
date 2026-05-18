"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { GenderRow, AgeRow } from "@/lib/types";

interface Props {
  gender: GenderRow[];
  age: AgeRow[];
  loading: boolean;
  title?: string;
}

const GENDER_COLORS: Record<string, string> = {
  hombre: "#3b82f6",
  male: "#3b82f6",
  mujer: "#ec4899",
  female: "#ec4899",
};

const GENDER_LABELS: Record<string, string> = {
  hombre: "Hombre",
  male: "Hombre",
  mujer: "Mujer",
  female: "Mujer",
};

const DEFAULT_COLOR = "#94a3b8";

function labelGender(g: string): string {
  return GENDER_LABELS[g.toLowerCase()] ?? g;
}

function colorGender(g: string): string {
  return GENDER_COLORS[g.toLowerCase()] ?? DEFAULT_COLOR;
}

function CustomTooltipGender({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-700">{payload[0].name}</p>
      <p className="text-slate-500">{payload[0].value.toLocaleString()} registros</p>
    </div>
  );
}

export function GenderAgePanel({ gender, age, loading, title }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        {title && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>}
        <div className="animate-pulse bg-slate-100 rounded-xl h-36" />
        <div className="animate-pulse bg-slate-100 rounded-xl h-36" />
      </div>
    );
  }

  const totalGender = gender.reduce((s, r) => s + r.count, 0);
  const topAge = age.slice(0, 6);

  const pieData = gender.map((r) => ({
    name: labelGender(r.gender),
    value: r.count,
    fill: colorGender(r.gender),
  }));

  const barData = topAge.map((r) => ({ age: r.age, count: r.count }));

  return (
    <div className="space-y-5">
      {title && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>}

      {/* Gender donut */}
      {gender.length > 0 ? (
        <div>
          <p className="text-xs text-slate-500 mb-2">Género</p>
          <div className="flex items-center gap-3">
            <ResponsiveContainer width="55%" height={110}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={28}
                  outerRadius={48}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltipGender />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                  <span className="text-xs text-slate-600 flex-1">{d.name}</span>
                  <span className="text-xs font-semibold text-slate-800">
                    {totalGender > 0 ? Math.round((d.value / totalGender) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">Sin datos de género</p>
      )}

      {/* Age horizontal bars */}
      {barData.length > 0 ? (
        <div>
          <p className="text-xs text-slate-500 mb-2">Rango de edad</p>
          <ResponsiveContainer width="100%" height={Math.max(80, barData.length * 24)}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="age" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
              <Tooltip
                formatter={(v) => [(v as number).toLocaleString(), "Registros"]}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">Sin datos de edad</p>
      )}
    </div>
  );
}
