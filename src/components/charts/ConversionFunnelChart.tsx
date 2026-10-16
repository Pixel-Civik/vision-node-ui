"use client";

import type { HourlyRow } from "@/lib/types";

function sumByType(rows: HourlyRow[], type: string) {
  return rows.filter((r) => r.event_type === type).reduce((s, r) => s + r.count, 0);
}

export function ConversionFunnelChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <div className="h-44 bg-slate-50 rounded-xl animate-pulse" />;

  const pasantes  = sumByType(rows, "pasante");
  const visitors  = sumByType(rows, "visitor");
  const enters    = sumByType(rows, "enter");

  const base = pasantes || visitors || enters || 1;

  const steps = [
    {
      label: "Pasantes",
      value: pasantes,
      pct: 100,
      color: "#94A3B8",
      bg: "bg-slate-200",
      note: "Personas que pasaron frente al local",
    },
    {
      label: "Visitantes",
      value: visitors,
      pct: base > 0 ? +((visitors / base) * 100).toFixed(1) : 0,
      color: "#818CF8",
      bg: "bg-indigo-400",
      note: "Mostraron interés / se detuvieron",
    },
    {
      label: "Entradas",
      value: enters,
      pct: base > 0 ? +((enters / base) * 100).toFixed(1) : 0,
      color: "#2DD4BF",
      bg: "bg-teal-400",
      note: "Ingresaron efectivamente al local",
    },
  ];

  return (
    <div className="space-y-3 py-2">
      {steps.map(({ label, value, pct, bg, note }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">{label}</span>
            <div className="flex items-center gap-3">
              <span className="text-slate-500">{value.toLocaleString("es-PE")}</span>
              <span className="font-bold text-slate-800 w-12 text-right">{pct}%</span>
            </div>
          </div>
          <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
            <div
              className={`h-full ${bg} rounded-lg transition-all duration-500 flex items-center px-2`}
              style={{ width: `${Math.max(pct, 2)}%` }}
            >
              {pct >= 12 && (
                <span className="text-white text-[10px] font-semibold whitespace-nowrap">{label}</span>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-400">{note}</p>
        </div>
      ))}
      {pasantes > 0 && enters > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex gap-6 text-xs">
          <div>
            <span className="text-slate-500">Conv. pasante → entrada</span>
            <span className="ml-2 font-bold text-teal-600">{((enters / pasantes) * 100).toFixed(1)}%</span>
          </div>
          {visitors > 0 && (
            <div>
              <span className="text-slate-500">Conv. visitante → entrada</span>
              <span className="ml-2 font-bold text-indigo-600">{((enters / visitors) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
