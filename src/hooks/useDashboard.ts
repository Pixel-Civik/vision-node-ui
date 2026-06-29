"use client";

import { useState, useEffect, useCallback } from "react";
import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, ConversionHourRow, TIZKpiRow } from "@/lib/types";
import { fetchKPIs, fetchHourly, fetchZoneBreakdown, fetchChannelBreakdown, fetchHeatmap, fetchTIZKpis, computeConversionFromHourly } from "@/lib/api";

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

// Reintenta una consulta RPC ante timeouts del servidor y registra cada intento
// en consola, para poder *verificar* la carga (duración y fallos por consulta).
// Devuelve null solo si agota los reintentos o si el efecto fue cancelado.
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  isCancelled: () => boolean,
  attempts = 3,
): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 1500 * attempt));
    if (isCancelled()) return null;
    const t0 = Date.now();
    try {
      const result = await fn();
      console.info(`[carga] ${label} ✓ ${Date.now() - t0}ms (intento ${attempt + 1}/${attempts})`);
      return result;
    } catch (e) {
      console.warn(`[carga] ${label} ✗ intento ${attempt + 1}/${attempts} (${Date.now() - t0}ms):`, e instanceof Error ? e.message : e);
    }
  }
  console.error(`[carga] ${label} agotó ${attempts} intentos — se muestra vacío`);
  return null;
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
      const isCancelled = () => cancelled;
      console.info(`[carga] ▶ inicio (${filters.startTs.slice(0, 10)} → ${filters.endTs.slice(0, 10)})`);

      // 1. KPIs — obligatorio. Si falla tras los reintentos, mostramos error.
      const kpis = await withRetry("kpis", () => fetchKPIs(filters), isCancelled);
      if (cancelled) return;
      if (kpis === null) { setError("Error al cargar KPIs"); setLoading(false); return; }
      setData((prev) => ({ ...prev, kpis }));
      // Keep loading=true until hourly data arrives so chart skeletons remain
      // visible — setting it false here would cause a "sin datos" flash.

      // 2–5. Heavy queries run one at a time to avoid DB statement timeout.
      // Cada una reintenta ante timeout y queda registrada en consola.
      const hourly = (await withRetry("hourly", () => fetchHourly(filters), isCancelled)) ?? [];
      if (cancelled) return;

      // El promedio por día se calcula acá (total ÷ días), no vía RPC. La función
      // dashboard_hourly_avg daba timeout (500) en rangos grandes; este cálculo da
      // el mismo resultado, elimina ese error y ahorra una consulta (carga más rápida).
      const days = Math.max(1, kpis.days ?? 1);
      const hourlyAvg: HourlyRow[] =
        days > 1 ? hourly.map((r) => ({ ...r, count: Math.round(r.count / days) })) : hourly;

      setData((prev) => ({ ...prev, hourly, hourlyAvg, conversion: computeConversionFromHourly(hourlyAvg) }));
      if (!cancelled) setLoading(false);

      const zoneBreakdown = (await withRetry("zoneBreakdown", () => fetchZoneBreakdown(filters), isCancelled)) ?? [];
      if (cancelled) return;
      setData((prev) => ({ ...prev, zoneBreakdown }));

      const channelBreakdown = (await withRetry("channelBreakdown", () => fetchChannelBreakdown(filters), isCancelled)) ?? [];
      if (cancelled) return;
      setData((prev) => ({ ...prev, channelBreakdown }));

      const heatmap = (await withRetry("heatmap", () => fetchHeatmap(filters), isCancelled)) ?? [];
      if (cancelled) return;
      setData((prev) => ({ ...prev, heatmap }));

      const tizKpis = (await withRetry("tizKpis", () => fetchTIZKpis(filters), isCancelled)) ?? [];
      if (!cancelled) setData((prev) => ({ ...prev, tizKpis }));
      if (!cancelled) console.info("[carga] ■ completado");
    }

    load();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filters.startTs, filters.endTs, JSON.stringify(filters.sites), JSON.stringify(filters.channels), JSON.stringify(filters.zones), filters.hourMin, filters.hourMax, JSON.stringify(filters.dows), tick]);

  return { ...data, loading, error, refresh };
}
