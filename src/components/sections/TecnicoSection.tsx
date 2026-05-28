"use client";

import { useState, useMemo, useEffect } from "react";
import { Wifi, WifiOff, AlertTriangle, Camera, Clock, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { useUptime } from "@/hooks/useUptime";
import { useAvailability } from "@/hooks/useAvailability";
import { useCameraLastEvents } from "@/hooks/useCameraLastEvents";
import { supabase } from "@/lib/supabase";
import { fetchHourly } from "@/lib/api";
import { KPICards } from "@/components/dashboard/KPICards";
import { KPIStrip } from "@/components/sections/KPIStrip";
import { FilterPanel, type FilterValues } from "@/components/filters/FilterPanel";
import type { DashboardFilters, KPIResult } from "@/lib/types";
import type { FilterOptions } from "@/hooks/useFilterOptions";

const WIN_START = 7;
const WIN_END   = 23;
const EXPECTED  = WIN_END - WIN_START + 1;

interface Props {
  hourly:        unknown[];
  loading:       boolean;
  kpis:          KPIResult | null;
  totals:        { visitors: number; pasantes: number; conv: number | null };
  filterValues:  FilterValues;
  opts:          FilterOptions;
  onFilterChange:(patch: Partial<FilterValues>) => void;
}

// ── Lima helpers ───────────────────────────────────────────────────────────────

function limaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
}

function limaCurrentHour(): number {
  return ((new Date().getUTCHours() - 5) + 24) % 24;
}

function limaDayBounds(limaDate: string): { start: string; end: string } {
  const [y, m, d] = limaDate.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d,     5,  0,  0)).toISOString(),
    end:   new Date(Date.UTC(y, m - 1, d + 1, 4, 59, 59)).toISOString(),
  };
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `hace ${hours}h ${mins % 60}m`;
  return `hace ${mins}m`;
}

function fmtShortDate(iso: string): string {
  const parts = String(iso).split("-").map(Number);
  const M = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${parts[2]} ${M[parts[1] - 1]}`;
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fmtAbsDate(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

const EVENT_TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  enter:   { label: "Entrada",   cls: "bg-emerald-100 text-emerald-700" },
  exit:    { label: "Salida",    cls: "bg-red-100    text-red-700"     },
  pasante: { label: "Pasante",   cls: "bg-blue-100   text-blue-700"    },
  visitor: { label: "Visitante", cls: "bg-indigo-100 text-indigo-700"  },
};

function TypeBadge({ type }: { type: string }) {
  const info = EVENT_TYPE_LABELS[type] ?? { label: type, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${info.cls}`}>
      {info.label}
    </span>
  );
}

function PctBadge({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? "bg-emerald-100 text-emerald-700" :
    pct >= 70 ? "bg-amber-100 text-amber-700"     :
                "bg-red-100 text-red-700";
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {pct}%
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TecnicoSection({ kpis, totals, loading, filterValues, opts, onFilterChange }: Props) {
  const todayStr = limaToday();

  // ── Estado actual (real-time, last 2h) ────────────────────────────────────
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveTs, setLiveTs] = useState<string | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 2 * 3_600_000).toISOString();
    supabase
      .from("tracking_logs_view")
      .select("time")
      .gte("time", since)
      .order("time", { ascending: false })
      .limit(1)
      .then(({ data }) => { setLiveTs(data?.[0]?.time ?? null); setLiveLoading(false); });
  }, []);

  // ── Último evento por cámara (sin filtro de período, siempre al día) ─────
  const lastEvents = useCameraLastEvents();

  const liveMinutesAgo = useMemo(() => {
    if (!liveTs) return null;
    return Math.floor((Date.now() - new Date(liveTs).getTime()) / 60000);
  }, [liveTs]);
  const isLive = liveMinutesAgo !== null && liveMinutesAgo < 30;

  // ── Actividad de hoy (RPC pre-agregado, sin límite de filas) ─────────────
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayHourMap, setTodayHourMap] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    const { start, end } = limaDayBounds(todayStr);
    const f: DashboardFilters = {
      startTs: start, endTs: end,
      sites: null, channels: null, zones: null,
      hourMin: 0, hourMax: 23, dows: null,
    };
    fetchHourly(f).then((rows) => {
      const map = new Map<number, number>();
      for (const r of rows) map.set(r.hour, (map.get(r.hour) ?? 0) + r.count);
      setTodayHourMap(map);
      setTodayLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limaHour = limaCurrentHour();

  const todayChartData = useMemo(() =>
    Array.from({ length: EXPECTED }, (_, i) => {
      const hour = WIN_START + i;
      return { hour, count: todayHourMap.get(hour) ?? 0, isFuture: hour > limaHour, isCurrent: hour === limaHour };
    }),
  [todayHourMap, limaHour]);

  const todayGaps = useMemo(() =>
    Array.from({ length: EXPECTED }, (_, i) => WIN_START + i)
      .filter((h) => h < limaHour && (todayHourMap.get(h) ?? 0) === 0),
  [todayHourMap, limaHour]);

  // ── Disponibilidad última semana (overview fijo) ──────────────────────────
  const weekRange = useMemo(() => ({
    start: limaDayBounds(addDays(todayStr, -6)).start,
    end:   limaDayBounds(todayStr).end,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const weekAvail = useAvailability(weekRange.start, weekRange.end);

  // ── Período filtrado (desde FilterPanel global) ───────────────────────────
  const filterTs = useMemo(() => ({
    start: limaDayBounds(filterValues.startDate).start,
    end:   limaDayBounds(filterValues.endDate).end,
  }), [filterValues.startDate, filterValues.endDate]);

  // useAvailability: availability % charts (no row-limit issues, uses RPC)
  // useUptime: gap detection table + camera stats (needs raw event timestamps)
  const avail  = useAvailability(filterTs.start, filterTs.end);
  const uptime = useUptime(filterTs.start, filterTs.end);

  return (
    <div className="px-4 md:px-6 py-5 space-y-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800">
            <Camera size={14} className="text-[#2DD4BF]" />
          </span>
          Panel Técnico — Disponibilidad del Sistema
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Ventana operativa 07:00–23:00 · cortes = horas sin eventos
        </p>
      </div>

      {/* ── Filtro de período (al tope, igual que en general) ── */}
      <FilterPanel opts={opts} values={filterValues} onChange={onFilterChange} />

      {/* ── Indicadores del período ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-widest mb-3">
            Indicadores del período seleccionado
          </h2>
          <KPICards kpis={kpis} loading={loading} />
        </div>
        <KPIStrip
          visitors={totals.visitors}
          pasantes={totals.pasantes}
          conv={totals.conv}
          uniqueTracks={kpis?.unique_tracks ?? 0}
          days={kpis?.days ?? 1}
          loading={loading}
          compact
        />
      </div>

      {/* ── Estado actual ── */}
      <div className={`rounded-2xl border shadow-sm p-5 flex items-center gap-4 ${
        liveLoading     ? "bg-white border-slate-100" :
        isLive          ? "bg-emerald-50 border-emerald-200" :
        liveTs !== null ? "bg-red-50 border-red-200" :
                          "bg-slate-50 border-slate-200"
      }`}>
        <div className={`flex items-center justify-center w-12 h-12 rounded-xl shrink-0 ${
          liveLoading     ? "bg-slate-100" :
          isLive          ? "bg-emerald-100" :
          liveTs !== null ? "bg-red-100" : "bg-slate-100"
        }`}>
          {liveLoading
            ? <div className="w-5 h-5 bg-slate-200 rounded-full animate-pulse" />
            : isLive
            ? <Wifi size={22} className="text-emerald-600" />
            : <WifiOff size={22} className={liveTs !== null ? "text-red-500" : "text-slate-400"} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold ${
              liveLoading ? "text-slate-400" : isLive ? "text-emerald-700" :
              liveTs !== null ? "text-red-700" : "text-slate-500"
            }`}>
              {liveLoading ? "Verificando…" : isLive ? "Sistema activo" :
               liveTs !== null ? "Sistema inactivo" : "Sin actividad reciente"}
            </span>
            {!liveLoading && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide ${
                isLive ? "bg-emerald-100 text-emerald-700" :
                liveTs !== null ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
              }`}>
                {isLive ? "EN LÍNEA" : "FUERA DE LÍNEA"}
              </span>
            )}
          </div>
          <p className={`text-xs mt-0.5 ${
            liveLoading ? "text-slate-400" : isLive ? "text-emerald-600" :
            liveTs !== null ? "text-red-500" : "text-slate-400"
          }`}>
            {liveLoading ? "Consultando última actividad…" :
             liveTs === null ? "Sin eventos en las últimas 2 horas" :
             isLive ? `Último evento ${fmtRelative(liveTs)}` :
             `Sin actividad en los últimos ${liveMinutesAgo} min — posible corte`}
          </p>
        </div>
        {!liveLoading && !isLive && liveTs !== null && (
          <div className="flex items-center gap-1.5 bg-red-100 rounded-lg px-3 py-2 shrink-0">
            <AlertTriangle size={13} className="text-red-500" />
            <span className="text-xs font-bold text-red-700">{liveMinutesAgo} min</span>
          </div>
        )}
      </div>

      {/* ── Última señal por cámara ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Camera size={14} className="text-[#2DD4BF]" />
            Última señal por cámara
          </h3>
          <span className="text-[10px] text-slate-400">Actualiza cada 2 min</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Evento más reciente registrado por cada cámara — independiente del filtro de período
        </p>

        {lastEvents.loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-9 bg-slate-50 animate-pulse rounded-lg" />)}
          </div>
        ) : lastEvents.error ? (
          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle size={12} />
            {lastEvents.error}
          </div>
        ) : lastEvents.cameras.length === 0 ? (
          <div className="text-sm text-slate-400">Sin registros</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left  pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Cámara</th>
                  <th className="text-left  pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Último evento</th>
                  <th className="text-left  pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Penúltimo evento</th>
                  <th className="text-right pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lastEvents.cameras.map((cam) => {
                  const mins      = cam.minutesSince ?? 0;
                  const isOnline  = mins < 30;
                  const isWarning = !isOnline && mins < 120;
                  const rowCls    = isOnline ? "" : isWarning ? "bg-amber-50/40" : "bg-red-50/40";
                  return (
                    <tr key={cam.channel} className={`border-b border-slate-50 transition-colors ${rowCls}`}>
                      {/* Cámara */}
                      <td className="py-2.5 font-medium text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Camera size={11} className="text-slate-400 shrink-0" />
                          {cam.cameraName}
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal ml-4">ch {cam.channel}</span>
                      </td>

                      {/* Último evento */}
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <TypeBadge type={cam.last.type} />
                          <span className="font-mono text-slate-600">{fmtAbsDate(cam.last.time)}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 ml-0.5">{fmtRelative(cam.last.time)}</span>
                      </td>

                      {/* Penúltimo evento */}
                      <td className="py-2.5">
                        {cam.prev ? (
                          <>
                            <div className="flex items-center gap-1.5">
                              <TypeBadge type={cam.prev.type} />
                              <span className="font-mono text-slate-500">{fmtAbsDate(cam.prev.time)}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 ml-0.5">{fmtRelative(cam.prev.time)}</span>
                          </>
                        ) : (
                          <span className="text-slate-300 italic">—</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="py-2.5 text-right align-top pt-3">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <Wifi size={10} /> Online
                          </span>
                        ) : isWarning ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                            <AlertTriangle size={10} /> Alerta
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                            <WifiOff size={10} /> Inactiva
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Actividad de hoy ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity size={14} className="text-[#2DD4BF]" />
            Actividad de hoy — {todayStr}
          </h3>
          {!todayLoading && todayGaps.length > 0 && (
            <span className="text-[11px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
              <AlertTriangle size={10} /> {todayGaps.length} hora(s) sin eventos
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mb-4 flex-wrap text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#2DD4BF]" /> Con eventos</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#fca5a5]" /> Sin eventos (hora pasada)</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#fbbf24]" /> Hora actual</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#e2e8f0]" /> Hora futura</span>
        </div>

        {todayLoading ? (
          <div className="h-48 bg-slate-50 animate-pulse rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={todayChartData} barSize={22} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(h: number) => `${h}h`} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [v, "Eventos"]} labelFormatter={(l) => `${l}:00 – ${l}:59`} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {todayChartData.map((d, i) => (
                  <Cell key={i} fill={d.count > 0 ? "#2DD4BF" : d.isFuture ? "#e2e8f0" : d.isCurrent ? "#fbbf24" : "#fca5a5"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {!todayLoading && todayGaps.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Horas sin eventos hoy</p>
            {todayGaps.map((h, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-100">
                <AlertTriangle size={12} className="text-red-500" />
                <span className="text-slate-700">Sin eventos en la hora <strong>{h}:00 – {h}:59</strong></span>
              </div>
            ))}
          </div>
        )}
        {!todayLoading && todayGaps.length === 0 && todayHourMap.size > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
            <Wifi size={13} /> Sin cortes detectados hoy hasta el momento
          </div>
        )}
        {!todayLoading && todayHourMap.size === 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <AlertTriangle size={13} /> Sin eventos registrados hoy aún
          </div>
        )}
      </div>

      {/* ── Disponibilidad últimos 7 días (overview fijo) ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-start justify-between mb-0.5">
          <h3 className="text-sm font-semibold text-slate-700">Disponibilidad — últimos 7 días</h3>
          {!weekAvail.loading && weekAvail.daily.length > 0 && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              weekAvail.avgPct >= 90 ? "bg-emerald-100 text-emerald-700" :
              weekAvail.avgPct >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
            }`}>
              Prom {weekAvail.avgPct}%
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-4">% de horas 07–23 con eventos por día</p>

        {weekAvail.loading ? (
          <div className="h-44 bg-slate-50 animate-pulse rounded-xl" />
        ) : weekAvail.daily.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-sm text-slate-400">Sin datos</div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weekAvail.daily} barSize={36} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtShortDate} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${v}%`, "Disponibilidad"]} labelFormatter={(l) => fmtShortDate(String(l))} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
              {weekAvail.daily.length > 1 && (
                <ReferenceLine y={weekAvail.avgPct} stroke="#94a3b8" strokeDasharray="4 2"
                  label={{ value: `Prom ${weekAvail.avgPct}%`, fill: "#64748b", fontSize: 10, position: "insideTopRight" }} />
              )}
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {weekAvail.daily.map((d, i) => (
                  <Cell key={i} fill={d.pct >= 90 ? "#34d399" : d.pct >= 70 ? "#fbbf24" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Cortes en el período filtrado ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-1 flex items-center gap-2">
          <Clock size={14} className="text-amber-500" />
          Cortes en el período
          <span className="text-xs font-normal text-slate-400 ml-1">
            {filterValues.startDate === filterValues.endDate
              ? fmtShortDate(filterValues.startDate)
              : `${fmtShortDate(filterValues.startDate)} – ${fmtShortDate(filterValues.endDate)}`}
          </span>
        </h3>
        <p className="text-xs text-slate-400 mb-4">Intervalos ≥30 min sin eventos · 07:00–23:00</p>

        {uptime.loading ? (
          <div className="space-y-2">
            {[1,2,3].map((i) => <div key={i} className="h-9 bg-slate-50 animate-pulse rounded-lg" />)}
          </div>
        ) : uptime.gaps.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 py-2">
            <Wifi size={14} /> Sin interrupciones de más de 30 min en el período
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Fecha","Desde","Hasta","Duración","Severidad"].map((h, i) => (
                      <th key={h} className={`pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px] ${i === 0 || i === 4 ? "text-left" : "text-center"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uptime.gaps
                    .sort((a, b) => b.durationMin - a.durationMin)
                    .map((g, i) => {
                      const sev    = g.durationMin >= 120 ? "Alta" : g.durationMin >= 60 ? "Media" : "Baja";
                      const sevCls = g.durationMin >= 120 ? "bg-red-100 text-red-700" : g.durationMin >= 60 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
                      return (
                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 font-medium text-slate-700">{fmtShortDate(g.date)}</td>
                          <td className="py-2.5 text-center font-mono text-slate-700">{g.fromLabel}</td>
                          <td className="py-2.5 text-center font-mono text-slate-700">{g.toLabel}</td>
                          <td className="py-2.5 text-center">
                            <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${g.durationMin >= 60 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {fmtDuration(g.durationMin)}
                            </span>
                          </td>
                          <td className="py-2.5">
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${sevCls}`}>{sev}</span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="flex items-start gap-2 mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-800">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {uptime.gaps.length} corte(s) · {fmtDuration(uptime.totalGapMin)} sin señal en el período
            </div>
          </>
        )}
      </div>

      {/* ── Disponibilidad diaria (período filtrado) ── */}
      {(avail.loading || avail.daily.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-start justify-between mb-0.5">
            <h3 className="text-sm font-semibold text-slate-700">Disponibilidad diaria</h3>
            {!avail.loading && avail.daily.length > 0 && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                avail.avgPct >= 90 ? "bg-emerald-100 text-emerald-700" :
                avail.avgPct >= 70 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
              }`}>
                Prom {avail.avgPct}%
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">% de horas 07–23 con eventos por día</p>
          {avail.loading ? (
            <div className="h-44 bg-slate-50 animate-pulse rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={avail.daily} barSize={28} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtShortDate} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [`${v}%`, "Disponibilidad"]} labelFormatter={(l) => fmtShortDate(String(l))} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                {avail.daily.length > 1 && (
                  <ReferenceLine y={avail.avgPct} stroke="#94a3b8" strokeDasharray="4 2"
                    label={{ value: `Prom ${avail.avgPct}%`, fill: "#64748b", fontSize: 10, position: "insideTopRight" }} />
                )}
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {avail.daily.map((d, i) => (
                    <Cell key={i} fill={d.pct >= 90 ? "#34d399" : d.pct >= 70 ? "#fbbf24" : "#f87171"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Cámaras ── */}
      {(uptime.loading || uptime.cameras.length > 0) && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Estado por cámara</h3>
          <p className="text-xs text-slate-400 mb-4">Disponibilidad individual en ventana 07–23</p>
          {uptime.loading ? (
            <div className="space-y-2">
              {[1,2,3].map((i) => <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-lg" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left  pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Cámara</th>
                    <th className="text-right pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Última señal</th>
                    <th className="text-right pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Pasantes</th>
                    <th className="text-right pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Entradas</th>
                    <th className="text-right pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Disponibilidad</th>
                    <th className="text-right pb-2 font-semibold text-slate-500 uppercase tracking-widest text-[10px]">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {uptime.cameras.map((cam) => {
                    const isRecent = Date.now() - new Date(cam.lastSeen).getTime() < 2 * 3_600_000;
                    const pasantes = cam.pasanteEvents ?? 0;
                    const enters   = cam.enterEvents   ?? 0;
                    const missingType = pasantes === 0 || enters === 0;
                    return (
                      <tr key={cam.channel} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 font-medium text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <Camera size={11} className="text-slate-400 shrink-0" />
                            <span>{cam.cameraName ?? cam.channel}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal ml-4">ch {cam.channel}</span>
                        </td>
                        <td className="py-2.5 text-right text-slate-500">{fmtRelative(cam.lastSeen)}</td>
                        <td className={`py-2.5 text-right font-mono text-xs ${pasantes === 0 ? "text-red-400" : "text-slate-600"}`}>
                          {pasantes.toLocaleString("es-PE")}
                        </td>
                        <td className={`py-2.5 text-right font-mono text-xs ${enters === 0 ? "text-red-400" : "text-slate-600"}`}>
                          {enters.toLocaleString("es-PE")}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <PctBadge pct={cam.pct} />
                            {missingType && <AlertTriangle size={10} className="text-amber-500" />}
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          {isRecent
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><Wifi size={10} />Online</span>
                            : <span className="inline-flex items-center gap-1 text-slate-400"><WifiOff size={10} />Inactiva</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
