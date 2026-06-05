"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchKPIs, fetchHourly } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { DashboardFilters, KPIResult, HourlyRow } from "@/lib/types";

export type CompareMode = "prev-day" | "same-dow" | "prev-period";

export function buildRefFilters(f: DashboardFilters, mode: CompareMode): DashboardFilters {
  const startMs  = new Date(f.startTs).getTime();
  const endMs    = new Date(f.endTs).getTime();
  const duration = endMs - startMs;

  const shift =
    mode === "prev-day"  ? 86_400_000 :
    mode === "same-dow"  ? 7 * 86_400_000 :
    /* prev-period */      duration + 86_400_000;

  return {
    ...f,
    startTs: new Date(startMs - shift).toISOString(),
    endTs:   new Date(endMs   - shift).toISOString(),
  };
}

function sumByType(rows: HourlyRow[], type: string): number {
  return rows.filter((r) => r.event_type === type).reduce((s, r) => s + r.count, 0);
}

function pctDelta(cur: number, ref: number): number | null {
  if (!ref) return null;
  return Math.round(((cur - ref) / ref) * 1000) / 10;
}

export interface SiteRank { site: string; rank: number; total: number }

export interface ComparisonDeltas {
  enters:   number | null; // %
  pasantes: number | null; // %
  convPp:   number | null; // pp
}

export interface ComparisonData {
  refKpis:      KPIResult | null;
  refHourly:    HourlyRow[];
  siteRank:     SiteRank | null;
  loading:      boolean;
  deltas:       ComparisonDeltas;
  curPasantes:  number;
  refPasantes:  number;
}

export function useComparisonData(
  filters:   DashboardFilters,
  mode:      CompareMode,
  curKpis:   KPIResult | null,
  curHourly: HourlyRow[],
  allSites:  string[],
): ComparisonData {
  const [refKpis,   setRefKpis]   = useState<KPIResult | null>(null);
  const [refHourly, setRefHourly] = useState<HourlyRow[]>([]);
  const [siteRank,  setSiteRank]  = useState<SiteRank | null>(null);
  const [loading,   setLoading]   = useState(true);

  const refFilters = useMemo(
    () => buildRefFilters(filters, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.startTs, filters.endTs, mode],
  );

  useEffect(() => {
    setLoading(true);
    let cancelled = false;

    async function load() {
      const [rk, rh] = await Promise.all([
        fetchKPIs(refFilters),
        fetchHourly(refFilters),
      ]);
      if (cancelled) return;
      setRefKpis(rk);
      setRefHourly(rh);

      // Ranking — only meaningful with multiple sites in the project
      if (allSites.length > 1) {
        const { data } = await supabase
          .from("tracking_logs_view")
          .select("site")
          .eq("event", "enter")
          .gte("time", filters.startTs)
          .lte("time", filters.endTs)
          .limit(200_000);

        if (!cancelled) {
          const counts = new Map<string, number>();
          for (const r of (data ?? []) as { site: string }[]) {
            if (r.site) counts.set(r.site, (counts.get(r.site) ?? 0) + 1);
          }
          const sorted  = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          const current = filters.sites?.[0] ?? sorted[0]?.[0] ?? "";
          const idx     = sorted.findIndex(([s]) => s === current);
          setSiteRank(idx >= 0 ? { site: current, rank: idx + 1, total: sorted.length } : null);
        }
      } else {
        setSiteRank(null);
      }

      if (!cancelled) setLoading(false);
    }

    load().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refFilters.startTs, refFilters.endTs, filters.startTs, filters.endTs, allSites.length]);

  const curPasantes = useMemo(() => sumByType(curHourly, "pasante"), [curHourly]);
  const refPasantes = useMemo(() => sumByType(refHourly, "pasante"), [refHourly]);

  const deltas = useMemo<ComparisonDeltas>(() => {
    const curEnters = curKpis?.enters ?? 0;
    const refEnters = refKpis?.enters ?? 0;
    const curConv   = curPasantes > 0 ? curEnters / curPasantes : null;
    const refConv   = refPasantes > 0 ? refEnters / refPasantes : null;
    return {
      enters:   pctDelta(curEnters, refEnters),
      pasantes: pctDelta(curPasantes, refPasantes),
      convPp:   curConv != null && refConv != null
        ? Math.round((curConv - refConv) * 10000) / 100
        : null,
    };
  }, [curKpis, refKpis, curPasantes, refPasantes]);

  return { refKpis, refHourly, siteRank, loading, deltas, curPasantes, refPasantes };
}
