"use client";

import type { HourlyRow } from "@/lib/types";

const PERIODS = [
  { label: "Mañana",  range: "7 – 11h",  hours: [7, 8, 9, 10, 11],           color: "#3B82F6", bg: "#EFF6FF" },
  { label: "Tarde",   range: "12 – 17h", hours: [12, 13, 14, 15, 16, 17],     color: "#8B5CF6", bg: "#F5F3FF" },
  { label: "Noche",   range: "18 – 22h", hours: [18, 19, 20, 21, 22],         color: "#F59E0B", bg: "#FFFBEB" },
];

export function TrafficPeriodChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i}>
            <div className="flex justify-between mb-1.5">
              <div className="h-3 bg-slate-100 rounded w-24" />
              <div className="h-3 bg-slate-100 rounded w-8" />
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  const enters = rows.filter((r) => r.event_type === "enter");
  const total = enters.reduce((s, r) => s + r.count, 0);

  if (total === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">Sin datos de entradas</p>;
  }

  const periods = PERIODS.map((p) => {
    const count = enters
      .filter((r) => p.hours.includes(r.hour))
      .reduce((s, r) => s + r.count, 0);
    return { ...p, count, pct: Math.round((count / total) * 100) };
  });

  const peak = periods.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <div className="space-y-4">
      {periods.map((p) => (
        <div key={p.label}>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: p.bg, color: p.color }}
              >
                {p.label}
              </span>
              <span className="text-xs text-slate-400">{p.range}</span>
              {p.label === peak.label && (
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                  Pico
                </span>
              )}
            </div>
            <span className="text-sm font-bold" style={{ color: p.color }}>
              {p.pct}%
            </span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${p.pct}%`, backgroundColor: p.color }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {p.count.toLocaleString()} entradas
          </p>
        </div>
      ))}
    </div>
  );
}
