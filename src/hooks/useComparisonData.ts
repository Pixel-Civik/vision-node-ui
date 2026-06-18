"use client";

import { useState, useEffect, useMemo } from "react";
import { fetchKPIs, fetchHourly } from "@/lib/api";
import type { DashboardFilters, KPIResult, HourlyRow } from "@/lib/types";

export type CompareMode = "prev-day" | "same-dow" | "prev-period";

export function buildRefFilters(f: DashboardFilters, mode: CompareMode): DashboardFilters {
  const startMs  = new Date(f.startTs).getTime();
  const endMs    = new Date(f.endTs).getTime();
  const duration = endMs - startMs;
  const now      = Date.now();

  const shift =
    mode === "prev-day"  ? 86_400_000 :
    mode === "same-dow"  ? 7 * 86_400_000 :
    /* prev-period */      duration + 86_400_000;

  // When the period includes today (endTs is in the future), cap the reference
  // end to the same elapsed moment so comparison is apples-to-apples:
  // e.g. today 7am–10am  vs  yesterday 7am–10am  (not yesterday's full day).
  const refEndMs = endMs > now ? now - shift : endMs - shift;

  return {
    ...f,
    startTs: new Date(startMs  - shift).toISOString(),
    endTs:   new Date(refEndMs).toISOString(),
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
      const rk = await fetchKPIs(refFilters).catch(() => null);
      if (cancelled) return;
      setRefKpis(rk);

      const rh = await fetchHourly(refFilters).catch(() => [] as HourlyRow[]);
      if (cancelled) return;
      setRefHourly(rh);
      setSiteRank(null);

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
