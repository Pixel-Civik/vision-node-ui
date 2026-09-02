"use client";

import { useMemo } from "react";
import { useTechnicalHealth } from "@/hooks/useTechnicalHealth";

export interface DayAvailabilityData {
  date: string;
  pct: number;
  onlineHours: number;
  expectedHours: number;
}

/** Un rango completo comparte una sola RPC con useUptime. */
export function useAvailability(startTs: string, endTs: string) {
  const health = useTechnicalHealth(startTs, endTs);
  const daily = health.data.daily;
  const avgPct = useMemo(
    () => daily.length > 0
      ? Math.round(daily.reduce((sum, row) => sum + row.pct, 0) / daily.length)
      : 0,
    [daily],
  );

  return {
    daily,
    hourly: health.data.hourly,
    avgPct,
    loading: health.loading,
    error: health.error,
  };
}
