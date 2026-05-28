"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface CameraEventEntry {
  time:  string;
  type:  string;
}

export interface CameraLastEvent {
  channel:      string;
  cameraName:   string;
  last:         CameraEventEntry;        // most recent event
  prev:         CameraEventEntry | null; // second-most-recent event
  minutesSince: number;                  // minutes since last event (based on event time)
}

/**
 * Returns the 2 most recent events per camera, using the event's own `time`
 * column (Lima -05:00 offset) — not the Supabase server clock.
 *
 * Fetches the newest 5 000 rows ordered by `time DESC` and groups client-side.
 * Since rows arrive newest-first, the first two rows seen per channel are
 * always that camera's two most recent events.
 *
 * Auto-refreshes every 2 minutes.
 */
export function useCameraLastEvents() {
  const [cameras, setCameras] = useState<CameraLastEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Anchor to 7 days ago so Postgres can use the time index (no full scan).
      // 7 days is enough to surface any camera that has had recent activity;
      // if a camera hasn't fired in 7 days it's effectively offline anyway.
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

      const { data, error: err } = await supabase
        .from("tracking_logs_view")
        .select("time, channel, camera_name, event")
        .gte("time", since)
        .order("time", { ascending: false })
        .limit(2_000);

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const now = Date.now();
      // Map channel → up to 2 collected events
      const acc = new Map<string, { name: string; events: CameraEventEntry[] }>();

      for (const r of (data ?? []) as { time: string; channel: string; camera_name: string; event: string }[]) {
        if (!r.channel) continue;
        const entry = acc.get(r.channel) ?? { name: r.camera_name ?? r.channel, events: [] };
        if (entry.events.length < 2) {
          entry.events.push({ time: r.time, type: r.event ?? "" });
          acc.set(r.channel, entry);
        }
      }

      const result: CameraLastEvent[] = [...acc.entries()].map(([channel, { name, events }]) => ({
        channel,
        cameraName:   name,
        last:         events[0],
        prev:         events[1] ?? null,
        minutesSince: Math.floor((now - new Date(events[0].time).getTime()) / 60_000),
      }));

      // Sort by most recently seen first
      result.sort((a, b) => a.minutesSince - b.minutesSince);

      setCameras(result);
      setLoading(false);
      setError(null);
    }

    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, []);

  return { cameras, loading, error };
}
