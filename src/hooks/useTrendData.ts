"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchDailyTrends, type DailyTrendRow } from "@/lib/api";
import type { DashboardFilters } from "@/lib/types";

// ── helpers ───────────────────────────────────────────────────────────────────

function computeMA(values: number[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    return Math.round(slice.reduce((s, v) => s + v, 0) / window);
  });
}

function detectAnomalies(values: number[]): boolean[] {
  if (values.length < 4) return values.map(() => false);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const std  = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  return values.map((v) => std > 0 && Math.abs(v - mean) > 1.5 * std);
}

function linReg(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const sumX  = (n * (n - 1)) / 2;
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
  const sumY  = ys.reduce((s, v) => s + v, 0);
  const sumXY = ys.reduce((s, v, i) => s + i * v, 0);
  const slope     = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface TrendRow extends DailyTrendRow {
  ma7:       number | null;
  isAnomaly: boolean;
}

export interface DOWRow {
  dow:    string;
  conv:   number;
  enters: number;
}

export interface ProjectionRow {
  date:      string;
  actual:    number | null;
  projected: number | null;
}

const DOWS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// ── hook ──────────────────────────────────────────────────────────────────────

export function useTrendData(filters: DashboardFilters) {
  const [raw,     setRaw]     = useState<DailyTrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRaw([]);
    fetchDailyTrends(filters)
      .then((data) => { if (!cancelled) { setRaw(data); setLoading(false); } })
      .catch(()    => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startTs, filters.endTs, JSON.stringify(filters.sites), JSON.stringify(filters.channels), JSON.stringify(filters.zones), filters.hourMin, filters.hourMax, JSON.stringify(filters.dows)]);

  const daily = useMemo<TrendRow[]>(() => {
    const enters    = raw.map((r) => r.enters);
    const ma7vals   = computeMA(enters, 7);
    const anomalies = detectAnomalies(enters);
    return raw.map((r, i) => ({ ...r, ma7: ma7vals[i], isAnomaly: anomalies[i] }));
  }, [raw]);

  // Average enters + conversion per day-of-week (Mon first)
  const dowData = useMemo<DOWRow[]>(() => {
    const acc = new Map<number, { conv: number[]; enters: number[] }>();
    for (const r of raw) {
      const dow = new Date(r.date + "T12:00:00").getDay();
      const cur = acc.get(dow) ?? { conv: [], enters: [] };
      cur.conv.push(r.conv);
      cur.enters.push(r.enters);
      acc.set(dow, cur);
    }
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const d = acc.get(dow);
      if (!d || d.enters.length === 0) return { dow: DOWS_ES[dow], conv: 0, enters: 0 };
      return {
        dow:    DOWS_ES[dow],
        conv:   +(d.conv.reduce((s, v) => s + v, 0) / d.conv.length).toFixed(1),
        enters: Math.round(d.enters.reduce((s, v) => s + v, 0) / d.enters.length),
      };
    });
  }, [raw]);

  // Linear regression on enters → 7-day forward projection
  const projection = useMemo<ProjectionRow[]>(() => {
    if (raw.length < 3) return [];
    const { slope, intercept } = linReg(raw.map((r) => r.enters));
    const lastDate = raw[raw.length - 1].date;

    const hist: ProjectionRow[] = raw.map((r, i) => ({
      date:      r.date,
      actual:    r.enters,
      // Stitch projected line starting from the last actual point
      projected: i === raw.length - 1
        ? Math.max(0, Math.round(intercept + slope * i))
        : null,
    }));

    const future: ProjectionRow[] = Array.from({ length: 7 }, (_, j) => ({
      date:      addDays(lastDate, j + 1),
      actual:    null,
      projected: Math.max(0, Math.round(intercept + slope * (raw.length + j))),
    }));

    return [...hist, ...future];
  }, [raw]);

  return { daily, dowData, projection, loading, hasEnoughData: raw.length >= 2 };
}
