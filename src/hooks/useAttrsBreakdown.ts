"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAttrsBreakdown } from "@/lib/api";
import type { AttrsBreakdown, AttrsGranularity, DashboardFilters } from "@/lib/types";

/**
 * Entradas por niño/adulto y hombre/mujer para el período filtrado.
 * Mismos filtros que el resto del reporte; se cachea por filtros + granularidad.
 */
export function useAttrsBreakdown(
  filters: DashboardFilters,
  granularity: AttrsGranularity,
  enabled = true,
) {
  const query = useQuery<AttrsBreakdown>({
    queryKey: [
      "attrs-breakdown", granularity, filters.startTs, filters.endTs,
      filters.sites?.join(",") ?? "*",
      filters.channels?.join(",") ?? "*",
      filters.zones?.join(",") ?? "*",
      filters.hourMin, filters.hourMax,
      filters.dows?.join(",") ?? "*",
    ],
    queryFn: ({ signal }) => fetchAttrsBreakdown(filters, granularity, signal),
    enabled,
    staleTime: 5 * 60_000,
  });
  return {
    data: query.data ?? null,
    loading: enabled && (query.isPending || query.isFetching),
    error: query.error instanceof Error ? query.error.message : null,
  };
}
