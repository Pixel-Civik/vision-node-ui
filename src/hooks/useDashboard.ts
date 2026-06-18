"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, ConversionHourRow, TIZKpiRow } from "@/lib/types";
import { fetchKPIs, fetchHourly, fetchHourlyAvg, fetchZoneBreakdown, fetchChannelBreakdown, fetchHeatmap, fetchTIZKpis, computeConversionFromHourly } from "@/lib/api";

export interface DashboardData {
  kpis: KPIResult | null;
  hourly: HourlyRow[];
  hourlyAvg: HourlyRow[];
  zoneBreakdown: ZoneBreakdownRow[];
  channelBreakdown: ChannelBreakdownRow[];
  heatmap: HeatmapRow[];
  conversion: ConversionHourRow[];
  tizKpis: TIZKpiRow[];
  loading: boolean;
  error: string | null;
}

export function useDashboard(
  filters: DashboardFilters,
  { enabled = true }: { enabled?: boolean } = {}
): DashboardData & { refresh: () => void } {
  const [data, setData] = useState<Omit<DashboardData, "loading" | "error">>({
    kpis: null,
    hourly: [],
    hourlyAvg: [],
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
    // Wait until the filter has settled (opts loaded + snap applied).
    // This prevents a double-load: first with today's dates, then with minDate.
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      // 1. KPIs — retry up to 2 times on timeout before showing error
      let kpis: KPIResult | null = null;
      for (let attempt = 0; attempt < 3 && kpis === null; attempt++) {
        if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 1500 * attempt));
        if (cancelled) return;
        kpis = await fetchKPIs(filters).catch(() => null);
      }
      if (cancelled) return;
      if (kpis === null) { setError("Error al cargar KPIs"); setLoading(false); return; }
      setData((prev) => ({ ...prev, kpis }));
      setLoading(false);

      // 2–6. Heavy queries run one at a time to avoid DB statement timeout.
      // Each fills in its chart as it arrives — the UI updates progressively.
      const [hourly, rawHourlyAvg] = await Promise.all([
        fetchHourly(filters).catch(() => [] as HourlyRow[]),
        fetchHourlyAvg(filters).catch(() => [] as HourlyRow[]),
      ]);
      if (cancelled) return;

      // If the server-side avg RPC failed, compute per-day avg in the data
      // layer so charts always receive averaged values, never raw totals.
      const days = Math.max(1, kpis.days ?? 1);
      const hourlyAvg: HourlyRow[] =
        rawHourlyAvg.length > 0
          ? rawHourlyAvg
          : days > 1
            ? hourly.map((r) => ({ ...r, count: Math.round(r.count / days) }))
            : hourly;

      setData((prev) => ({ ...prev, hourly, hourlyAvg, conversion: computeConversionFromHourly(hourlyAvg) }));

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
  }, [enabled, filters.startTs, filters.endTs, JSON.stringify(filters.sites), JSON.stringify(filters.channels), JSON.stringify(filters.zones), filters.hourMin, filters.hourMax, JSON.stringify(filters.dows), tick]);

  return { ...data, loading, error, refresh };
}
