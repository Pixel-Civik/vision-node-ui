"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, ConversionHourRow, TIZKpiRow } from "@/lib/types";
import { fetchKPIs, fetchHourly, fetchZoneBreakdown, fetchChannelBreakdown, fetchHeatmap, fetchTIZKpis, computeConversionFromHourly } from "@/lib/api";

export interface DashboardData {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  zoneBreakdown: ZoneBreakdownRow[];
  channelBreakdown: ChannelBreakdownRow[];
  heatmap: HeatmapRow[];
  conversion: ConversionHourRow[];
  tizKpis: TIZKpiRow[];
  loading: boolean;
  error: string | null;
}

export function useDashboard(filters: DashboardFilters): DashboardData & { refresh: () => void } {
  const [data, setData] = useState<Omit<DashboardData, "loading" | "error">>({
    kpis: null,
    hourly: [],
    zoneBreakdown: [],
    channelBreakdown: [],
    heatmap: [],
    conversion: [],
    tizKpis: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Critical fetches — failure blocks the dashboard
    const criticalFetch = Promise.all([
      fetchKPIs(filters),
      fetchHourly(filters),
    ]);

    // Heavy aggregation RPCs — timeout-prone; fail gracefully with empty arrays
    const safeFetch = Promise.all([
      fetchHeatmap(filters).catch(()          => [] as HeatmapRow[]),
      fetchZoneBreakdown(filters).catch(()    => [] as ZoneBreakdownRow[]),
      fetchChannelBreakdown(filters).catch(() => [] as ChannelBreakdownRow[]),
      fetchTIZKpis(filters).catch(()          => [] as TIZKpiRow[]),
    ]);

    criticalFetch
      .then(([kpis, hourly]) => {
        if (cancelled) return;
        const conversion = computeConversionFromHourly(hourly);
        // Render KPIs + hourly charts immediately
        setData((prev) => ({ ...prev, kpis, hourly, conversion }));
        setLoading(false);

        // Heavy data fills in when ready (may be slow or fail silently)
        safeFetch.then(([heatmap, zoneBreakdown, channelBreakdown, tizKpis]) => {
          if (!cancelled)
            setData((prev) => ({ ...prev, heatmap, zoneBreakdown, channelBreakdown, tizKpis }));
        });
      })
      .catch((e) => {
        if (!cancelled) { setError(String(e)); setLoading(false); }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startTs, filters.endTs, JSON.stringify(filters.sites), JSON.stringify(filters.channels), JSON.stringify(filters.zones), filters.hourMin, filters.hourMax, JSON.stringify(filters.dows), tick]);

  return { ...data, loading, error, refresh };
}
