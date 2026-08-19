"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ShopliftingAlert, ShopliftingAlertStatus } from "@/lib/types";

const BUCKET = "shoplifting-evidence";
const QUERY_KEY = ["shoplifting-alerts"] as const;
const COUNT_KEY = ["shoplifting-alerts", "new-count"] as const;
const SIGN_BATCH_SIZE = 100;
const ALERT_HISTORY_LIMIT = 500;

async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const signed = new Map<string, string>();
  for (let offset = 0; offset < unique.length; offset += SIGN_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + SIGN_BATCH_SIZE);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(batch, 3600);
    if (error) throw new Error(`No se pudo abrir la evidencia: ${error.message}`);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
    }
  }
  return signed;
}

async function fetchAlerts(): Promise<ShopliftingAlert[]> {
  const { data, error } = await supabase
    .from("shoplifting_alerts")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(ALERT_HISTORY_LIMIT);
  if (error) throw new Error(`No se pudieron cargar las alertas: ${error.message}`);

  const rows = (data ?? []) as ShopliftingAlert[];
  const urls = await signPaths(rows.map((row) => row.thumbnail_path ?? ""));
  return rows.map((row) => ({
    ...row,
    thumbnail_url: row.thumbnail_path ? urls.get(row.thumbnail_path) ?? null : null,
  }));
}

async function fetchNewCount(): Promise<number> {
  const { count, error } = await supabase
    .from("shoplifting_alerts")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  if (error) return 0;
  return count ?? 0;
}

export async function updateShopliftingAlert(
  id: string,
  status: Exclude<ShopliftingAlertStatus, "new">
): Promise<void> {
  const { error } = await supabase
    .from("shoplifting_alerts")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`No se pudo guardar la revisión: ${error.message}`);
}

function useAlertsRealtime(channelName: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shoplifting_alerts" },
        () => {
          void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          void queryClient.invalidateQueries({ queryKey: COUNT_KEY });
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [channelName, queryClient]);
}

export function useShopliftingAlerts() {
  useAlertsRealtime("shoplifting-alerts-list-live");
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchAlerts,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export function useShopliftingAlertCount() {
  useAlertsRealtime("shoplifting-alerts-count-live");
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: fetchNewCount,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}
