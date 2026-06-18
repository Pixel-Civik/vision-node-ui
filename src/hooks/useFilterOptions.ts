"use client";

import { useState, useEffect } from "react";
import { fetchFilterOptions } from "@/lib/api";

export interface FilterOptions {
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;              // earliest date with data (Lima local, YYYY-MM-DD)
  maxDate: string;              // latest date with data  (Lima local, YYYY-MM-DD)
  availableDates: Set<string>;  // every day minDate..yesterday — dots in calendar
  loading: boolean;
}

// v6 — uses dashboard_filter_options RPC (server-side aggregation)
const SESSION_KEY = "pixel-civik-filter-opts-v6";

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
  // Always start with EMPTY so SSR and client initial render match.
  // Cache is applied in useEffect (client-only, after hydration) to avoid #418.
  const [opts, setOpts] = useState<Omit<FilterOptions, "loading">>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Apply sessionStorage cache immediately so charts appear without a network round-trip.
    const cached = readCache();
    if (cached) {
      setOpts(cached);
      setLoading(false);
    }

    async function load() {
      const result = await fetchFilterOptions().catch(() => null);
      if (!result) { if (!cached) setLoading(false); return; }

      const { sites, channels, zones, minDate, maxDate } = result;

      // Build the set of days with data: minDate through yesterday (complete days)
      // plus today if the most recent event is from today (data in progress).
      const yd = isoStr(new Date(Date.now() - 86_400_000));
      const availableDates = new Set<string>();
      if (minDate <= yd) {
        for (
          let d = localDate(minDate);
          isoStr(d) <= yd;
          d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
        ) {
          availableDates.add(isoStr(d));
        }
      }
      if (maxDate >= TODAY) availableDates.add(TODAY);

      const fresh = { sites, channels, zones, minDate, maxDate, availableDates };
      setOpts(fresh);
      setLoading(false);
      writeCache(fresh);
    }
    load();
  }, []);

  return { ...opts, loading };
}
