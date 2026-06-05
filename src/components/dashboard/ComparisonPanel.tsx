"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Trophy } from "lucide-react";
import { useComparisonData, type CompareMode } from "@/hooks/useComparisonData";
import type { DashboardFilters, KPIResult, HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

// ── helpers ───────────────────────────────────────────────────────────────────

const MODE_LABELS: Record<CompareMode, string> = {
  "prev-day":    "Día anterior",
  "same-dow":    "Misma sem. ant.",
  "prev-period": "Período ant.",
};

const VS_LABELS: Record<CompareMode, string> = {
  "prev-day":    "vs ayer",
  "same-dow":    "vs mismo día sem. ant.",
  "prev-period": "vs período anterior",
};

function DeltaPill({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  const pos = value > 0;
  const zero = value === 0;
  const cls = zero
    ? "bg-slate-100 text-slate-500"
    : pos
    ? "bg-emerald-100 text-emerald-700"
    : "bg-red-100 text-red-600";
  const Icon = zero ? Minus : pos ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={10} />
      {pos && "+"}
      {value}
      {suffix}
    </span>
  );
}

function buildChartData(curHourly: HourlyRow[], refHourly: HourlyRow[]) {
  const map = new Map<number, { hour: number; actual: number; referencia: number }>();
  for (let h = 7; h <= 22; h++) map.set(h, { hour: h, actual: 0, referencia: 0 });
  for (const r of curHourly) {
    if (r.event_type !== "enter") continue;
    const e = map.get(r.hour) ?? { hour: r.hour, actual: 0, referencia: 0 };
    e.actual += r.count;
    map.set(r.hour, e);
  }
  for (const r of refHourly) {
    if (r.event_type !== "enter") continue;
    const e = map.get(r.hour) ?? { hour: r.hour, actual: 0, referencia: 0 };
    e.referencia += r.count;
    map.set(r.hour, e);
  }
  return Array.from(map.values()).sort((a, b) => a.hour - b.hour);
}

// ── sub-components ────────────────────────────────────────────────────────────

function KPICompareCard({
  label,
  current,
  delta,
  vsLabel,
  siteRank,
  showRank,
  loading,
}: {
  label:     string;
  current:   number;
  delta:     number | null;
  vsLabel:   string;
  siteRank:  { rank: number; total: number } | null;
  showRank:  boolean;
  loading:   boolean;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 overflow-hidden">
      {/* teal top bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#2DD4BF] rounded-t-2xl" />

      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>

      {loading ? (
        <div className="h-9 w-32 bg-slate-100 animate-pulse rounded-lg mb-3" />
      ) : (
        <p className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none mb-3">
          {current.toLocaleString("es-PE")}
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">{vsLabel}</span>
          {loading
            ? <div className="h-5 w-14 bg-slate-100 animate-pulse rounded-full" />
            : <DeltaPill value={delta} />}
        </div>
      </div>

      {/* ranking */}
      {showRank && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Trophy size={11} className="text-[#2DD4BF]" />
              Ranking entre tiendas
            </span>
            {loading || !siteRank ? (
              <div className="h-5 w-16 bg-slate-100 animate-pulse rounded-full" />
            ) : (
              <span className="text-xs font-bold text-slate-700">
                <span className="bg-[#0B1222] text-[#2DD4BF] text-xs font-bold px-2 py-0.5 rounded-lg mr-1">
                  #{siteRank.rank}
                </span>
                de {siteRank.total}
              </span>
            )}
          </div>
          {siteRank && !loading && (
            <>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2DD4BF] rounded-full"
                  style={{ width: `${Math.round(((siteRank.total - siteRank.rank + 1) / siteRank.total) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>#{ siteRank.total} peor</span>
                <span className="text-[#2DD4BF] font-semibold">#{siteRank.rank}</span>
                <span>#1 mejor</span>
              </div>
            </>
          )}
          {!siteRank && !loading && (
            <p className="text-[10px] text-slate-400">Sin datos de ranking</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface ComparisonPanelProps {
  filters:   DashboardFilters;
  kpis:      KPIResult | null;
  hourly:    HourlyRow[];
  allSites:  string[];
  loading:   boolean;
}

export function ComparisonPanel({
  filters, kpis, hourly, allSites, loading: parentLoading,
}: ComparisonPanelProps) {
  const [mode, setMode] = useState<CompareMode>("prev-day");

  const {
    refHourly, siteRank, loading: compLoading, deltas, curPasantes,
  } = useComparisonData(filters, mode, kpis, hourly, allSites);

  const loading = parentLoading || compLoading;

  const curEnters = kpis?.enters ?? 0;

  const chartData = useMemo(
    () => buildChartData(hourly, refHourly),
    [hourly, refHourly],
  );

  const vsLabel = VS_LABELS[mode];
  const showRank = allSites.length > 1;

  return (
    <div className="space-y-4">
      {/* ── Header + toggle ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Contexto comparativo</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Período actual {vsLabel}
          </p>
        </div>
        {/* REQ 1 toggle */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {(Object.keys(MODE_LABELS) as CompareMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                mode === m
                  ? "bg-[#0B1222] text-[#2DD4BF]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* ── REQ 2: KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICompareCard
          label="Pasantes"
          current={curPasantes}
          delta={deltas.pasantes}
          vsLabel={vsLabel}
          siteRank={siteRank}
          showRank={showRank}
          loading={loading}
        />
        <KPICompareCard
          label="Entradas"
          current={curEnters}
          delta={deltas.enters}
          vsLabel={vsLabel}
          siteRank={siteRank}
          showRank={showRank}
          loading={loading}
        />
      </div>

      {/* ── REQ 1: comparison chart ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h4 className="text-xs font-semibold text-slate-600 mb-0.5">
          Entradas por hora — período actual vs referencia
        </h4>
        <p className="text-[10px] text-slate-400 mb-4">
          Teal = actual · Gris = {vsLabel.replace("vs ", "")} · Rojo = hora inferior a la referencia
        </p>

        {loading ? (
          <div className="h-52 bg-slate-50 animate-pulse rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} barSize={12} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="hour"
                tickFormatter={(h) => fmtHour(Number(h))}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false} tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }}
                labelFormatter={(h) => fmtHour(Number(h))}
                formatter={(v, name) => [v, name === "actual" ? "Actual" : "Referencia"]}
              />
              <Legend
                formatter={(v) => v === "actual" ? "Actual" : "Referencia"}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              />
              {/* Reference bars (always slate) */}
              <Bar dataKey="referencia" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
              {/* Actual bars: teal when >= reference, red when below */}
              <Bar dataKey="actual" radius={[3, 3, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.actual < d.referencia && d.referencia > 0 ? "#FCA5A5" : "#2DD4BF"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
