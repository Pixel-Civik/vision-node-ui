"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, ConversionHourRow, TIZKpiRow } from "@/lib/types";
import { fetchKPIs, fetchHourly, fetchZoneBreakdown, fetchChannelBreakdown, fetchHeatmap, fetchConversionByHour, fetchTIZKpis } from "@/lib/api";

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

    Promise.all([
      fetchKPIs(filters),
      fetchHourly(filters),
      fetchZoneBreakdown(filters),
      fetchChannelBreakdown(filters),
      fetchHeatmap(filters),
      fetchConversionByHour(filters),
      fetchTIZKpis(filters),
    ])
      .then(([kpis, hourly, zoneBreakdown, channelBreakdown, heatmap, conversion, tizKpis]) => {
        if (cancelled) return;
        setData({ kpis, hourly, zoneBreakdown, channelBreakdown, heatmap, conversion, tizKpis });
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startTs, filters.endTs, JSON.stringify(filters.sites), JSON.stringify(filters.channels), JSON.stringify(filters.zones), filters.hourMin, filters.hourMax, JSON.stringify(filters.dows), tick]);

  return { ...data, loading, error, refresh };
}
