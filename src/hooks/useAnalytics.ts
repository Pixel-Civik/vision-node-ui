"use client";

import { useState, useEffect } from "react";
import type { GenderRow, AgeRow, TIZRaw, DashboardFilters } from "@/lib/types";
import { fetchGenderAge, fetchTIZDirect } from "@/lib/api";

export interface AnalyticsData {
  genderEnter: GenderRow[];
  ageEnter: AgeRow[];
  genderVisitor: GenderRow[];
  tizRaw: TIZRaw[];
  analyticsLoading: boolean;
}

export function useAnalytics(filters: DashboardFilters): AnalyticsData {
  const [state, setState] = useState<Omit<AnalyticsData, "analyticsLoading">>({
    genderEnter: [],
    ageEnter: [],
    genderVisitor: [],
    tizRaw: [],
  });
  const [analyticsLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchGenderAge(filters.startTs, filters.endTs, ["enter"]),
      fetchGenderAge(filters.startTs, filters.endTs, ["visitor"]),
      fetchTIZDirect(filters.startTs, filters.endTs),
    ])
      .then(([enterGA, visitorGA, tizRaw]) => {
        if (cancelled) return;
        setState({
          genderEnter: enterGA.gender,
          ageEnter: enterGA.age,
          genderVisitor: visitorGA.gender,
          tizRaw,
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.startTs, filters.endTs]);

  return { ...state, analyticsLoading };
}
