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
  connected?: boolean;
  process_running?: boolean;
  last_connection_at?: string | null;
  videos_last_hour?: number;
  videos_total?: number;
  last_video_at?: string | null;
  errors_total?: number;
  capture_errors_total?: number;
  video_errors_total?: number;
  reconnects?: number;
  forced_reconnects?: number;
  last_error?: string;
  last_error_at?: string | null;
  unhealthy_since?: string | null;
}

export interface EdgeNode {
  node_id: string;
  site: string;
  display_name: string;
  node_kind: string;
  service_name: string;
  status: EdgeStatus;
  service_status: string;
  service_status_changed_at: string;
  service_status_age_min: number;
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

export interface EdgeMetricSample {
  node_id: string;
  sampled_at: string;
  service_status: string;
  cpu_pct: number | null;
  memory_pct: number | null;
  disk_pct: number | null;
  gpu_pct: number | null;
  cpu_temp_c: number | null;
  gpu_temp_c: number | null;
  upload_pending: number;
}

export interface EdgeCameraMetricSample {
  node_id: string;
  site: string;
  service_name: string;
  camera_id: string;
  sampled_at: string;
  fps: number | null;
  videos_last_hour: number;
  errors_total: number;
  last_connection_at: string | null;
}

export interface EdgeAlert {
  id: number;
  node_id: string;
  alert_type: "node_offline" | "tracking_stale" | "service_unhealthy" | "camera_unhealthy";
  alert_key: string;
  opened_at: string;
  last_notified_at: string | null;
  last_age_min: number | null;
  notification_count: number;
  details: Record<string, unknown>;
}

export interface EdgeFleetFilters {
  start: string;
  end: string;
  sites: string[];
  cameras: string[];
  detectionTypes: string[];
}

interface EdgeFleetResponse {
  server_time: string;
  range_start: string;
  range_end: string;
  nodes: EdgeNode[];
  history: EdgeMetricSample[];
  camera_history: EdgeCameraMetricSample[];
  alerts: EdgeAlert[];
}
const EMPTY: EdgeFleetResponse = {
  server_time: "", range_start: "", range_end: "", nodes: [], history: [],
  camera_history: [], alerts: [],
};

export function useEdgeFleet(filters: EdgeFleetFilters) {
  const query = useQuery({
    queryKey: [
      "edge-fleet", filters.start, filters.end, filters.sites.join(","),
      filters.cameras.join(","), filters.detectionTypes.join(","),
    ],
    queryFn: ({ signal }) => rpcOne<EdgeFleetResponse>("dashboard_edge_fleet_filtered", {
      p_start: filters.start,
      p_end: filters.end,
      p_sites: filters.sites.length > 0 ? filters.sites : null,
      p_cameras: filters.cameras.length > 0 ? filters.cameras : null,
      p_detection_types: filters.detectionTypes.length > 0 ? filters.detectionTypes : null,
    }, signal),
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
