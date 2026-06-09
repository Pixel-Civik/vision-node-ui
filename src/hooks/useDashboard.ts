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

    async function load() {
      // 1. KPIs — unblock the UI first
      const kpis = await fetchKPIs(filters).catch(() => null);
      if (cancelled) return;
      if (kpis === null) { setError("Error al cargar KPIs"); setLoading(false); return; }
      setData((prev) => ({ ...prev, kpis }));
      setLoading(false);

      // 2–6. Heavy queries run one at a time to avoid DB statement timeout.
      // Each fills in its chart as it arrives — the UI updates progressively.
      const hourly = await fetchHourly(filters).catch(() => [] as HourlyRow[]);
      if (cancelled) return;
      setData((prev) => ({ ...prev, hourly, conversion: computeConversionFromHourly(hourly) }));

      const zoneBreakdown = await fetchZoneBreakdown(filters).catch(() => [] as ZoneBreakdownRow[]);
      if (cancelled) return;
      setData((prev) => ({ ...prev, zoneBreakdown }));

      const channelBreakdown = await fetchChannelBreakdown(filters).catch(() => [] as ChannelBreakdownRow[]);
      if (cancelled) return;
      setData((prev) => ({ ...prev, channelBreakdown }));

      const heatmap = await fetchHeatmap(filters).catch(() => [] as HeatmapRow[]);
      if (cancelled) return;
      setData((prev) => ({ ...prev, heatmap }));

      const tizKpis = await fetchTIZKpis(filters).catch(() => [] as TIZKpiRow[]);
      if (!cancelled) setData((prev) => ({ ...prev, tizKpis }));
    }

    load();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startTs, filters.endTs, JSON.stringify(filters.sites), JSON.stringify(filters.channels), JSON.stringify(filters.zones), filters.hourMin, filters.hourMax, JSON.stringify(filters.dows), tick]);

  return { ...data, loading, error, refresh };
}
