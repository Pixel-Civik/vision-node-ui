"use client";

import { useQuery } from "@tanstack/react-query";
import { rpcOne } from "@/lib/supabase";

export interface TechnicalDailyRow {
  date: string;
  onlineHours: number;
  expectedHours: number;
  pct: number;
}

export interface TechnicalHourlyRow {
  date: string;
  hour: number;
  count: number;
}

export interface TechnicalGapRow {
  date: string;
  fromIso: string;
  toIso: string;
  fromLabel: string;
  toLabel: string;
  durationMin: number;
}

export interface TechnicalCameraRow {
  channel: string;
  cameraName: string;
  lastSeen: string;
  totalEvents: number;
  enterEvents: number;
  pasanteEvents: number;
  pct: number;
}

export interface TechnicalHealthResult {
  daily: TechnicalDailyRow[];
  hourly: TechnicalHourlyRow[];
  gaps: TechnicalGapRow[];
  cameras: TechnicalCameraRow[];
}

const EMPTY: TechnicalHealthResult = {
  daily: [], hourly: [], gaps: [], cameras: [],
};

/** Una respuesta agregada sustituye hasta 1.000.000 de eventos crudos. */
export function useTechnicalHealth(startTs: string, endTs: string) {
  const query = useQuery({
    queryKey: ["technical-health", startTs, endTs],
    queryFn: ({ signal }) => rpcOne<TechnicalHealthResult>(
      "dashboard_technical_health",
      { p_start_ts: startTs, p_end_ts: endTs },
      signal,
    ),
    enabled: Boolean(startTs && endTs),
    staleTime: 5 * 60_000,
  });

  return {
    data: query.data ?? EMPTY,
    loading: query.isPending || query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
