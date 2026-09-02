"use client";

import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/supabase";

export interface CameraEventEntry {
  time: string;
  type: string;
}

export interface CameraLastEvent {
  channel: string;
  cameraName: string;
  last: CameraEventEntry;
  prev: CameraEventEntry | null;
  minutesSince: number;
}

interface CameraLastEventRow {
  channel: string;
  camera_name: string;
  last_time: string;
  last_type: string;
  prev_time: string | null;
  prev_type: string | null;
}

async function fetchCameraLastEvents(signal?: AbortSignal): Promise<CameraLastEvent[]> {
  const rows = await rpc<CameraLastEventRow>("dashboard_camera_last_events", {}, signal);
  const now = Date.now();
  return rows.map((row) => ({
    channel: row.channel,
    cameraName: row.camera_name || row.channel,
    last: { time: row.last_time, type: row.last_type || "" },
    prev: row.prev_time ? { time: row.prev_time, type: row.prev_type || "" } : null,
    minutesSince: Math.floor((now - new Date(row.last_time).getTime()) / 60_000),
  }));
}

/** Dos búsquedas indexadas por cámara en vez de 2.000 filas cada dos minutos. */
export function useCameraLastEvents() {
  const query = useQuery({
    queryKey: ["camera-last-events"],
    queryFn: ({ signal }) => fetchCameraLastEvents(signal),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  return {
    cameras: query.data ?? [],
    loading: query.isPending,
    error: query.error instanceof Error ? query.error.message : null,
  };
}
