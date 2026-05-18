export type EventType = "enter" | "exit" | "pasante" | "visitor" | "visit";

export interface TrackingEvent {
  site: string;
  channel: string;
  camera_name: string | null;
  event_type: EventType;
  zone_name: string | null;
  ts: string;
  track_id: string | null;
  gender: string | null;
  age: string | null;
  duration_s: number | null;
}

export interface KPIResult {
  enters: number;
  exits: number;
  net: number;
  unique_tracks: number;
  days: number;
  enters_per_day: number;
  exits_per_day: number;
}

export interface HourlyRow {
  hour: number;
  event_type: EventType;
  count: number;
}

export interface ZoneBreakdownRow {
  zone: string;
  event_type: EventType;
  count: number;
}

export interface ChannelBreakdownRow {
  channel: string;
  event_type: EventType;
  count: number;
}

export interface HeatmapRow {
  dow: number;
  hour: number;
  count: number;
}

export interface TIZKpiRow {
  zone: string;
  count: number;
  avg_s: number;
  median_s: number;
  p90_s: number;
}

export interface DashboardFilters {
  startTs: string;
  endTs: string;
  sites: string[] | null;
  channels: string[] | null;
  zones: string[] | null;
  hourMin: number;
  hourMax: number;
  dows: number[] | null;
}

export interface ConversionHourRow {
  hour: number;
  pasantes: number;
  visitors: number;
  enters: number;
  conv_enter_pct: number;
  conv_visitor_pct: number;
}
