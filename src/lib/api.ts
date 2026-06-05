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
  // dashboard_tiz_zone_stats RPC references wrong column — query view directly
  const { data } = await supabase
    .from("tracking_logs_view")
    .select("zone, dwell_sec")
    .eq("event", "visit")
    .gte("time", f.startTs)
    .lte("time", f.endTs)
    .not("dwell_sec", "is", null)
    .limit(50000);

  if (!data || data.length === 0) return [];

  // Group by zone and compute stats client-side
  const groups = new Map<string, number[]>();
  for (const r of data as { zone: string | null; dwell_sec: number }[]) {
    const z = r.zone ?? "sin zona";
    if (!groups.has(z)) groups.set(z, []);
    groups.get(z)!.push(r.dwell_sec);
  }

  return [...groups.entries()].map(([zone, vals]) => {
    const sorted = vals.slice().sort((a, b) => a - b);
    const avg    = vals.reduce((s, v) => s + v, 0) / vals.length;
    const mid    = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    const p90idx = Math.ceil(0.9 * sorted.length) - 1;
    const p90    = sorted[Math.max(0, p90idx)];
    return { zone, count: vals.length, avg_s: avg, median_s: median, p90_s: p90 };
  }).sort((a, b) => b.count - a.count);
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
    .select("gender, age, event")
    .gte("time", startTs)
    .lte("time", endTs)
    .in("event", eventTypes)
    .not("gender", "is", null)
    .limit(5000);

  if (!data) return { gender: [], age: [] };

  const gMap = new Map<string, number>();
  const aMap = new Map<string, number>();
  for (const r of data as { gender: string | null; age: string | null }[]) {
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
    .select("time, dwell_sec, zone")
    .eq("event", "visit")
    .gte("time", startTs)
    .lte("time", endTs)
    .not("dwell_sec", "is", null)
    .limit(5000);
  return (data as TIZRaw[]) ?? [];
}

export async function fetchDailyTotals(f: DashboardFilters): Promise<DailyRow[]> {
  const { data } = await supabase
    .from("tracking_logs_view")
    .select("time, event")
    .gte("time", f.startTs)
    .lte("time", f.endTs)
    .in("event", ["enter", "exit"])
    .limit(100000);

  if (!data) return [];

  const map = new Map<string, { enters: number; exits: number }>();
  for (const r of data as { time: string; event: string }[]) {
    const limaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" })
      .format(new Date(r.time));
    const cur = map.get(limaDate) ?? { enters: 0, exits: 0 };
    if (r.event === "enter") cur.enters++;
    else if (r.event === "exit") cur.exits++;
    map.set(limaDate, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, enters: v.enters, exits: v.exits }));
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
  const { data } = await import("./supabase").then((m) =>
    m.supabase
      .from("tracking_logs_view")
      .select("site,channel,zone,time")
      .order("time", { ascending: true })
      .limit(1)
  );
  const { data: last } = await import("./supabase").then((m) =>
    m.supabase
      .from("tracking_logs_view")
      .select("time")
      .order("time", { ascending: false })
      .limit(1)
  );

  const { data: opts } = await import("./supabase").then((m) =>
    m.supabase.from("tracking_logs_view").select("site,channel,zone")
  );

  const sites = [...new Set((opts ?? []).map((r: Record<string, string>) => r.site).filter(Boolean))].sort() as string[];
  const channels = [...new Set((opts ?? []).map((r: Record<string, string>) => r.channel).filter(Boolean))].sort() as string[];
  const zones = [...new Set((opts ?? []).map((r: Record<string, string>) => r.zone).filter(Boolean))].sort() as string[];

  return {
    sites,
    channels,
    zones,
    minDate: data?.[0]?.time?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    maxDate: last?.[0]?.time?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  };
}
