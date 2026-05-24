"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface FilterOptions {
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;              // earliest date with data (Lima local, YYYY-MM-DD)
  maxDate: string;              // latest date with data  (Lima local, YYYY-MM-DD)
  availableDates: Set<string>;  // every day minDate..yesterday — dots in calendar
  loading: boolean;
}

// v4 — bumped to force fresh Lima-aware date recalculation
const SESSION_KEY = "pixel-civik-filter-opts-v4";

type CachedOpts = Omit<FilterOptions, "loading" | "availableDates"> & { dates: string[] };

function readCache(): Omit<FilterOptions, "loading"> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { sites, channels, zones, minDate, maxDate, dates }: CachedOpts = JSON.parse(raw);
    return { sites, channels, zones, minDate, maxDate, availableDates: new Set<string>(dates) };
  } catch {
    return null;
  }
}

function writeCache(o: Omit<FilterOptions, "loading">) {
  try {
    const payload: CachedOpts = {
      sites: o.sites, channels: o.channels, zones: o.zones,
      minDate: o.minDate, maxDate: o.maxDate,
      dates: [...o.availableDates],
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {}
}

// Convert a UTC ISO timestamp (or Lima-offset ISO) to Lima local date YYYY-MM-DD.
// Works regardless of whether Supabase returns UTC (+00:00) or Lima (-05:00) offset.
function tolimaDate(ts: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date(ts));
  } catch {
    return ts.slice(0, 10);
  }
}

// Build a local Date from an ISO date string (avoids UTC midnight shift)
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TODAY = new Date().toISOString().slice(0, 10);

const EMPTY: Omit<FilterOptions, "loading"> = {
  sites: [], channels: [], zones: [],
  minDate: TODAY, maxDate: TODAY,
  availableDates: new Set<string>(),
};

export function useFilterOptions(): FilterOptions {
  const cached = readCache();
  const [opts, setOpts] = useState<Omit<FilterOptions, "loading">>(cached ?? EMPTY);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    async function load() {
      // Three lightweight queries — no full table scan:
      // 1. First row (ascending ts) → minDate
      // 2. Last row  (descending ts) → maxDate
      // 3. Dimension columns         → filter dropdowns
      const [firstResult, lastResult, dimResult] = await Promise.all([
        supabase
          .from("tracking_logs_view")
          .select("ts")
          .order("ts", { ascending: true })
          .limit(1),
        supabase
          .from("tracking_logs_view")
          .select("ts")
          .order("ts", { ascending: false })
          .limit(1),
        supabase
          .from("tracking_logs_view")
          .select("site,channel,zone_name"),
      ]);

      const firstTs = (firstResult.data?.[0]?.ts as string | undefined) ?? "";
      const lastTs  = (lastResult.data?.[0]?.ts  as string | undefined) ?? "";
      const dimData = dimResult.data ?? [];

      // If everything failed, leave loading spinner and bail
      if (!firstTs && dimData.length === 0) { setLoading(false); return; }

      // Dimension values (distinct, sorted)
      const sites    = [...new Set(dimData.map((r) => r.site      as string).filter(Boolean))].sort();
      const channels = [...new Set(dimData.map((r) => r.channel   as string).filter(Boolean))].sort();
      const zones    = [...new Set(dimData.map((r) => r.zone_name as string).filter(Boolean))].sort();

      // Date range in Lima local time
      const minDate = firstTs ? tolimaDate(firstTs) : TODAY;
      const maxDate = lastTs  ? tolimaDate(lastTs)  : TODAY;

      // Build the set of "complete" days: minDate through yesterday.
      // Dots appear only on full days (today's data is still in progress).
      // Assumes continuous operation — gaps (system-down days) would show a
      // dot but return 0 data when selected, which is acceptable vs. a 500K scan.
      const yd = isoStr(new Date(Date.now() - 86_400_000));
      const availableDates = new Set<string>();
      if (firstTs && minDate <= yd) {
        for (
          let d = localDate(minDate);
          isoStr(d) <= yd;
          d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        ) {
          availableDates.add(isoStr(d));
        }
      }

      const fresh = { sites, channels, zones, minDate, maxDate, availableDates };
      setOpts(fresh);
      setLoading(false);
      writeCache(fresh);
    }
    load();
  }, []);

  return { ...opts, loading };
}
