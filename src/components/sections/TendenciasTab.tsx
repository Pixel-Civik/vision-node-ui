"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ComposedChart, BarChart, LineChart, AreaChart,
  Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Trophy, AlertTriangle, Calendar } from "lucide-react";
import { useTrendData } from "@/hooks/useTrendData";
import { useComparisonData, type CompareMode } from "@/hooks/useComparisonData";
import { fetchKPIs, fetchHourly } from "@/lib/api";
import { DatePicker, type DateMode } from "@/components/filters/DatePicker";
import type { DashboardFilters, KPIResult, HourlyRow } from "@/lib/types";
import { fmtHour } from "@/lib/fmt";

// ── date helpers ──────────────────────────────────────────────────────────────

function limaToUtc(date: string, h: number, m: number, s: number): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 5, m, s)).toISOString();
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function nDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
function firstOfThisMonth(): string {
  return isoToday().slice(0, 7) + "-01";
}
function prevMonthRange(): { start: string; end: string } {
  const now  = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const mon  = now.getMonth() === 0 ? 12 : now.getMonth();
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: `${year}-${String(mon).padStart(2, "0")}-01`,
    end:   last.toISOString().slice(0, 10),
  };
}

// ── local KPI fetch ───────────────────────────────────────────────────────────

function useLocalKPIs(filters: DashboardFilters) {
  const [kpis,   setKpis]   = useState<KPIResult | null>(null);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchKPIs(filters), fetchHourly(filters)])
      .then(([k, h]) => {
        if (!cancelled) { setKpis(k); setHourly(h); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startTs, filters.endTs]);

  return { kpis, hourly, loading };
}

// ── chart helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function xInterval(len: number): number {
  return Math.max(0, Math.floor(len / 7) - 1);
}
function ChartCard({ title, subtitle, children }: {
  title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <p className="text-xs text-slate-400 mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}
function Skeleton({ h = 200 }: { h?: number }) {
  return <div className="bg-slate-50 animate-pulse rounded-xl" style={{ height: h }} />;
}

// ── delta pill ────────────────────────────────────────────────────────────────

function DeltaPill({ value, suffix = "%" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  const pos  = value > 0;
  const zero = value === 0;
  const cls  = zero
    ? "bg-slate-100 text-slate-500"
    : pos ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600";
  const Icon = zero ? Minus : pos ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={10} />
      {pos && "+"}
      {value}{suffix}
    </span>
  );
}

// ── KPI card (REQ 2 del mockup) ───────────────────────────────────────────────

const MODE_LABELS: Record<CompareMode, string> = {
  "prev-day":    "vs día anterior",
  "same-dow":    "vs mismo día sem. ant.",
  "prev-period": "vs período anterior",
};

function KPICompareCard({
  label, current, delta, vsLabel, siteRank, showRank, loading,
}: {
  label: string; current: number; delta: number | null; vsLabel: string;
  siteRank: { rank: number; total: number } | null; showRank: boolean; loading: boolean;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-100 shadow-sm p-5 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-1 bg-[#2DD4BF] rounded-t-2xl" />
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
      {loading ? (
        <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-lg mb-3" />
      ) : (
        <p className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none mb-3">
          {current.toLocaleString("es-PE")}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{vsLabel}</span>
        {loading
          ? <div className="h-5 w-14 bg-slate-100 animate-pulse rounded-full" />
          : <DeltaPill value={delta} />}
      </div>
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
                <span>#{siteRank.total} peor</span>
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

// ── Trend charts ──────────────────────────────────────────────────────────────

function TendenciaChart({ daily, loading }: {
  daily: ReturnType<typeof useTrendData>["daily"]; loading: boolean;
}) {
  if (loading) return <Skeleton h={220} />;
  if (daily.length === 0)
    return <p className="text-sm text-slate-400 py-10 text-center">Sin datos para el período seleccionado</p>;
  const maxE = Math.max(...daily.map((d) => d.enters));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(l) => fmtDate(String(l))} interval={xInterval(daily.length)}
          tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }}
          labelFormatter={(l) => fmtDate(String(l))}
          formatter={(v, name) => [v, name === "enters" ? "Entradas" : "Media móvil 7d"]} />
        <Legend formatter={(v) => v === "enters" ? "Entradas diarias" : "Media móvil 7d"}
          wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        <Bar dataKey="enters" radius={[3, 3, 0, 0]} maxBarSize={28}>
          {daily.map((d, i) => (
            <Cell key={i}
              fill={d.isAnomaly ? (d.enters > maxE * 0.85 ? "#FCD34D" : "#FCA5A5") : "#2DD4BF"}
              opacity={d.isAnomaly ? 1 : 0.85} />
          ))}
        </Bar>
        <Line dataKey="ma7" stroke="#0B1222" strokeWidth={2.5} dot={false}
          connectNulls={false} activeDot={{ r: 4, fill: "#0B1222" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function PasantesVsEntradasChart({ daily, loading }: {
  daily: ReturnType<typeof useTrendData>["daily"]; loading: boolean;
}) {
  if (loading) return <Skeleton h={200} />;
  if (daily.length === 0)
    return <p className="text-sm text-slate-400 py-10 text-center">Sin datos</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={daily} margin={{ top: 8, right: 40, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(l) => fmtDate(String(l))} interval={xInterval(daily.length)}
          tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="e" tick={{ fontSize: 10, fill: "#2DD4BF" }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 10, fill: "#94A3B8" }}
          axisLine={false} tickLine={false} width={38} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }}
          labelFormatter={(l) => fmtDate(String(l))}
          formatter={(v, name) => [v, name === "enters" ? "Entradas" : "Pasantes"]} />
        <Legend formatter={(v) => v === "enters" ? "Entradas" : "Pasantes"}
          wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        <Line yAxisId="e" dataKey="enters" stroke="#2DD4BF" strokeWidth={2.5}
          dot={false} activeDot={{ r: 4, fill: "#2DD4BF" }} />
        <Line yAxisId="p" dataKey="pasantes" stroke="#94A3B8" strokeWidth={2}
          strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: "#94A3B8" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function DOWConversionChart({ dowData, loading }: {
  dowData: ReturnType<typeof useTrendData>["dowData"]; loading: boolean;
}) {
  if (loading) return <Skeleton h={200} />;
  const maxC = Math.max(...dowData.map((d) => d.conv));
  const minC = Math.min(...dowData.filter((d) => d.conv > 0).map((d) => d.conv));
  const valid = dowData.filter((d) => d.conv > 0);
  const avg   = valid.length > 0 ? valid.reduce((s, d) => s + d.conv, 0) / valid.length : 0;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={dowData} barSize={28} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="dow" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`${v}%`, "Conv. promedio"]}
          contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }} />
        {avg > 0 && (
          <ReferenceLine y={+avg.toFixed(1)} stroke="#94A3B8" strokeDasharray="4 2"
            label={{ value: `Prom ${avg.toFixed(1)}%`, fill: "#64748B", fontSize: 9, position: "insideTopRight" }} />
        )}
        <Bar dataKey="conv" radius={[4, 4, 0, 0]}>
          {dowData.map((d, i) => (
            <Cell key={i}
              fill={d.conv === maxC && maxC > 0 ? "#0B1222" : d.conv === minC && minC < maxC ? "#FCA5A5" : "#2DD4BF"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function IntradayChart({ hourly, loading }: { hourly: HourlyRow[]; loading: boolean }) {
  const data = useMemo(() => {
    const byHour = new Map<number, number>();
    for (const r of hourly) {
      if (r.event_type !== "enter") continue;
      byHour.set(r.hour, (byHour.get(r.hour) ?? 0) + r.count);
    }
    const sorted = Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]);
    const total  = sorted.reduce((s, [, v]) => s + v, 0);
    let cum = 0;
    return sorted.map(([hour, count]) => {
      cum += count;
      return { hour, cumPct: total > 0 ? +(((cum / total) * 100).toFixed(1)) : 0 };
    });
  }, [hourly]);

  if (loading) return <Skeleton h={200} />;
  if (data.length === 0)
    return <p className="text-sm text-slate-400 py-10 text-center">Sin datos</p>;

  const h50 = data.find((d) => d.cumPct >= 50);
  const h80 = data.find((d) => d.cumPct >= 80);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="cumGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="hour" tickFormatter={(h) => fmtHour(Number(h))}
          tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => [`${v}%`, "Acumulado"]}
          labelFormatter={(h) => fmtHour(Number(h))}
          contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }} />
        {h50 && <ReferenceLine x={h50.hour} stroke="#F59E0B" strokeDasharray="4 2"
          label={{ value: `50% · ${fmtHour(h50.hour)}`, fill: "#F59E0B", fontSize: 9, position: "insideTopLeft" }} />}
        {h80 && <ReferenceLine x={h80.hour} stroke="#94A3B8" strokeDasharray="4 2"
          label={{ value: `80% · ${fmtHour(h80.hour)}`, fill: "#64748B", fontSize: 9, position: "insideTopLeft" }} />}
        <Area dataKey="cumPct" stroke="#2DD4BF" strokeWidth={2.5} fill="url(#cumGrad2)"
          dot={false} activeDot={{ r: 4, fill: "#2DD4BF" }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProjectionChart({ projection, lastDate, loading }: {
  projection: ReturnType<typeof useTrendData>["projection"];
  lastDate: string | undefined; loading: boolean;
}) {
  if (loading) return <Skeleton h={220} />;
  if (projection.length === 0)
    return <p className="text-sm text-slate-400 py-10 text-center">Selecciona al menos 3 días para ver la proyección</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={projection} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(l) => fmtDate(String(l))} interval={xInterval(projection.length)}
          tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }}
          labelFormatter={(l) => fmtDate(String(l))}
          formatter={(v, name) => [v, name === "actual" ? "Real" : "Proyectado"]} />
        <Legend formatter={(v) => v === "actual" ? "Entradas reales" : "Proyección (regresión lineal)"}
          wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
        {lastDate && (
          <ReferenceLine x={lastDate} stroke="#CBD5E1" strokeDasharray="4 2"
            label={{ value: "Hoy", fill: "#94A3B8", fontSize: 9, position: "insideTopRight" }} />
        )}
        <Line dataKey="actual" stroke="#2DD4BF" strokeWidth={2.5} dot={false}
          connectNulls={false} activeDot={{ r: 4, fill: "#2DD4BF" }} />
        <Line dataKey="projected" stroke="#94A3B8" strokeWidth={2} strokeDasharray="6 4"
          dot={false} connectNulls={false} activeDot={{ r: 4, fill: "#94A3B8" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Period presets ────────────────────────────────────────────────────────────

const YESTERDAY = nDaysAgo(1);
const DAY_BEFORE = nDaysAgo(2);
const PREV = prevMonthRange();

interface Preset { label: string; start: string; end: string }
const PRESETS: Preset[] = [
  { label: "2 días",   start: DAY_BEFORE,        end: YESTERDAY },
  { label: "7 días",   start: nDaysAgo(7),        end: YESTERDAY },
  { label: "30 días",  start: nDaysAgo(30),       end: YESTERDAY },
  { label: "Este mes", start: firstOfThisMonth(),  end: YESTERDAY },
  { label: "Mes ant.", start: PREV.start,          end: PREV.end  },
];

// ── Main component ────────────────────────────────────────────────────────────

interface TendenciasTabProps {
  filters:        DashboardFilters;
  allSites:       string[];
  minDate:        string;
  maxDate:        string;
  availableDates: Set<string>;
  loading:        boolean;
}

export function TendenciasTab({
  filters, allSites, minDate, maxDate, availableDates, loading: parentLoading,
}: TendenciasTabProps) {
  const [localDates, setLocalDates]     = useState({ start: DAY_BEFORE, end: YESTERDAY });
  const [activePreset, setActivePreset] = useState<string>("2 días");
  const [dateMode, setDateMode]         = useState<DateMode>("range");
  const [compareMode, setCompareMode]   = useState<CompareMode>("prev-day");

  // Build local DashboardFilters: inherit sites/channels/zones from global, override period
  const localFilters = useMemo<DashboardFilters>(() => ({
    ...filters,
    startTs: limaToUtc(localDates.start, 0, 0, 0),
    endTs:   limaToUtc(localDates.end, 23, 59, 59),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filters.sites, filters.channels, filters.zones, filters.hourMin, filters.hourMax, filters.dows,
      localDates.start, localDates.end]);

  function applyPreset(p: Preset) {
    setLocalDates({ start: p.start, end: p.end });
    setActivePreset(p.label);
    setDateMode(p.start === p.end ? "single" : "range");
  }
  function applyDatePicker(start: string, end: string) {
    setLocalDates({ start, end });
    setActivePreset("personalizado");
  }

  // Fetch kpis + hourly for local period (for KPI cards + intraday chart)
  const { kpis: localKpis, hourly: localHourly, loading: kpiLoading } = useLocalKPIs(localFilters);

  // Comparison data (REQ 1 + REQ 2)
  const { refKpis, refHourly, siteRank, loading: compLoading, deltas, curPasantes } =
    useComparisonData(localFilters, compareMode, localKpis, localHourly, allSites);

  // Trend data for charts
  const { daily, dowData, projection, loading: trendLoading, hasEnoughData } = useTrendData(localFilters);

  const loading       = parentLoading || kpiLoading || trendLoading;
  const compareLoading = loading || compLoading;

  const anomalyCount  = daily.filter((d) => d.isAnomaly).length;
  const lastDate      = daily.at(-1)?.date;

  // Pre-compute comparison chart data at top level (Rules of Hooks)
  const compChartData = useMemo(() => {
    const map = new Map<number, { hour: number; actual: number; referencia: number }>();
    for (let h = 7; h <= 22; h++) map.set(h, { hour: h, actual: 0, referencia: 0 });
    for (const r of localHourly) {
      if (r.event_type !== "enter") continue;
      const e = map.get(r.hour);
      if (e) e.actual += r.count;
    }
    for (const r of refHourly) {
      if (r.event_type !== "enter") continue;
      const e = map.get(r.hour);
      if (e) e.referencia += r.count;
    }
    return [...map.values()].sort((a, b) => a.hour - b.hour);
  }, [localHourly, refHourly]);

  const COMPARE_MODES: { key: CompareMode; label: string }[] = [
    { key: "prev-day",    label: "Día anterior"    },
    { key: "same-dow",    label: "Misma sem. ant."  },
    { key: "prev-period", label: "Período ant."     },
  ];

  return (
    <div className="space-y-5">

      {/* ── Period filter ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={13} className="text-[#2DD4BF]" />
          <span className="text-xs font-semibold text-slate-600">Período de análisis</span>
          <span className="text-[10px] text-slate-400 ml-auto">Independiente del filtro global</span>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                activePreset === p.label
                  ? "bg-[#0B1222] text-[#2DD4BF] border-[#0B1222]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date picker — mismo componente y diseño que el filtro global */}
        <DatePicker
          mode={dateMode}
          startDate={localDates.start}
          endDate={localDates.end}
          minDate={minDate}
          maxDate={maxDate}
          availableDates={availableDates}
          onModeChange={(m) => {
            setDateMode(m);
            if (m === "single" && localDates.start !== localDates.end)
              applyDatePicker(localDates.start, localDates.start);
          }}
          onChange={(start, end) => applyDatePicker(start, end)}
          filterWarning={null}
        />
      </div>

      {/* ── Aviso período corto ── */}
      {!loading && !hasEnoughData && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={15} />
          Selecciona al menos 2 días para ver tendencias históricas.
        </div>
      )}

      {/* ── Días atípicos ── */}
      {!loading && anomalyCount > 0 && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
          <TrendingUp size={13} className="text-amber-500 shrink-0" />
          Se detectaron <strong className="mx-1">{anomalyCount} día{anomalyCount > 1 ? "s" : ""} atípico{anomalyCount > 1 ? "s" : ""}</strong>
          en el período — amarillo = pico inusual · rojo = caída inusual.
        </div>
      )}

      {/* ── REQ 2: KPI cards + REQ 1: toggle comparación ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        {/* Header + toggle (REQ 1) */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Contexto comparativo</h3>
            <p className="text-xs text-slate-400 mt-0.5">{MODE_LABELS[compareMode]}</p>
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {COMPARE_MODES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setCompareMode(key)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  compareMode === key
                    ? "bg-[#0B1222] text-[#2DD4BF]"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards (REQ 2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KPICompareCard
            label="Pasantes"
            current={curPasantes}
            delta={deltas.pasantes}
            vsLabel={MODE_LABELS[compareMode]}
            siteRank={siteRank}
            showRank={allSites.length > 1}
            loading={compareLoading}
          />
          <KPICompareCard
            label="Entradas"
            current={localKpis?.enters ?? 0}
            delta={deltas.enters}
            vsLabel={MODE_LABELS[compareMode]}
            siteRank={siteRank}
            showRank={allSites.length > 1}
            loading={compareLoading}
          />
        </div>

        {/* Comparison bar chart (REQ 1) */}
        <div className="mt-5">
          <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-wide font-medium">
            Entradas por hora — actual vs referencia
          </p>
          {compareLoading ? (
            <Skeleton h={180} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={compChartData}
                barSize={10}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="hour" tickFormatter={(h) => fmtHour(Number(h))}
                  tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: 11 }}
                  labelFormatter={(h) => fmtHour(Number(h))}
                  formatter={(v, name) => [v, name === "actual" ? "Actual" : "Referencia"]} />
                <Legend formatter={(v) => v === "actual" ? "Actual" : "Referencia"}
                  wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="referencia" fill="#CBD5E1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual" radius={[2, 2, 0, 0]}>
                  {compChartData.map((d, i) => (
                    <Cell key={i} fill={d.actual < d.referencia && d.referencia > 0 ? "#FCA5A5" : "#2DD4BF"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Chart 1: Tendencia diaria ── */}
      <ChartCard
        title="Tendencia diaria de entradas"
        subtitle="Barras = entradas · Línea = media móvil 7d · Amarillo = pico atípico · Rojo = caída atípica"
      >
        <TendenciaChart daily={daily} loading={loading} />
      </ChartCard>

      {/* ── Charts 2 + 3 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Pasantes vs Entradas diario"
          subtitle="Teal = entradas (eje izq.) · Gris punteado = pasantes (eje der.)">
          <PasantesVsEntradasChart daily={daily} loading={loading} />
        </ChartCard>
        <ChartCard title="Conversión media por día de semana"
          subtitle="% de pasantes que ingresaron · Oscuro = mejor día · Rojo = peor día">
          <DOWConversionChart dowData={dowData} loading={loading} />
        </ChartCard>
      </div>

      {/* ── Charts 4 + 5 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title="Acumulado intradiario de entradas"
          subtitle="% de entradas acumuladas hora a hora · Marcadores al 50% y 80%">
          <IntradayChart hourly={localHourly} loading={loading} />
        </ChartCard>
        <ChartCard title="Proyección de entradas (7 días)"
          subtitle="Regresión lineal sobre el histórico · Gris punteado = estimación futura">
          <ProjectionChart projection={projection} lastDate={lastDate} loading={loading} />
        </ChartCard>
      </div>

    </div>
  );
}
