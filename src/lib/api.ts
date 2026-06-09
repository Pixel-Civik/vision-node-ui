import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, TIZKpiRow, ConversionHourRow, GenderRow, AgeRow, TIZRaw, DailyRow } from "./types";
import { rpc, supabase } from "./supabase";

function buildPayload(f: DashboardFilters) {
  return {
    p_start_ts: f.startTs,
    p_end_ts: f.endTs,
    p_sites: f.sites,
    p_channels: f.channels,
    p_zones: f.zones,
    p_hour_min: f.hourMin,
    p_hour_max: f.hourMax,
    p_dows: f.dows,
  };
}

export async function fetchKPIs(f: DashboardFilters): Promise<KPIResult | null> {
  const rows = await rpc<KPIResult>("dashboard_kpi_enter_exit", buildPayload(f));
  return rows[0] ?? null;
}

export async function fetchHourly(f: DashboardFilters): Promise<HourlyRow[]> {
  return rpc<HourlyRow>("dashboard_hourly_totals", buildPayload(f));
}

export async function fetchZoneBreakdown(f: DashboardFilters): Promise<ZoneBreakdownRow[]> {
  return rpc<ZoneBreakdownRow>("dashboard_breakdown_zone", buildPayload(f));
}

export async function fetchChannelBreakdown(f: DashboardFilters): Promise<ChannelBreakdownRow[]> {
  return rpc<ChannelBreakdownRow>("dashboard_breakdown_channel", buildPayload(f));
}

export async function fetchHeatmap(f: DashboardFilters): Promise<HeatmapRow[]> {
  return rpc<HeatmapRow>("dashboard_heatmap_dow_hour", buildPayload(f));
}

export async function fetchTIZKpis(f: DashboardFilters): Promise<TIZKpiRow[]> {
  return rpc<TIZKpiRow>("dashboard_tiz_zone_stats", buildPayload(f));
}

export function computeConversionFromHourly(rows: HourlyRow[]): ConversionHourRow[] {
  const map = new Map<number, { pasantes: number; visitors: number; enters: number }>();
  for (const r of rows) {
    if (!["pasante", "visitor", "enter"].includes(r.event_type)) continue;
    const cur = map.get(r.hour) ?? { pasantes: 0, visitors: 0, enters: 0 };
    if (r.event_type === "pasante") cur.pasantes += r.count;
    if (r.event_type === "visitor") cur.visitors += r.count;
    if (r.event_type === "enter") cur.enters += r.count;
    map.set(r.hour, cur);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, d]) => ({
      hour,
      pasantes: d.pasantes,
      visitors: d.visitors,
      enters: d.enters,
      conv_enter_pct: d.pasantes > 0 ? Math.round((d.enters / d.pasantes) * 1000) / 10 : 0,
      conv_visitor_pct: d.pasantes > 0 ? Math.round((d.visitors / d.pasantes) * 1000) / 10 : 0,
    }));
}

export async function fetchConversionByHour(f: DashboardFilters): Promise<ConversionHourRow[]> {
  return computeConversionFromHourly(await fetchHourly(f));
}

export async function fetchGenderAge(
  startTs: string,
  endTs: string,
  eventTypes: string[]
): Promise<{ gender: GenderRow[]; age: AgeRow[] }> {
  const rows = await rpc<{ dimension: string; value: string; count: number }>(
    "dashboard_gender_age",
    { p_start_ts: startTs, p_end_ts: endTs, p_event_types: eventTypes }
  );
  return {
    gender: rows.filter((r) => r.dimension === "gender").map(({ value: gender, count }) => ({ gender, count })),
    age:    rows.filter((r) => r.dimension === "age").map(({ value: age, count }) => ({ age, count })),
  };
}

export async function fetchTIZDirect(startTs: string, endTs: string): Promise<TIZRaw[]> {
  const { data } = await supabase
    .from("tracking_logs_view")
    .select("time, dwell_sec, zone")
    .eq("event", "visit")
    .gte("time", startTs)
    .lte("time", endTs)
    .not("dwell_sec", "is", null)
    .limit(5000);
  return (data as TIZRaw[]) ?? [];
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

export async function fetchFilterOptions(): Promise<{
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;
  maxDate: string;
}> {
  const rows = await rpc<{ sites: string[]; channels: string[]; zones: string[]; min_date: string; max_date: string }>(
    "dashboard_filter_options", {}
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
