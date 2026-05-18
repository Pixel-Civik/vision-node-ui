"use client";

import type { HeatmapRow } from "@/lib/types";

const DOWS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

function cellColor(val: number, max: number): string {
  if (max === 0 || val === 0) return "#F8FAFC";
  const r = val / max;
  if (r < 0.15) return "#DBEAFE";
  if (r < 0.35) return "#93C5FD";
  if (r < 0.55) return "#60A5FA";
  if (r < 0.75) return "#3B82F6";
  return "#1D4ED8";
}

function cellTextColor(val: number, max: number): string {
  if (max === 0 || val === 0) return "transparent";
  return val / max >= 0.55 ? "#FFFFFF" : "#1E40AF";
}

export function HeatmapChart({ rows, loading }: { rows: HeatmapRow[]; loading: boolean }) {
  if (loading) {
    return <div className="h-52 bg-slate-50 rounded-xl animate-pulse" />;
  }

  const map = new Map<string, number>();
  let maxVal = 0;
  for (const r of rows) {
    const key = `${r.dow}-${r.hour}`;
    const cur = (map.get(key) ?? 0) + r.count;
    map.set(key, cur);
    if (cur > maxVal) maxVal = cur;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Intensidad de tráfico por hora y día. Azul oscuro = mayor concentración de eventos.
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Hour headers */}
          <div className="flex gap-px ml-10 mb-1">
            {HOURS.map((h) => (
              <div key={h} className="w-9 text-center text-[10px] text-slate-400 font-medium">
                {h}h
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex flex-col gap-px">
            {DOWS.map((dow, di) => (
              <div key={dow} className="flex items-center gap-px">
                <div className="w-10 text-[10px] text-slate-500 font-medium pr-1 text-right">
                  {dow}
                </div>
                {HOURS.map((h) => {
                  const val = map.get(`${di}-${h}`) ?? 0;
                  return (
                    <div
                      key={h}
                      title={`${dow} ${h}h: ${val} eventos`}
                      className="w-9 h-7 rounded flex items-center justify-center cursor-default transition-opacity hover:opacity-75"
                      style={{ backgroundColor: cellColor(val, maxVal) }}
                    >
                      {val > 0 && (
                        <span
                          className="text-[9px] font-semibold leading-none"
                          style={{ color: cellTextColor(val, maxVal) }}
                        >
                          {val > 999 ? `${(val / 1000).toFixed(1)}k` : val}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1.5 mt-3 ml-10">
            <span className="text-[10px] text-slate-400">Menor</span>
            {["#DBEAFE", "#93C5FD", "#60A5FA", "#3B82F6", "#1D4ED8"].map((c) => (
              <div key={c} className="w-6 h-3 rounded-sm" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[10px] text-slate-400">Mayor</span>
          </div>
        </div>
      </div>
    </div>
  );
}
