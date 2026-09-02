"use client";

import { useQuery } from "@tanstack/react-query";
import type { GenderRow, AgeRow, TIZRaw, DashboardFilters } from "@/lib/types";
import { fetchGenderAge, fetchTIZDirect } from "@/lib/api";

export interface AnalyticsData {
  genderEnter: GenderRow[];
  ageEnter: AgeRow[];
  genderVisitor: GenderRow[];
  tizRaw: TIZRaw[];
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
    queryKey: ["analytics", "gender-age", "enter", filters.startTs, filters.endTs],
    queryFn: () => fetchGenderAge(filters.startTs, filters.endTs, ["enter"]),
    enabled: wantEnter,
    staleTime: 5 * 60_000,
  });
  const visitor = useQuery({
    queryKey: ["analytics", "gender-age", "visitor", filters.startTs, filters.endTs],
    queryFn: () => fetchGenderAge(filters.startTs, filters.endTs, ["visitor"]),
    enabled: wantVisitor,
    staleTime: 5 * 60_000,
  });
  const tiz = useQuery({
    queryKey: ["analytics", "tiz-raw", filters.startTs, filters.endTs],
    queryFn: () => fetchTIZDirect(filters.startTs, filters.endTs),
    enabled: wantTiz,
    staleTime: 5 * 60_000,
  });

  return {
    genderEnter: enter.data?.gender ?? [],
    ageEnter: enter.data?.age ?? [],
    genderVisitor: visitor.data?.gender ?? [],
    tizRaw: tiz.data ?? [],
    analyticsLoading:
      (wantEnter && (enter.isPending || enter.isFetching)) ||
      (wantVisitor && (visitor.isPending || visitor.isFetching)) ||
      (wantTiz && (tiz.isPending || tiz.isFetching)),
  };
}
