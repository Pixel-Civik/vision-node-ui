"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchHourly } from "@/lib/api";
import type { DashboardFilters } from "@/lib/types";

const WIN_START = 7;
const WIN_END   = 23;
const EXPECTED  = WIN_END - WIN_START + 1; // 17 horas operativas

// ── helpers ───────────────────────────────────────────────────────────────────

function limaDayBounds(isoDate: string): { start: string; end: string } {
  const [y, m, d] = isoDate.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d,     5,  0,  0)).toISOString(),
    end:   new Date(Date.UTC(y, m - 1, d + 1, 4, 59, 59)).toISOString(),
  };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInRange(startLima: string, endLima: string): string[] {
  const [sy, sm, sd] = startLima.split("-").map(Number);
  const [ey, em, ed] = endLima.split("-").map(Number);
  const days: string[] = [];
  let d = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) {
    days.push(isoDate(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return days;
}

function utcToLimaDate(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(ts));
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface DayAvailabilityData {
  date:         string;
  pct:          number;
  onlineHours:  number;
  expectedHours: number;
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Computes daily availability (% of hours 7–23 with events) using the
 * dashboard_hourly_totals RPC — one call per day, in parallel.
 * No row-limit issues: the RPC returns aggregated counts, never raw events.
 */
export function useAvailability(startTs: string, endTs: string) {
  const [daily, setDaily]   = useState<DayAvailabilityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!startTs || !endTs) return;
    setLoading(true);
    setDaily([]);

    async function load() {
      const startLima = utcToLimaDate(startTs);
      const endLima   = utcToLimaDate(endTs);
      const days      = daysInRange(startLima, endLima);

      // Fetch days in batches of 4 to avoid hammering Supabase with dozens
      // of simultaneous requests (which triggers statement timeout on large ranges).
      const BATCH = 4;
      const results: DayAvailabilityData[] = [];

      async function fetchDay(date: string): Promise<DayAvailabilityData> {
        const bounds = limaDayBounds(date);
        const f: DashboardFilters = {
          startTs: bounds.start, endTs: bounds.end,
          sites: null, channels: null, zones: null,
          hourMin: 0, hourMax: 23, dows: null,
        };
        const rows = await fetchHourly(f).catch(() => []);
        const hourSet = new Set<number>();
        for (const r of rows) {
          if (r.count > 0 && r.hour >= WIN_START && r.hour <= WIN_END) {
            hourSet.add(r.hour);
          }
        }
        return {
          date,
          onlineHours:   hourSet.size,
          expectedHours: EXPECTED,
          pct: Math.round((hourSet.size / EXPECTED) * 100),
        };
      }

      for (let i = 0; i < days.length; i += BATCH) {
        const batch = await Promise.all(days.slice(i, i + BATCH).map(fetchDay));
        results.push(...batch);
        // Update incrementally so the chart fills in as batches complete
        setDaily([...results]);
      }

      setLoading(false);
    }

    load();
  }, [startTs, endTs]);

  const avgPct = useMemo(
    () => daily.length > 0
      ? Math.round(daily.reduce((s, d) => s + d.pct, 0) / daily.length)
      : 0,
    [daily]
  );

  return { daily, avgPct, loading };
}
