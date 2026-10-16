"use client";

import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";
import { CHART, AXIS_TICK, GRID_PROPS, TOOLTIP_STYLE, CHART_SKELETON_CLASS } from "@/lib/chartTheme";

const FIXED_HEIGHTS = [42, 68, 55, 83, 60, 72, 85, 90, 65, 78, 88, 70, 52, 60, 45, 55];

function SkeletonChart() {
  return (
    <div className={`h-64 ${CHART_SKELETON_CLASS} flex items-end gap-[3px] px-4 pb-4 pt-6`}>
      {FIXED_HEIGHTS.map((h, i) => (
        <div key={i} className="bg-slate-200 rounded-t flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

const HOUR_MIN = 7;
const HOUR_MAX = 23;

function buildHourly(rows: HourlyRow[]) {
  const map = new Map<number, { hour: number; enter: number }>();
  for (let h = HOUR_MIN; h <= HOUR_MAX; h++) map.set(h, { hour: h, enter: 0 });
  for (const r of rows) {
    if (r.event_type !== "enter") continue;
    if (r.hour < HOUR_MIN || r.hour > HOUR_MAX) continue;
    const cur = map.get(r.hour)!;
    cur.enter += r.count;
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

export function BehaviorChart({ rows, loading }: { rows: HourlyRow[]; loading: boolean }) {
  if (loading) return <SkeletonChart />;

  const data = buildHourly(rows);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="enterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART.brandStrong} stopOpacity={0.15} />
            <stop offset="95%" stopColor={CHART.brandStrong} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h) => fmtHour(Number(h))}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v) => [v, "Entradas"]}
          labelFormatter={(h) => fmtHour(Number(h))}
        />
        <Legend
          formatter={() => "Entradas"}
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
        />
        <Bar dataKey="enter" fill={CHART.brand} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Area
          type="monotone"
          dataKey="enter"
          stroke={CHART.brandStrong}
          strokeWidth={2.5}
          fill="url(#enterGrad)"
          dot={false}
          activeDot={{ r: 5, fill: CHART.brandStrong }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
