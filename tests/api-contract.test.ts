import { expect, it, vi } from "vitest";
import { fetchGenderAge, fetchTIZDistribution } from "@/lib/api";
import { rpc, rpcOne } from "@/lib/supabase";
import { filterPayload } from "@/lib/dashboard-filters";
vi.mock("@/lib/supabase", () => ({ rpc: vi.fn().mockResolvedValue([]), rpcOne: vi.fn().mockResolvedValue({ count: 6001 }) }));
it("sends the identical shared filter payload to both analytic APIs", async () => {
  vi.mocked(rpc).mockResolvedValue([]);
  vi.mocked(rpcOne).mockResolvedValue({ count: 6001 });
  const f = { startTs: "2026-09-21", endTs: "2026-09-23", sites: ["A"], channels: ["701"], zones: ["Q"], hourMin: 9, hourMax: 12, dows: [0, 2] };
  const signal = new AbortController().signal;
  await fetchGenderAge(f, ["enter"], signal);
  await fetchTIZDistribution(f, signal);
  expect(rpc).toHaveBeenCalledWith("dashboard_gender_age_filtered", { ...filterPayload(f), p_event_types: ["enter"] }, signal);
  expect(rpcOne).toHaveBeenCalledWith("dashboard_tiz_distribution", filterPayload(f), signal);
});
