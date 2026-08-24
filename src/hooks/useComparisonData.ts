"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCompare } from "@/lib/api";
import type { DashboardFilters, KPIResult, HourlyRow, RefPeriod } from "@/lib/types";

export type CompareMode = "prev-day" | "same-dow" | "prev-period" | "prev-month";

export interface SiteRank { site: string; rank: number; total: number }

export interface ComparisonDeltas {
  enters:   number | null; // %
  pasantes: number | null; // %
  convPp:   number | null; // pp
  /** % sobre el promedio por día con datos — comparable entre períodos de
   *  distinta duración, que es lo normal cuando hubo un corte de servicio. */
  entersPerDay:   number | null;
  pasantesPerDay: number | null;
}

export interface ComparisonData {
  refKpis:      KPIResult | null;
  refHourly:    HourlyRow[];
  siteRank:     SiteRank | null;
  loading:      boolean;
  deltas:       ComparisonDeltas;
  curPasantes:  number;
  refPasantes:  number;
  /** Período de referencia que la BD eligió (salta días sin datos). */
  refPeriod:    RefPeriod | null;
}

const EMPTY_DELTAS: ComparisonDeltas = {
  enters: null, pasantes: null, convPp: null,
  entersPerDay: null, pasantesPerDay: null,
};

/**
 * Comparación contra un período de referencia.
 *
 * Antes el período se calculaba restando milisegundos en el cliente
 * (86.400.000 para "día anterior", etc.). Con un hueco en los datos eso caía
 * en días vacíos: la referencia daba 0, pctDelta devolvía null y las tarjetas
 * quedaban en "—".
 *
 * Ahora dashboard_compare resuelve la referencia sobre los días que realmente
 * tienen datos y devuelve los deltas ya calculados. Los parámetros curKpis /
 * curHourly / allSites se mantienen por compatibilidad con los componentes que
 * ya lo llaman así, pero los totales del período actual salen del servidor.
 */
export function useComparisonData(
  filters:   DashboardFilters,
  mode:      CompareMode,
  _curKpis?: KPIResult | null,
  _curHourly?: HourlyRow[],
  _allSites?: string[],
): ComparisonData {
  const { data, isPending, isFetching } = useQuery({
    queryKey: [
      "compare", mode,
      filters.startTs, filters.endTs,
      filters.sites?.join(",") ?? "*",
      filters.channels?.join(",") ?? "*",
      filters.zones?.join(",") ?? "*",
      filters.hourMin, filters.hourMax,
      filters.dows?.join(",") ?? "*",
    ],
    queryFn: ({ signal }) => fetchCompare(filters, mode, signal),
  });

  if (!data) {
    return {
      refKpis: null, refHourly: [], siteRank: null,
      loading: isPending || isFetching,
      deltas: EMPTY_DELTAS,
      curPasantes: 0, refPasantes: 0, refPeriod: null,
    };
  }

  return {
    refKpis:     data.reference?.kpis ?? null,
    refHourly:   data.reference?.hourly ?? [],
    siteRank:    null,   // el ranking entre sedes aún no está implementado en la BD
    loading:     isFetching,
    deltas: {
      enters:         data.deltas.enters,
      pasantes:       data.deltas.pasantes,
      convPp:         data.deltas.conv_pp,
      entersPerDay:   data.deltas.enters_per_day,
      pasantesPerDay: data.deltas.pasantes_per_day,
    },
    curPasantes: data.current.totals.pasantes,
    refPasantes: data.reference?.totals.pasantes ?? 0,
    refPeriod:   data.ref,
  };
}
