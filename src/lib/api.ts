import type { DashboardFilters, KPIResult, HourlyRow, GenderRow, AgeRow, TIZDistribution, DailyRow, OverviewResult, CompareResult, DefaultRange } from "./types";
import { rpc, rpcOne } from "./supabase";

import { filterPayload as buildPayload } from "./dashboard-filters";

const EMPTY_KPI: KPIResult = { enters: 0, exits: 0, net: 0, unique_tracks: 0, days: 0, enters_per_day: 0, exits_per_day: 0 };

export const EMPTY_OVERVIEW: OverviewResult = {
  kpis: EMPTY_KPI,
  totals: { visitors: 0, pasantes: 0, conv: null },
  hourly: [], hourly_avg: [], conversion: [],
  zones: [], channels: [], heatmap: [], tiz: [],
};

// ── RPCs v7 — la lógica vive en la BD ────────────────────────────────────────

/**
 * Un solo round-trip para todo el dashboard. Sustituyó a una cadena en serie de
 * seis llamadas y trae ya calculados totals, hourly_avg y conversion, que antes
 * se derivaban en JS. Aquellas funciones se eliminaron al quedar sin uso.
 */
export async function fetchOverview(f: DashboardFilters, signal?: AbortSignal): Promise<OverviewResult> {
  const data = await rpcOne<OverviewResult | null>("dashboard_overview", buildPayload(f), signal);
  return data ?? EMPTY_OVERVIEW;
}

/**
 * Comparación contra el período de referencia. La BD elige la referencia
 * saltando los días sin datos, así que un corte de servicio ya no produce
 * deltas contra cero.
 */
export async function fetchCompare(
  f: DashboardFilters, mode: string, signal?: AbortSignal
): Promise<CompareResult | null> {
  return rpcOne<CompareResult | null>(
    "dashboard_compare", { ...buildPayload(f), p_mode: mode }, signal
  );
}

/** Rango con el que abre el dashboard (mes en curso, o el último con datos). */
export async function fetchDefaultRange(signal?: AbortSignal): Promise<DefaultRange | null> {
  const rows = await rpc<DefaultRange>("dashboard_default_range", {}, signal);
  return rows[0] ?? null;
}

/** Días que realmente tienen datos — puntos del calendario. */
export async function fetchDataDays(
  from?: string, to?: string, signal?: AbortSignal
): Promise<string[]> {
  const rows = await rpc<{ day: string; events: number }>(
    "dashboard_data_days", { p_from: from ?? null, p_to: to ?? null }, signal
  );
  return rows.map((r) => r.day);
}

export async function fetchKPIs(f: DashboardFilters): Promise<KPIResult | null> {
  const rows = await rpc<KPIResult>("dashboard_kpi_enter_exit", buildPayload(f));
  // Return zero-filled KPIResult when the period has no data (empty rows).
  // null is reserved for actual RPC errors (caught upstream and retried).
  return rows[0] ?? EMPTY_KPI;
}

export async function fetchHourly(f: DashboardFilters): Promise<HourlyRow[]> {
  return rpc<HourlyRow>("dashboard_hourly_totals", buildPayload(f));
}








export async function fetchGenderAge(
  filters: DashboardFilters,
  eventTypes: string[],
  signal?: AbortSignal
): Promise<{ gender: GenderRow[]; age: AgeRow[] }> {
  const rows = await rpc<{ dimension: string; value: string; count: number }>(
    "dashboard_gender_age_filtered",
    { ...buildPayload(filters), p_event_types: eventTypes }, signal
  );
  return {
    gender: rows.filter((r) => r.dimension === "gender").map(({ value: gender, count }) => ({ gender, count })),
    age:    rows.filter((r) => r.dimension === "age").map(({ value: age, count }) => ({ age, count })),
  };
}

/** Exact aggregate distribution, including every matching dwell event. */
export async function fetchTIZDistribution(filters: DashboardFilters, signal?: AbortSignal): Promise<TIZDistribution> {
  return rpcOne<TIZDistribution>("dashboard_tiz_distribution", buildPayload(filters), signal);
}

export async function fetchFreshness(signal?: AbortSignal): Promise<{ last_event_at: string | null; queried_at: string }> {
  return rpcOne("dashboard_freshness", {}, signal);
}

export async function fetchDailyTotals(f: DashboardFilters): Promise<DailyRow[]> {
  return rpc<DailyRow>("dashboard_daily_totals", buildPayload(f));
}

export interface DailyTrendRow {
  date:     string;
  enters:   number;
  pasantes: number;
  conv:     number;
}

export async function fetchDailyTrends(f: DashboardFilters): Promise<DailyTrendRow[]> {
  return rpc<DailyTrendRow>("dashboard_daily_trend", buildPayload(f));
}

export async function fetchFilterOptions(signal?: AbortSignal): Promise<{
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;
  maxDate: string;
}> {
  const rows = await rpc<{ sites: string[]; channels: string[]; zones: string[]; min_date: string; max_date: string }>(
    "dashboard_filter_options", {}, signal
  );
  const row = rows[0];
  const today = new Date().toISOString().slice(0, 10);
  return {
    sites:    row?.sites    ?? [],
    channels: row?.channels ?? [],
    zones:    row?.zones    ?? [],
    minDate:  row?.min_date ?? today,
    maxDate:  row?.max_date ?? today,
  };
}
