import React, { type PropsWithChildren } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { filterKey, filterPayload } from "@/lib/dashboard-filters";
import type { DashboardFilters } from "@/lib/types";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useFilterOptions } from "@/hooks/useFilterOptions";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchGenderAge: vi.fn(), fetchTIZDistribution: vi.fn(),
  fetchFilterOptions: vi.fn(), fetchDataDays: vi.fn(), fetchDefaultRange: vi.fn(),
}));
const filters: DashboardFilters = { startTs: "2026-09-21T05:00:00Z", endTs: "2026-09-23T04:59:59Z", sites: ["A"], channels: ["101"], zones: ["queue"], hourMin: 9, hourMax: 10, dows: [0] };
function Wrapper({ children }: PropsWithChildren) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.fetchGenderAge).mockResolvedValue({ gender: [], age: [] });
  vi.mocked(api.fetchTIZDistribution).mockResolvedValue({ count: 6001, avg_s: 60, median_s: 60, p90_s: 60, buckets: [{ label: "1-2min", count: 6001 }] });
  vi.mocked(api.fetchFilterOptions).mockResolvedValue({ sites: ["A"], channels: ["101"], zones: ["queue"], minDate: "2026-09-21", maxDate: "2026-09-22" });
  vi.mocked(api.fetchDataDays).mockResolvedValue(["2026-09-21"]);
});
describe("shared analytics filters", () => {
  it("keys all dimensions and canonicalizes selection order without losing empty selection", () => {
    for (const [key, value] of Object.entries({ sites: ["B"], channels: ["701"], zones: ["other"], hourMin: 8, hourMax: 12, dows: [1] })) {
      expect(filterKey({ ...filters, [key]: value })).not.toEqual(filterKey(filters));
    }
    expect(filterKey({ ...filters, sites: ["B", "A"] })).toEqual(filterKey({ ...filters, sites: ["A", "B"] }));
    expect(filterKey({ ...filters, dows: [] })).not.toEqual(filterKey({ ...filters, dows: null }));
    expect(filterPayload(filters)).toEqual({ p_start_ts: filters.startTs, p_end_ts: filters.endTs, p_sites: ["A"], p_channels: ["101"], p_zones: ["queue"], p_hour_min: 9, p_hour_max: 10, p_dows: [0] });
  });
  it("refetches demographic and full-population TIZ when only camera changes", async () => {
    const hook = renderHook(({ selected }) => useAnalytics(selected), { initialProps: { selected: filters }, wrapper: Wrapper });
    await waitFor(() => expect(hook.result.current.analyticsLoading).toBe(false));
    expect(hook.result.current.tizDistribution?.count).toBe(6001);
    hook.rerender({ selected: { ...filters, channels: ["701"] } });
    await waitFor(() => expect(api.fetchTIZDistribution).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.fetchGenderAge).mock.calls.at(-1)?.[0].channels).toEqual(["701"]);
  });
  it("exposes analytic query failures instead of claiming empty success", async () => {
    vi.mocked(api.fetchTIZDistribution).mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAnalytics(filters, { tiz: true }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.analyticsError).toBeTruthy());
  });
});
it("bootstrap failure exposes a retry and recovers without reloading the page", async () => {
  vi.mocked(api.fetchDefaultRange).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ start_date: "2026-09-21", end_date: "2026-09-22", month: "2026-09", last_data_date: "2026-09-22", has_today: false, is_current_month: true });
  const { result } = renderHook(() => useFilterOptions(), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.defaultRange).toBeNull();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.defaultRange?.start_date).toBe("2026-09-21"));
  expect(result.current.error).toBeNull();
});
