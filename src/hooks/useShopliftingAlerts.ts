"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ShopliftingAlert, ShopliftingAlertStatus } from "@/lib/types";

const BUCKET = "shoplifting-evidence";
const QUERY_KEY = ["shoplifting-alerts"] as const;
const COUNT_KEY = ["shoplifting-alerts", "new-count"] as const;
const SIGN_BATCH_SIZE = 100;
const ALERT_PAGE_SIZE = 500;
const ALERT_HISTORY_LIMIT = 5_000;
const THUMBNAIL_SIGN_LIMIT = 120;
const EVIDENCE_GENERATION = "h264-faststart-v1";
const PUBLIC_ALERT_COLUMNS = [
  "id", "site", "camera_id", "camera_name", "occurred_at", "risk_score",
  "risk_reasons", "status", "thumbnail_path", "duration_sec", "metadata",
  "created_at", "reviewed_at", "video_status", "video_uploaded_at", "video_size_bytes",
].join(",");

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
  const rows: ShopliftingAlert[] = [];
  for (let offset = 0; offset < ALERT_HISTORY_LIMIT; offset += ALERT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("shoplifting_alerts")
      .select(PUBLIC_ALERT_COLUMNS)
      .contains("metadata", { evidence_generation: EVIDENCE_GENERATION })
      .order("occurred_at", { ascending: false })
      .range(offset, offset + ALERT_PAGE_SIZE - 1);
    if (error) throw new Error(`No se pudieron cargar las alertas: ${error.message}`);
    const page = (data ?? []) as unknown as ShopliftingAlert[];
    rows.push(...page);
    if (page.length < ALERT_PAGE_SIZE) break;
  }
  // Firmar miles de JPG al abrir el dashboard era el mayor costo. Los videos
  // legacy no dependen de miniatura y las evidencias recientes conservan preview.
  const urls = await signPaths(
    rows.slice(0, THUMBNAIL_SIGN_LIMIT).map((row) => row.thumbnail_path ?? "")
  );
  return rows.map((row) => {
    const legacyThumbnail = row.thumbnail_path
      ? urls.get(row.thumbnail_path) ?? null
      : null;
    const params = new URLSearchParams({
      camera_id: row.camera_id,
      occurred_at: row.occurred_at,
    });
    return {
      ...row,
      // Evidencia nueva: JPG privado junto al MP4 en GCS. La ruta del API
      // firma y redirige sin exponer credenciales. Las alertas antiguas
      // conservan su miniatura legacy de Supabase cuando existe.
      thumbnail_url: legacyThumbnail ?? (
        row.video_status === "ready"
          ? `/api/shoplifting-alerts/${encodeURIComponent(row.id)}/thumbnail?${params}`
          : null
      ),
    };
  });
}

export async function getShopliftingVideoUrl(
  id: string,
  cameraId: string,
  occurredAt: string,
): Promise<string> {
  const params = new URLSearchParams({ camera_id: cameraId, occurred_at: occurredAt });
  const result = await fetch(`/api/shoplifting-alerts/${encodeURIComponent(id)}/video?${params}`, {
    cache: "no-store",
  });
  const payload = await result.json() as { url?: string; error?: string };
  if (!result.ok || !payload.url) throw new Error(payload.error || "Video no disponible");
  return payload.url;
}

async function fetchNewCount(): Promise<number> {
  const { count, error } = await supabase
    .from("shoplifting_alerts")
    .select("id", { count: "exact", head: true })
    .contains("metadata", { evidence_generation: EVIDENCE_GENERATION })
    .eq("status", "new");
  if (error) return 0;
  return count ?? 0;
}

export async function updateShopliftingAlert(
  id: string,
  status: Exclude<ShopliftingAlertStatus, "new">
): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`No se pudo preparar la revisión: ${sessionError.message}`);
  }
  if (!sessionData.session) {
    const { error: anonymousError } = await supabase.auth.signInAnonymously();
    if (anonymousError) {
      throw new Error(
        `No se pudo crear la sesión de revisión: ${anonymousError.message}`
      );
    }
  }
  const { error } = await supabase.rpc("review_shoplifting_alert", {
    p_alert_id: id,
    p_status: status,
    p_notes: null,
    p_training_eligible: true,
  });
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
