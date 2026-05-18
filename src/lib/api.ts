import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, TIZKpiRow, ConversionHourRow } from "./types";
import { rpc } from "./supabase";

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
  return rpc<TIZKpiRow>("dashboard_tiz_zone_stats", {
    p_start_ts: f.startTs,
    p_end_ts: f.endTs,
    p_zones: f.zones,
  });
}

export async function fetchConversionByHour(f: DashboardFilters): Promise<ConversionHourRow[]> {
  const rows = await fetchHourly(f);
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
