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

export interface GenderRow { gender: string; count: number; }
export interface AgeRow { age: string; count: number; }
/** Etiquetas de atributos que deja el contador edge (null = sin etiqueta). */
export type AgeLabel = "nino" | "adulto" | null;
export type GenderLabel = "hombre" | "mujer" | null;
export type AttrsGranularity = "hour" | "day";

/** Entradas de un bucket (hora "HH" o día "YYYY-MM-DD", hora Lima) por etiqueta. */
export interface AttrBucketRow {
  bucket: string;
  age: AgeLabel;
  gender: GenderLabel;
  count: number;
}

export interface AttrsBreakdown {
  granularity: AttrsGranularity;
  rows: AttrBucketRow[];
  /** "rpc" = agregado en la BD; "client" = respaldo calculado en el navegador. */
  source: "rpc" | "client";
  /** Solo el respaldo: se alcanzó el tope de filas y los conteos son parciales. */
  truncated: boolean;
}

export interface TIZRaw { time: string; dwell_sec: number; zone: string | null; }

export interface DailyRow {
  date: string;   // YYYY-MM-DD (hora Lima)
  enters: number;
  exits: number;
}

export type ShopliftingAlertStatus = "new" | "confirmed" | "dismissed";

export interface ShopliftingAlert {
  id: string;
  site: string;
  camera_id: string;
  camera_name: string | null;
  occurred_at: string;
  risk_score: number;
  risk_reasons: string[];
  status: ShopliftingAlertStatus;
  video_path?: string | null;
  video_status: "none" | "pending" | "ready" | "failed";
  video_uploaded_at: string | null;
  video_size_bytes: number | null;
  thumbnail_path: string | null;
  duration_sec: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
  thumbnail_url?: string | null;
}

// ── Contratos de los RPCs v7 (lógica servidor) ───────────────────────────────

/** Totales que antes se recorrían a mano en page.tsx sobre data.hourly. */
export interface Totals {
  visitors: number;
  pasantes: number;
  conv: number | null;   // % visitors/pasantes
}

/** Respuesta de dashboard_overview — reemplaza 6 RPCs por uno. */
export interface OverviewResult {
  kpis:       KPIResult;
  totals:     Totals;
  hourly:     HourlyRow[];
  hourly_avg: HourlyRow[];
  conversion: ConversionHourRow[];
  zones:      ZoneBreakdownRow[];
  channels:   ChannelBreakdownRow[];
  heatmap:    HeatmapRow[];
  tiz:        TIZKpiRow[];
}

export interface TIZDistributionBucket {
  range: string;
  count: number;
}

export interface TIZDistributionResult {
  total: number;
  avg_s: number;
  median_s: number;
  p90_s: number;
  buckets: TIZDistributionBucket[];
}

/** Rango con el que abre el dashboard, decidido por la BD. */
export interface DefaultRange {
  start_date:       string;   // YYYY-MM-DD
  end_date:         string;   // YYYY-MM-DD
  month:            string;   // YYYY-MM
  last_data_date:   string;
  has_today:        boolean;
  is_current_month: boolean;
}

export interface DashboardBootstrap {
  sites: string[];
  channels: string[];
  zones: string[];
  min_date: string | null;
  max_date: string | null;
  default_range: DefaultRange | null;
  available_dates: string[];
}

/** Período de referencia ya resuelto saltando huecos de datos. */
export interface RefPeriod {
  found:      boolean;
  start_date: string | null;
  end_date:   string | null;
  label:      string;
  days:       number;
}

export interface CompareDeltas {
  enters:           number | null;  // %
  pasantes:         number | null;  // %
  enters_per_day:   number | null;  // % sobre promedio diario
  pasantes_per_day: number | null;  // % sobre promedio diario
  conv_pp:          number | null;  // puntos porcentuales
}

/** Respuesta de dashboard_compare. */
export interface CompareResult {
  mode:      string;
  ref:       RefPeriod;
  current:   OverviewResult;
  reference: OverviewResult | null;
  deltas:    CompareDeltas;
}
