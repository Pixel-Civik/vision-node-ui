import type { DashboardFilters, KPIResult, HourlyRow, ZoneBreakdownRow, ChannelBreakdownRow, HeatmapRow, TIZKpiRow, ConversionHourRow, GenderRow, AgeRow, DailyRow, OverviewResult, CompareResult, DefaultRange, DashboardBootstrap, TIZDistributionResult } from "./types";
import type { AttrsBreakdown, AttrsGranularity, AttrBucketRow, AgeLabel, GenderLabel } from "./types";
import { rpc, rpcOne, supabase } from "./supabase";

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

const EMPTY_KPI: KPIResult = { enters: 0, exits: 0, net: 0, unique_tracks: 0, days: 0, enters_per_day: 0, exits_per_day: 0 };

export const EMPTY_OVERVIEW: OverviewResult = {
  kpis: EMPTY_KPI,
  totals: { visitors: 0, pasantes: 0, conv: null },
  hourly: [], hourly_avg: [], conversion: [],
  zones: [], channels: [], heatmap: [], tiz: [],
};

// ── RPCs v7 — la lógica vive en la BD ────────────────────────────────────────

/**
 * Un solo round-trip para todo el dashboard. Sustituye la cadena en serie de
 * fetchKPIs → fetchHourly → fetchZoneBreakdown → fetchChannelBreakdown →
 * fetchHeatmap → fetchTIZKpis, y trae ya calculados totals, hourly_avg y
 * conversion, que antes se derivaban en JS.
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

export async function fetchHourlyAvg(f: DashboardFilters): Promise<HourlyRow[]> {
  return rpc<HourlyRow>("dashboard_hourly_avg", buildPayload(f));
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

export async function fetchTIZDistribution(
  startTs: string,
  endTs: string,
  signal?: AbortSignal,
): Promise<TIZDistributionResult> {
  return rpcOne<TIZDistributionResult>(
    "dashboard_tiz_distribution",
    { p_start_ts: startTs, p_end_ts: endTs },
    signal,
  );
}

export async function fetchDashboardBootstrap(
  signal?: AbortSignal,
): Promise<DashboardBootstrap> {
  try {
    return await rpcOne<DashboardBootstrap>("dashboard_bootstrap", {}, signal);
  } catch (err) {
    // La migración 20260903172000_dashboard_bootstrap puede no estar aplicada
    // en la base (el RPC responde PGRST202). Sin él el dashboard no arrancaba y
    // mostraba "sin datos" con un error: componemos el mismo resultado con las
    // tres funciones que sí existen. Si el error es de red, esto también falla
    // y se propaga para reintentar.
    if (signal?.aborted) throw err;

    const [options, range, days] = await Promise.all([
      rpc<{ sites: string[]; channels: string[]; zones: string[]; min_date: string | null; max_date: string | null }>(
        "dashboard_filter_options", {}, signal,
      ),
      rpc<DefaultRange>("dashboard_default_range", {}, signal),
      rpc<{ day: string; events: number }>("dashboard_data_days", { p_from: null, p_to: null }, signal),
    ]);

    const o = options[0];
    return {
      sites:           o?.sites    ?? [],
      channels:        o?.channels ?? [],
      zones:           o?.zones    ?? [],
      min_date:        o?.min_date ?? null,
      max_date:        o?.max_date ?? null,
      default_range:   range[0] ?? null,
      available_dates: days.map((d) => d.day),
    };
  }
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

export async function fetchDailyTrends(
  f: DashboardFilters,
  signal?: AbortSignal,
): Promise<DailyTrendRow[]> {
  return rpc<DailyTrendRow>("dashboard_daily_trend", buildPayload(f), signal);
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

// ── Atributos de personas (niño/adulto, hombre/mujer) ─────────────────────────

export function normAge(v: string | null | undefined): AgeLabel {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("nino") || s.includes("niño") || s.includes("child")) return "nino";
  if (["adult", "joven", "mayor", "young", "senior"].some((k) => s.includes(k))) return "adulto";
  return null; // incluye "edad_no_detectada"
}

export function normGender(v: string | null | undefined): GenderLabel {
  const s = (v ?? "").trim().toLowerCase();
  if (["hombre", "m", "male", "man"].includes(s)) return "hombre";
  if (["mujer", "f", "female", "woman"].includes(s)) return "mujer";
  return null; // incluye "genero_no_detectado"
}

const ATTRS_FALLBACK_PAGE = 1000;
const ATTRS_FALLBACK_MAX_PAGES = 15;

/**
 * Respaldo mientras la migración dashboard_attrs_breakdown no esté aplicada:
 * pagina las entradas de tracking_logs_view y agrega en el navegador.
 * Tope de 15 000 filas; si se alcanza, `truncated` avisa que el conteo es parcial.
 */
async function fetchAttrsBreakdownClient(
  f: DashboardFilters, granularity: AttrsGranularity, signal?: AbortSignal,
): Promise<AttrsBreakdown> {
  const acc = new Map<string, AttrBucketRow>();
  let truncated = false;
  for (let page = 0; page < ATTRS_FALLBACK_MAX_PAGES; page++) {
    let q = supabase
      .from("tracking_logs_view")
      .select("time_lima,gender,age")
      .eq("event", "enter")
      .gte("time", f.startTs)
      .lte("time", f.endTs)
      .order("time", { ascending: true })
      .range(page * ATTRS_FALLBACK_PAGE, (page + 1) * ATTRS_FALLBACK_PAGE - 1);
    if (f.sites) q = q.in("site", f.sites);
    if (f.channels) q = q.in("channel", f.channels);
    if (f.zones) q = q.in("zone", f.zones);
    if (signal) q = q.abortSignal(signal);
    const { data, error } = await q;
    if (error) throw new Error(`tracking_logs_view: ${error.message}`);
    const rows = (data ?? []) as { time_lima: string; gender: string | null; age: string | null }[];
    for (const r of rows) {
      const day = r.time_lima.slice(0, 10);
      const hour = Number(r.time_lima.slice(11, 13));
      if (hour < f.hourMin || hour > f.hourMax) continue;
      if (f.dows) {
        const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // 0=Lun
        if (!f.dows.includes(dow)) continue;
      }
      const bucket = granularity === "hour" ? r.time_lima.slice(11, 13) : day;
      const age = normAge(r.age);
      const gender = normGender(r.gender);
      const key = `${bucket}|${age}|${gender}`;
      const cur = acc.get(key);
      if (cur) cur.count += 1;
      else acc.set(key, { bucket, age, gender, count: 1 });
    }
    if (rows.length < ATTRS_FALLBACK_PAGE) break;
    if (page === ATTRS_FALLBACK_MAX_PAGES - 1) truncated = true;
  }
  return { granularity, rows: Array.from(acc.values()), source: "client", truncated };
}

/** Entradas por grupo de edad y género, por hora (1 día) o por día (varios). */
export async function fetchAttrsBreakdown(
  f: DashboardFilters, granularity: AttrsGranularity, signal?: AbortSignal,
): Promise<AttrsBreakdown> {
  try {
    const rows = await rpc<{ bucket: string; age: string | null; gender: string | null; count: number }>(
      "dashboard_attrs_breakdown",
      { ...buildPayload(f), p_granularity: granularity },
      signal,
    );
    return {
      granularity,
      rows: rows.map((r) => ({
        bucket: r.bucket, age: normAge(r.age), gender: normGender(r.gender), count: Number(r.count),
      })),
      source: "rpc",
      truncated: false,
    };
  } catch (e) {
    // RPC aún no desplegado en la BD: usar el respaldo en el navegador.
    if (e instanceof Error && /Could not find the function|PGRST202/.test(e.message)) {
      return fetchAttrsBreakdownClient(f, granularity, signal);
    }
    throw e;
  }
}
