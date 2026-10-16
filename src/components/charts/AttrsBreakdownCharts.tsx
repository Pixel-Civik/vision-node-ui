"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import type { AttrsBreakdown } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";
import { CHART, AXIS_TICK, GRID_PROPS, TOOLTIP_STYLE, CHART_SKELETON_CLASS } from "@/lib/chartTheme";

// ── Colores / etiquetas ───────────────────────────────────────────────────────

const AGE_SERIES = [
  { key: "nino",   label: "Niños",        color: CHART.amber },
  { key: "adulto", label: "Adultos",      color: CHART.brandStrong },
  { key: "none",   label: "Sin etiqueta", color: CHART.slateSoft },
] as const;

const GENDER_SERIES = [
  { key: "hombre", label: "Hombres",      color: CHART.sky },
  { key: "mujer",  label: "Mujeres",      color: CHART.rose },
  { key: "none",   label: "Sin etiqueta", color: CHART.slateSoft },
] as const;

type Totals = Record<"nino" | "adulto" | "hombre" | "mujer" | "noAge" | "noGender" | "all", number>;

export function sumTotals(data: AttrsBreakdown | null): Totals {
  const t: Totals = { nino: 0, adulto: 0, hombre: 0, mujer: 0, noAge: 0, noGender: 0, all: 0 };
  for (const r of data?.rows ?? []) {
    t.all += r.count;
    if (r.age === "nino") t.nino += r.count;
    else if (r.age === "adulto") t.adulto += r.count;
    else t.noAge += r.count;
    if (r.gender === "hombre") t.hombre += r.count;
    else if (r.gender === "mujer") t.mujer += r.count;
    else t.noGender += r.count;
  }
  return t;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const fmtN = (n: number) => n.toLocaleString("es-PE");

// ── Serie temporal niño / adulto / sin etiqueta ───────────────────────────────

interface BucketPoint { bucket: string; nino: number; adulto: number; none: number }

function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function buildAgeSeries(
  data: AttrsBreakdown,
  range: { startDate: string; endDate: string; hourMin: number; hourMax: number; dows: number[] },
): BucketPoint[] {
  const map = new Map<string, BucketPoint>();
  if (data.granularity === "hour") {
    for (let h = Math.max(7, range.hourMin); h <= Math.min(23, range.hourMax); h++) {
      const b = String(h).padStart(2, "0");
      map.set(b, { bucket: b, nino: 0, adulto: 0, none: 0 });
    }
  } else {
    for (const day of eachDay(range.startDate, range.endDate)) {
      const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0=Lun
      if (range.dows.includes(dow)) map.set(day, { bucket: day, nino: 0, adulto: 0, none: 0 });
    }
  }
  for (const r of data.rows) {
    const cur = map.get(r.bucket) ?? { bucket: r.bucket, nino: 0, adulto: 0, none: 0 };
    if (r.age === "nino") cur.nino += r.count;
    else if (r.age === "adulto") cur.adulto += r.count;
    else cur.none += r.count;
    map.set(r.bucket, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export function AgeTimeSeriesChart({ points, granularity, loading }: {
  points: BucketPoint[];
  granularity: "hour" | "day";
  loading: boolean;
}) {
  if (loading) return <div className={`h-64 ${CHART_SKELETON_CLASS}`} />;
  const fmtX = (b: string) => (granularity === "hour" ? fmtHour(Number(b)) : fmtDay(b));
  const interval = granularity === "day" ? Math.max(0, Math.floor(points.length / 8) - 1) : 0;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis
          dataKey="bucket"
          tickFormatter={fmtX}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          interval={interval}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(b) => fmtX(String(b))}
          formatter={(v, name) => [fmtN(Number(v)), name]}
          cursor={{ fill: "rgba(148,163,184,0.12)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {AGE_SERIES.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="age"
            fill={s.color}
            maxBarSize={26}
            radius={i === AGE_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Dona genérica (niños vs adultos / hombre vs mujer) ────────────────────────

function Donut({ slices, size }: {
  slices: { name: string; value: number; color: string }[];
  size: "lg" | "sm";
}) {
  const h = size === "lg" ? 170 : 110;
  const [inner, outer] = size === "lg" ? [46, 74] : [28, 48];
  return (
    <ResponsiveContainer width="100%" height={h}>
      <PieChart>
        <Pie
          data={slices.filter((s) => s.value > 0)}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={inner}
          outerRadius={outer}
          strokeWidth={2}
          stroke="#fff"
        >
          {slices.filter((s) => s.value > 0).map((s) => <Cell key={s.name} fill={s.color} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [fmtN(Number(v)), name]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function LegendRows({ slices, total }: {
  slices: { name: string; value: number; color: string }[];
  total: number;
}) {
  return (
    <div className="space-y-1.5">
      {slices.map((s) => (
        <div key={s.name} className="flex items-center gap-2 text-xs">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
          <span className="flex-1 text-slate-600">{s.name}</span>
          <span className="tabular-nums text-slate-400">{fmtN(s.value)}</span>
          <span className="w-9 text-right font-semibold tabular-nums text-slate-800">{pct(s.value, total)}%</span>
        </div>
      ))}
    </div>
  );
}

/** Niños vs adultos: dona + conteos + proporción entre las entradas etiquetadas. */
export function AgeShare({ totals, loading }: { totals: Totals; loading: boolean }) {
  if (loading) return <div className={`h-64 ${CHART_SKELETON_CLASS}`} />;
  const slices = AGE_SERIES.map((s) => ({
    name: s.label,
    color: s.color,
    value: s.key === "nino" ? totals.nino : s.key === "adulto" ? totals.adulto : totals.noAge,
  }));
  const labeled = totals.nino + totals.adulto;
  return (
    <div className="space-y-3">
      <Donut slices={slices} size="lg" />
      <LegendRows slices={slices} total={totals.all} />
      <p className="border-t border-slate-100 pt-2.5 text-xs text-slate-500">
        {labeled > 0 ? (
          <>
            Entre las <span className="font-semibold text-slate-700">{fmtN(labeled)}</span> entradas con edad:{" "}
            <span className="font-semibold text-slate-800">{pct(totals.nino, labeled)}% niños</span>
            {" · "}
            <span className="font-semibold text-slate-800">{pct(totals.adulto, labeled)}% adultos</span>
          </>
        ) : (
          "Ninguna entrada del período trae edad etiquetada."
        )}
      </p>
    </div>
  );
}

/** Hombre vs mujer: versión compacta, secundaria. */
export function GenderShare({ totals, loading }: { totals: Totals; loading: boolean }) {
  if (loading) return <div className={`h-40 ${CHART_SKELETON_CLASS}`} />;
  const slices = GENDER_SERIES.map((s) => ({
    name: s.label,
    color: s.color,
    value: s.key === "hombre" ? totals.hombre : s.key === "mujer" ? totals.mujer : totals.noGender,
  }));
  const labeled = totals.hombre + totals.mujer;
  return (
    <div className="flex items-center gap-4">
      <div className="w-28 shrink-0">
        <Donut slices={slices} size="sm" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <LegendRows slices={slices} total={totals.all} />
        <p className="text-[11px] text-slate-400">
          {labeled > 0
            ? `Entre las ${fmtN(labeled)} con género: ${pct(totals.hombre, labeled)}% hombres · ${pct(totals.mujer, labeled)}% mujeres`
            : "Ninguna entrada trae género etiquetado."}
        </p>
      </div>
    </div>
  );
}
