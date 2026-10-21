"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ShopliftingAlert, ShopliftingAlertStatus } from "@/lib/types";

const BUCKET = "shoplifting-evidence";
const QUERY_KEY = ["shoplifting-alerts"] as const;
const COUNT_KEY = ["shoplifting-alerts", "new-count"] as const;
const SIGN_BATCH_SIZE = 100;
const EVIDENCE_GENERATION = "h264-faststart-v1";

export interface ShopliftingAlertPage {
  alerts: ShopliftingAlert[];
  total: number;
  newCount: number;
  confirmedCount: number;
  dismissedCount: number;
  cameras: string[];
}

interface AlertPageParams {
  page: number;
  pageSize: number;
  camera: string | null;
  status: ShopliftingAlertStatus | null;
}

interface AlertPageRpc {
  alerts?: ShopliftingAlert[];
  total?: number;
  new_count?: number;
  confirmed_count?: number;
  dismissed_count?: number;
  cameras?: string[];
}

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

const ALERT_COLUMNS = [
  "id", "site", "camera_id", "camera_name", "occurred_at", "risk_score",
  "risk_reasons", "status", "thumbnail_path", "duration_sec", "metadata",
  "created_at", "reviewed_at", "video_status", "video_uploaded_at", "video_size_bytes",
].join(",");

function alertsQuery() {
  return supabase
    .from("shoplifting_alerts")
    .select(ALERT_COLUMNS, { count: "exact" })
    .contains("metadata", { evidence_generation: EVIDENCE_GENERATION });
}

async function countByStatus(status: ShopliftingAlertStatus): Promise<number> {
  const { count, error } = await supabase
    .from("shoplifting_alerts")
    .select("id", { count: "exact", head: true })
    .contains("metadata", { evidence_generation: EVIDENCE_GENERATION })
    .eq("status", status);
  if (error) throw new Error(`No se pudieron contar las alertas: ${error.message}`);
  return count ?? 0;
}

/** Cámaras distintas sin leer toda la tabla: un salto por cámara (son pocas). */
async function distinctCameras(): Promise<string[]> {
  const cams: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < 50; i++) {
    let q = supabase
      .from("shoplifting_alerts")
      .select("camera_id")
      .contains("metadata", { evidence_generation: EVIDENCE_GENERATION })
      .not("camera_id", "is", null)
      .order("camera_id", { ascending: true })
      .limit(1);
    if (last !== null) q = q.gt("camera_id", last);
    const { data, error } = await q;
    if (error || !data?.length) break;
    last = (data[0] as { camera_id: string }).camera_id;
    cams.push(last);
  }
  return cams;
}

/**
 * Respaldo mientras la migración dashboard_shoplifting_alert_page no esté en la BD:
 * misma respuesta que el RPC, armada con consultas directas a shoplifting_alerts.
 */
async function fetchAlertPageClient(params: AlertPageParams): Promise<AlertPageRpc> {
  const offset = Math.max(0, params.page - 1) * params.pageSize;
  const limit = Math.min(Math.max(params.pageSize, 1), 100);
  let page = alertsQuery();
  if (params.camera) page = page.eq("camera_id", params.camera);
  if (params.status) page = page.eq("status", params.status);
  const [pageRes, newCount, confirmedCount, dismissedCount, cameras] = await Promise.all([
    page.order("occurred_at", { ascending: false }).range(offset, offset + limit - 1),
    countByStatus("new"),
    countByStatus("confirmed"),
    countByStatus("dismissed"),
    distinctCameras(),
  ]);
  if (pageRes.error) throw new Error(`No se pudieron cargar las alertas: ${pageRes.error.message}`);
  return {
    alerts: (pageRes.data ?? []) as unknown as ShopliftingAlert[],
    total: pageRes.count ?? 0,
    new_count: newCount,
    confirmed_count: confirmedCount,
    dismissed_count: dismissedCount,
    cameras,
  };
}

async function fetchAlertPage(params: AlertPageParams): Promise<ShopliftingAlertPage> {
  const { data, error } = await supabase.rpc("dashboard_shoplifting_alert_page", {
    p_offset: Math.max(0, params.page - 1) * params.pageSize,
    p_limit: params.pageSize,
    p_camera_id: params.camera,
    p_status: params.status,
  });
  let result: AlertPageRpc;
  if (error) {
    // RPC aún no desplegado en la BD: armar la página desde la tabla.
    if (!/Could not find the function|PGRST202/.test(`${error.code} ${error.message}`)) {
      throw new Error(`No se pudieron cargar las alertas: ${error.message}`);
    }
    result = await fetchAlertPageClient(params);
  } else {
    result = (data ?? {}) as AlertPageRpc;
  }
  const rows = result.alerts ?? [];
  const urls = await signPaths(rows.map((row) => row.thumbnail_path ?? ""));
  const alerts = rows.map((row) => {
    const legacyThumbnail = row.thumbnail_path
      ? urls.get(row.thumbnail_path) ?? null
      : null;
    const gcsThumbnailObject = row.metadata?.gcs_thumbnail_object;
    const hasGcsThumbnail = (
      typeof gcsThumbnailObject === "string"
      && gcsThumbnailObject.trim().length > 0
    );
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
        row.video_status === "ready" && hasGcsThumbnail
          ? `/api/shoplifting-alerts/${encodeURIComponent(row.id)}/thumbnail?${params}`
          : null
      ),
    };
  });
  return {
    alerts,
    total: Number(result.total ?? 0),
    newCount: Number(result.new_count ?? 0),
    confirmedCount: Number(result.confirmed_count ?? 0),
    dismissedCount: Number(result.dismissed_count ?? 0),
    cameras: result.cameras ?? [],
  };
}

export async function getShopliftingVideoUrl(
  id: string,
  cameraId: string,
  occurredAt: string,
  download = false,
): Promise<string> {
  const params = new URLSearchParams({ camera_id: cameraId, occurred_at: occurredAt });
  if (download) params.set("download", "1");
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
  const invalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shoplifting_alerts" },
        () => {
          // Una alerta suele producir varias escrituras seguidas (pending,
          // ready y metadata). Agruparlas evita descargar hasta 5.000 filas
          // varias veces por el mismo video.
          if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
          invalidateTimer.current = setTimeout(() => {
            void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
            void queryClient.invalidateQueries({ queryKey: COUNT_KEY });
          }, 900);
        }
      )
      .subscribe();
    return () => {
      if (invalidateTimer.current) clearTimeout(invalidateTimer.current);
      invalidateTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [channelName, queryClient]);
}

export function useShopliftingAlerts(params: AlertPageParams) {
  useAlertsRealtime("shoplifting-alerts-list-live");
  return useQuery({
    queryKey: [
      ...QUERY_KEY, "page", params.page, params.pageSize,
      params.camera ?? "*", params.status ?? "*",
    ],
    queryFn: () => fetchAlertPage(params),
    staleTime: 5 * 60_000,
    // Realtime actualiza al instante. El respaldo ya trae sólo una página.
    refetchInterval: 30 * 60_000,
  });
}

export function useShopliftingAlertCount() {
  useAlertsRealtime("shoplifting-alerts-count-live");
  return useQuery({
    queryKey: COUNT_KEY,
    queryFn: fetchNewCount,
    staleTime: 20_000,
    // Reduce de 1.440 a 288 lecturas/día por pestaña siempre abierta.
    refetchInterval: 5 * 60_000,
  });
}
