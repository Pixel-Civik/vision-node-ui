"use client";

import { useMemo } from "react";
import { useTechnicalHealth } from "@/hooks/useTechnicalHealth";
import type {
  TechnicalCameraRow,
  TechnicalDailyRow,
  TechnicalGapRow,
} from "@/hooks/useTechnicalHealth";

export type GapInterval = TechnicalGapRow;
export type CameraStatus = TechnicalCameraRow;
export type DayAvailability = TechnicalDailyRow;

export interface HourSlot {
  date: string;
  hour: number;
  online: boolean | null;
}

export interface UptimeData {
  cameras: CameraStatus[];
  dailyPct: DayAvailability[];
  hourSlots: HourSlot[];
  gaps: GapInterval[];
  overallPct: number;
  totalGapMin: number;
  loading: boolean;
  error: string | null;
}

/** Conserva el contrato del panel sin transferir eventos crudos. */
export function useUptime(startTs: string, endTs: string): UptimeData {
  const health = useTechnicalHealth(startTs, endTs);
  const derived = useMemo(() => {
    const totalOnline = health.data.daily.reduce((sum, row) => sum + row.onlineHours, 0);
    const totalExpected = health.data.daily.reduce((sum, row) => sum + row.expectedHours, 0);
    return {
      overallPct: totalExpected > 0 ? Math.round(totalOnline / totalExpected * 100) : 100,
      totalGapMin: health.data.gaps.reduce((sum, row) => sum + row.durationMin, 0),
    };
  }, [health.data.daily, health.data.gaps]);

  return {
    cameras: health.data.cameras,
    dailyPct: health.data.daily,
    hourSlots: [],
    gaps: health.data.gaps,
    overallPct: derived.overallPct,
    totalGapMin: derived.totalGapMin,
    loading: health.loading,
    error: health.error,
  };
}
