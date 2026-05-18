"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface FilterOptions {
  sites: string[];
  channels: string[];
  zones: string[];
  minDate: string;
  maxDate: string;
  loading: boolean;
}

export function useFilterOptions(): FilterOptions {
  const [opts, setOpts] = useState<Omit<FilterOptions, "loading">>({
    sites: [],
    channels: [],
    zones: [],
    minDate: new Date().toISOString().slice(0, 10),
    maxDate: new Date().toISOString().slice(0, 10),
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("tracking_logs_view")
        .select("site,channel,zone_name,ts");

      if (!data) return;

      const sites = [...new Set(data.map((r) => r.site).filter(Boolean))].sort() as string[];
      const channels = [...new Set(data.map((r) => r.channel).filter(Boolean))].sort() as string[];
      const zones = [...new Set(data.map((r) => r.zone_name).filter(Boolean))].sort() as string[];
      const tss = data.map((r) => r.ts).filter(Boolean).sort();
      const minDate = tss[0]?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
      const maxDate = tss[tss.length - 1]?.slice(0, 10) ?? minDate;

      setOpts({ sites, channels, zones, minDate, maxDate });
      setLoading(false);
    }
    load();
  }, []);

  return { ...opts, loading };
}
