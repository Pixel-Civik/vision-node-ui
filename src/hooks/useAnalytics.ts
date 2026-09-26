"use client";

import { filterKey } from "@/lib/dashboard-filters";
import { useQuery } from "@tanstack/react-query";
import type { GenderRow, AgeRow, TIZDistribution, DashboardFilters } from "@/lib/types";
import { fetchGenderAge, fetchTIZDistribution } from "@/lib/api";

export interface AnalyticsData {
  genderEnter: GenderRow[];
  ageEnter: AgeRow[];
  genderVisitor: GenderRow[];
  tizDistribution: TIZDistribution | null;
  analyticsError: string | null;
  analyticsLoading: boolean;
}

interface AnalyticsOptions {
  genderEnter?: boolean;
  genderVisitor?: boolean;
  tiz?: boolean;
}

/** Cada análisis se consulta y almacena en caché solo al abrir su pestaña. */
export function useAnalytics(
  filters: DashboardFilters,
  options: AnalyticsOptions = { genderEnter: true, genderVisitor: true, tiz: true },
): AnalyticsData {
  const wantEnter = options.genderEnter ?? false;
  const wantVisitor = options.genderVisitor ?? false;
  const wantTiz = options.tiz ?? false;

  const enter = useQuery({
    queryKey: ["analytics", "gender-age", "enter", ...filterKey(filters)],
    queryFn: ({ signal }) => fetchGenderAge(filters, ["enter"], signal),
    enabled: wantEnter,
    staleTime: 5 * 60_000,
  });
  const visitor = useQuery({
    queryKey: ["analytics", "gender-age", "visitor", ...filterKey(filters)],
    queryFn: ({ signal }) => fetchGenderAge(filters, ["visitor"], signal),
    enabled: wantVisitor,
    staleTime: 5 * 60_000,
  });
  const tiz = useQuery({
    queryKey: ["analytics", "tiz-raw", ...filterKey(filters)],
    queryFn: ({ signal }) => fetchTIZDistribution(filters, signal),
    enabled: wantTiz,
    staleTime: 5 * 60_000,
  });

  return {
    genderEnter: enter.data?.gender ?? [],
    ageEnter: enter.data?.age ?? [],
    genderVisitor: visitor.data?.gender ?? [],
    tizDistribution: tiz.data ?? null,
    analyticsError: (wantEnter && enter.error) || (wantVisitor && visitor.error) || (wantTiz && tiz.error)
      ? "No se pudo cargar el análisis de la selección. Reintenta actualizar." : null,
    analyticsLoading:
      (wantEnter && (enter.isPending || enter.isFetching)) ||
      (wantVisitor && (visitor.isPending || visitor.isFetching)) ||
      (wantTiz && (tiz.isPending || tiz.isFetching)),
  };
}
