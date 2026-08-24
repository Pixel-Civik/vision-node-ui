"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type {
  DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow,
  ChannelBreakdownRow, HeatmapRow, ConversionHourRow, TIZKpiRow, Totals,
} from "@/lib/types";
import { fetchOverview, EMPTY_OVERVIEW } from "@/lib/api";

export interface DashboardData {
  kpis: KPIResult | null;
  totals: Totals;
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

/**
 * Clave de caché estable. El orden de las propiedades de un objeto afecta a
 * JSON.stringify, así que se enumeran explícitamente: dos filtros equivalentes
 * deben producir la misma clave o la caché nunca acierta.
 */
export function dashboardKey(f: DashboardFilters) {
  return [
    "overview",
    f.startTs, f.endTs,
    f.sites?.join(",") ?? "*",
    f.channels?.join(",") ?? "*",
    f.zones?.join(",") ?? "*",
    f.hourMin, f.hourMax,
    f.dows?.join(",") ?? "*",
  ] as const;
}

/**
 * Todo el dashboard en una sola consulta.
 *
 * Antes: 6 RPCs encadenados con `await`, cada uno con hasta 3 reintentos y
 * esperas de 1,5 s/3 s entre ellos. Un timeout a mitad de la cadena dejaba el
 * resto sin cargar, y el flag `cancelled` descartaba el resultado pero la
 * consulta seguía viva en el servidor.
 *
 * Ahora: un RPC (dashboard_overview) que agrega en el servidor, con caché,
 * deduplicación y cancelación real vía AbortSignal.
 */
export function useDashboard(
  filters: DashboardFilters,
  { enabled = true }: { enabled?: boolean } = {}
): DashboardData & { refresh: () => void } {
  const qc = useQueryClient();

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: dashboardKey(filters),
    queryFn: ({ signal }) => fetchOverview(filters, signal),
    enabled,
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["overview"] });
  }, [qc]);

  const o = data ?? EMPTY_OVERVIEW;

  return {
    kpis:             data ? o.kpis : null,
    totals:           o.totals,
    hourly:           o.hourly,
    hourlyAvg:        o.hourly_avg,
    zoneBreakdown:    o.zones,
    channelBreakdown: o.channels,
    heatmap:          o.heatmap,
    conversion:       o.conversion,
    tizKpis:          o.tiz,
    // isPending = aún no hay ningún dato; isFetching = revalidando en segundo
    // plano. Se marca cargando en ambos casos, pero con placeholderData los
    // datos previos siguen en pantalla en vez de parpadear a vacío.
    loading:          enabled && (isPending || isFetching),
    error:            error ? "Error al cargar los datos del período" : null,
    refresh,
  };
}
