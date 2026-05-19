import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, TIZKpiRow, ConversionHourRow, GenderRow, AgeRow, TIZRaw } from "./types";
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
  const { data } = await supabase.rpc("dashboard_tiz_zone_stats", {
    p_start_ts: f.startTs,
    p_end_ts: f.endTs,
    p_zones: f.zones,
  });
  return (data as TIZKpiRow[]) ?? [];
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
  const { data } = await supabase
    .from("tracking_logs_view")
    .select("gender, age, event_type")
    .gte("ts", startTs)
    .lte("ts", endTs)
    .in("event_type", eventTypes)
    .not("gender", "is", null)
    .limit(5000);

  if (!data) return { gender: [], age: [] };

  const gMap = new Map<string, number>();
  const aMap = new Map<string, number>();
  for (const r of data) {
    if (r.gender && r.gender !== "genero_no_detectado") gMap.set(r.gender, (gMap.get(r.gender) ?? 0) + 1);
    if (r.age && r.age !== "edad_no_detectada") aMap.set(r.age, (aMap.get(r.age) ?? 0) + 1);
  }

  return {
    gender: Array.from(gMap.entries()).map(([gender, count]) => ({ gender, count })).sort((a, b) => b.count - a.count),
    age: Array.from(aMap.entries()).map(([age, count]) => ({ age, count })).sort((a, b) => b.count - a.count),
  };
}

export async function fetchTIZDirect(startTs: string, endTs: string): Promise<TIZRaw[]> {
  const { data } = await supabase
    .from("tracking_logs_view")
    .select("ts, duration_s, zone_name")
    .eq("event_type", "visit")
    .gte("ts", startTs)
    .lte("ts", endTs)
    .not("duration_s", "is", null)
    .limit(5000);
  return (data as TIZRaw[]) ?? [];
}

export async function fetchFilterOptions(): Promise<{
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;
  maxDate: string;
}> {
  const { data } = await import("./supabase").then((m) =>
    m.supabase
      .from("tracking_logs_view")
      .select("site,channel,zone_name,ts")
      .order("ts", { ascending: true })
      .limit(1)
  );
  const { data: last } = await import("./supabase").then((m) =>
    m.supabase
      .from("tracking_logs_view")
      .select("ts")
      .order("ts", { ascending: false })
      .limit(1)
  );

  const { data: opts } = await import("./supabase").then((m) =>
    m.supabase.from("tracking_logs_view").select("site,channel,zone_name")
  );

  const sites = [...new Set((opts ?? []).map((r: Record<string, string>) => r.site).filter(Boolean))].sort() as string[];
  const channels = [...new Set((opts ?? []).map((r: Record<string, string>) => r.channel).filter(Boolean))].sort() as string[];
  const zones = [...new Set((opts ?? []).map((r: Record<string, string>) => r.zone_name).filter(Boolean))].sort() as string[];

  return {
    sites,
    channels,
    zones,
    minDate: data?.[0]?.ts?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    maxDate: last?.[0]?.ts?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  };
}
