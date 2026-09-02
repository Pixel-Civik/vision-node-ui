"use client";

import { useQuery } from "@tanstack/react-query";
import { rpcOne } from "@/lib/supabase";

export type EdgeStatus = "online" | "degraded" | "offline";
export interface EdgeCameraState {
  status?: string;
  processed_fps?: number;
  fps?: number;
  persons?: number;
  active_tracks?: number;
  lag_sec?: number;
  last_frame_at?: number;
}

export interface EdgeNode {
  node_id: string;
  site: string;
  display_name: string;
  node_kind: string;
  service_name: string;
  status: EdgeStatus;
  service_status: string;
  reported_at: string;
  last_seen_at: string;
  heartbeat_age_sec: number;
  last_tracking_at: string | null;
  tracking_age_min: number | null;
  tracking_status: "active" | "stale" | "waiting" | "disabled";
  cpu_pct: number | null;
  memory_pct: number | null;
  memory_used_bytes: number | null;
  memory_total_bytes: number | null;
  disk_pct: number | null;
  disk_used_bytes: number | null;
  disk_total_bytes: number | null;
  gpu_pct: number | null;
  gpu_memory_pct: number | null;
  cpu_temp_c: number | null;
  gpu_temp_c: number | null;
  uptime_sec: number | null;
  upload_pending: number;
  upload_oldest_min: number | null;
  dropped_events: number;
  hostname: string | null;
  platform: string | null;
  version: string | null;
  cameras: Record<string, EdgeCameraState>;
  services: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

interface EdgeFleetResponse { server_time: string; nodes: EdgeNode[] }
const EMPTY: EdgeFleetResponse = { server_time: "", nodes: [] };

export function useEdgeFleet() {
  const query = useQuery({
    queryKey: ["edge-fleet"],
    queryFn: ({ signal }) => rpcOne<EdgeFleetResponse>("dashboard_edge_nodes", {}, signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: 2,
  });
  return {
    data: query.data ?? EMPTY,
    loading: query.isPending,
    refreshing: query.isFetching,
    error: query.error instanceof Error ? query.error.message : null,
    refreshedAt: query.dataUpdatedAt,
    refresh: query.refetch,
  };
}
