"use client";

import type { HeatmapRow } from "@/lib/types";

const DOWS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

function cellColor(val: number, max: number): string {
  if (max === 0) return "#f9fafb";
  const ratio = val / max;
  if (ratio === 0) return "#f9fafb";
  if (ratio < 0.25) return "#d1fae5";
  if (ratio < 0.5) return "#6ee7b7";
  if (ratio < 0.75) return "#34d399";
  return "#10B981";
}

export function HeatmapChart({ rows, loading }: { rows: HeatmapRow[]; loading: boolean }) {
  if (loading) {
    return <div className="h-52 bg-gray-100 rounded-lg animate-pulse" />;
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
    <div className="space-y-2 overflow-x-auto">
      <p className="text-xs text-gray-500">
        Mapa de calor — intensidad de tráfico por hora y día de semana. Verde oscuro = más eventos.
      </p>
      <div className="min-w-max">
        <div className="flex gap-px ml-20">
          {HOURS.map((h) => (
            <div key={h} className="w-8 text-center text-[10px] text-gray-400">{h}h</div>
          ))}
        </div>
        <div className="flex flex-col gap-px mt-1">
          {DOWS.map((dow, di) => (
            <div key={dow} className="flex items-center gap-px">
              <div className="w-20 text-[10px] text-gray-500 text-right pr-2">{dow}</div>
              {HOURS.map((h) => {
                const val = map.get(`${di}-${h}`) ?? 0;
                return (
                  <div
                    key={h}
                    title={`${dow} ${h}h: ${val}`}
                    className="w-8 h-7 rounded-sm cursor-default transition-opacity hover:opacity-80"
                    style={{ backgroundColor: cellColor(val, maxVal) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
