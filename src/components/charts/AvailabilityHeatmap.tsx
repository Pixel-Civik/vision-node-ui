"use client";

import type { HourSlot } from "@/hooks/useUptime";

interface Props {
  slots: HourSlot[];
  loading?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${d} ${M[m - 1]}`;
}

export function AvailabilityHeatmap({ slots, loading }: Props) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-1">
            <div className="w-14 h-5 bg-slate-100 rounded" />
            {Array.from({ length: 24 }).map((_, j) => (
              <div key={j} className="flex-1 h-5 bg-slate-100 rounded-sm" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Group slots by date
  const byDate = new Map<string, Map<number, boolean | null>>();
  for (const s of slots) {
    if (!byDate.has(s.date)) byDate.set(s.date, new Map());
    byDate.get(s.date)!.set(s.hour, s.online);
  }

  const dates = [...byDate.keys()].sort();

  return (
    <div className="overflow-x-auto">
      {/* Hour headers */}
      <div className="flex gap-1 mb-1 ml-16">
        {HOURS.map((h) => (
          <div key={h} className="flex-1 text-center text-[9px] text-slate-400 min-w-[18px]">
            {h % 3 === 0 ? `${h}h` : ""}
          </div>
        ))}
      </div>

      <div className="space-y-0.5">
        {dates.map((date) => {
          const hourMap = byDate.get(date)!;
          return (
            <div key={date} className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 w-14 shrink-0 text-right pr-1.5">
                {fmtDate(date)}
              </span>
              {HOURS.map((h) => {
                const hasData = hourMap.get(h);
                const noData  = hourMap.size > 0 && hasData === false;
                const missing = !hourMap.has(h);
                return (
                  <div
                    key={h}
                    title={`${date} ${h}:00 — ${hasData ? "Online" : missing ? "Sin datos esperados" : "Sin señal"}`}
                    className={`flex-1 h-5 rounded-sm min-w-[18px] transition-colors ${
                      hasData  ? "bg-emerald-400" :
                      noData   ? "bg-red-400" :
                      "bg-slate-100"
                    }`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-emerald-400" /> Online
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-red-400" /> Sin señal
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-slate-100" /> Fuera de rango
        </div>
      </div>
    </div>
  );
}
