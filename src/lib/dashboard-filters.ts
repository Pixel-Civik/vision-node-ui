import type { DashboardFilters } from "./types";

export function filterKey(f: DashboardFilters) {
  const sorted = (values: string[] | number[] | null) => values === null ? null : [...values].sort();
  return [f.startTs, f.endTs, sorted(f.sites), sorted(f.channels), sorted(f.zones), f.hourMin, f.hourMax, sorted(f.dows)] as const;
}

export function filterPayload(f: DashboardFilters) {
  return { p_start_ts: f.startTs, p_end_ts: f.endTs, p_sites: f.sites,
    p_channels: f.channels, p_zones: f.zones, p_hour_min: f.hourMin,
    p_hour_max: f.hourMax, p_dows: f.dows };
}
