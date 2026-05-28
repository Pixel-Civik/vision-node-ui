"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

// Operating window: 07:00–23:00 Lima (store hours)
const WIN_START = 7;
const WIN_END   = 23;  // inclusive — hours 7..23
// Minimum silence to flag as a gap (minutes)
const GAP_MIN   = 30;

export interface GapInterval {
  date: string;
  fromIso:     string;
  toIso:       string;
  fromLabel:   string;  // "HH:MM"
  toLabel:     string;
  durationMin: number;
}

export interface CameraStatus {
  channel:       string;
  cameraName:    string;
  lastSeen:      string;
  totalEvents:   number;
  enterEvents:   number;
  pasanteEvents: number;
  pct:           number;
}

export interface DayAvailability {
  date:          string;
  onlineHours:   number;
  expectedHours: number;
  pct:           number;
}

export interface HourSlot {
  date:   string;
  hour:   number;
  /** true = event, false = gap in window, null = outside 07-23 */
  online: boolean | null;
}

export interface UptimeData {
  cameras:      CameraStatus[];
  dailyPct:     DayAvailability[];
  hourSlots:    HourSlot[];
  gaps:         GapInterval[];
  overallPct:   number;
  totalGapMin:  number;
  loading:      boolean;
  error:        string | null;
}

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Timestamps from tracking_logs_view already carry Lima offset (-05:00).
 * e.g. "2026-05-22T17:02:43.688046-05:00"
 * Parsing directly is faster and avoids any Intl timezone quirks.
 */
function eventDate(ts: string): string  { return ts.slice(0, 10); }          // "2026-05-22"
function eventHour(ts: string): number  { return parseInt(ts.slice(11, 13), 10); } // 17
function eventHHMM(ts: string): string  { return ts.slice(11, 16); }         // "17:02"

/** For UTC boundary timestamps (startTs / endTs) use Intl. */
function utcToLimaDate(ts: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(ts));
}

function isoStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function daysInRange(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const days: string[] = [];
  let d = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);
  while (d <= endD) {
    days.push(isoStr(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return days;
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useUptime(startTs: string, endTs: string): UptimeData {
  const [data, setData] = useState<UptimeData>({
    cameras: [], dailyPct: [], hourSlots: [], gaps: [],
    overallPct: 0, totalGapMin: 0, loading: true, error: null,
  });

  useEffect(() => {
    setData((prev) => ({ ...prev, loading: true, error: null }));

    async function load() {
      const { data: rows, error } = await supabase
        .from("tracking_logs_view")
        .select("time, channel, camera_name, event")
        .gte("time", startTs)
        .lte("time", endTs)
        .order("time", { ascending: false })
        .limit(1_000_000);

      if (error || !rows) {
        setData((prev) => ({ ...prev, loading: false, error: error?.message ?? "Error" }));
        return;
      }

      // Fetched newest-first (so recent days are never cut off by the row limit).
      // Reverse to restore chronological order for gap detection.
      const typed = (rows as { time: string; channel: string; camera_name: string; event: string }[]).reverse();

      // ── Per-day: event timestamps in window, hour sets, camera stats ──────
      const dayEvents  = new Map<string, string[]>();
      const dayHourSet = new Map<string, Set<number>>();
      type CamAcc = { events: number; enterEvents: number; pasanteEvents: number; cameraName: string; lastSeen: string; hours: Set<string> };
      const cameraMap  = new Map<string, CamAcc>();

      for (const r of typed) {
        const date = eventDate(r.time);
        const hour = eventHour(r.time);

        if (hour < WIN_START || hour > WIN_END) continue;

        if (!dayEvents.has(date))  dayEvents.set(date, []);
        dayEvents.get(date)!.push(r.time);

        if (!dayHourSet.has(date)) dayHourSet.set(date, new Set());
        dayHourSet.get(date)!.add(hour);

        const cam: CamAcc = cameraMap.get(r.channel) ?? { events: 0, enterEvents: 0, pasanteEvents: 0, cameraName: r.camera_name ?? r.channel, lastSeen: r.time, hours: new Set<string>() };
        cam.events++;
        if (r.event === "enter")   cam.enterEvents++;
        if (r.event === "pasante") cam.pasanteEvents++;
        if (r.time > cam.lastSeen) cam.lastSeen = r.time;
        cam.hours.add(`${date}T${String(hour).padStart(2, "0")}`);
        cameraMap.set(r.channel, cam);
      }

      // ── Date range ────────────────────────────────────────────────────────
      const startDate = utcToLimaDate(startTs);
      const endDate   = utcToLimaDate(endTs);
      const allDays   = daysInRange(startDate, endDate);
      const EXPECTED  = WIN_END - WIN_START + 1; // 17 hours (07..23)

      // ── Gap detection via event stream ────────────────────────────────────
      const gaps: GapInterval[] = [];

      for (const date of allDays) {
        const events = dayEvents.get(date);
        if (!events || events.length < 2) continue;

        for (let i = 0; i < events.length - 1; i++) {
          const diffMin = (new Date(events[i+1]).getTime() - new Date(events[i]).getTime()) / 60000;
          if (diffMin >= GAP_MIN) {
            gaps.push({
              date,
              fromIso:     events[i],
              toIso:       events[i+1],
              fromLabel:   eventHHMM(events[i]),
              toLabel:     eventHHMM(events[i+1]),
              durationMin: Math.round(diffMin),
            });
          }
        }
      }

      // ── Daily availability (hourly buckets, WIN_START–WIN_END) ────────────
      const dailyPct: DayAvailability[] = allDays.map((date) => {
        const hours = dayHourSet.get(date);
        const onlineHours = hours?.size ?? 0;
        return {
          date,
          onlineHours,
          expectedHours: EXPECTED,
          pct: Math.round((onlineHours / EXPECTED) * 100),
        };
      });

      // ── Hour slots for heatmap (all 24h, null outside window) ────────────
      const hourSlots: HourSlot[] = [];
      for (const date of allDays) {
        const hours = dayHourSet.get(date);
        for (let h = 0; h < 24; h++) {
          if (h < WIN_START || h > WIN_END) {
            hourSlots.push({ date, hour: h, online: null });
          } else {
            hourSlots.push({ date, hour: h, online: hours?.has(h) ?? false });
          }
        }
      }

      // ── System-wide online hours (union across all cameras) ──────────────
      // An hour is "expected" only if at least one camera had events in it.
      // This anchors the denominator to hours the system was actually running,
      // which avoids penalising cameras for future hours (partial day) or
      // for periods before a camera was installed.
      let systemOnlineHours = 0;
      for (const hourSet of dayHourSet.values()) systemOnlineHours += hourSet.size;

      // ── Camera table ──────────────────────────────────────────────────────
      const cameras: CameraStatus[] = [...cameraMap.entries()]
        .map(([channel, { events, enterEvents, pasanteEvents, cameraName, lastSeen, hours }]) => ({
          channel,
          cameraName,
          lastSeen,
          totalEvents:   events,
          enterEvents,
          pasanteEvents,
          pct: systemOnlineHours > 0 ? Math.round((hours.size / systemOnlineHours) * 100) : 0,
        }))
        .sort((a, b) => b.pct - a.pct);

      // ── Overall ───────────────────────────────────────────────────────────
      const totalOnline  = dailyPct.reduce((s, d) => s + d.onlineHours, 0);
      const totalExpected = allDays.length * EXPECTED;
      const overallPct   = totalExpected > 0 ? Math.round((totalOnline / totalExpected) * 100) : 100;
      const totalGapMin  = gaps.reduce((s, g) => s + g.durationMin, 0);

      setData({ cameras, dailyPct, hourSlots, gaps, overallPct, totalGapMin, loading: false, error: null });
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTs, endTs]);

  return data;
}
