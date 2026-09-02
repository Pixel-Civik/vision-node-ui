import {
  findAlertVideo,
  resolveAlertEvidence,
  safeGcsErrorCode,
  signReadUrl,
} from "@/lib/server/shoplifting-gcs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMERA_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function response(body: object, status: number) {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, "X-App-Revision": revision },
  });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/shoplifting-alerts/[id]/video">
) {
  let stage = "request";
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) return response({ error: "Alerta inválida" }, 400);

    const requestUrl = new URL(request.url);
    const cameraId = requestUrl.searchParams.get("camera_id") ?? "";
    const occurredAt = new Date(requestUrl.searchParams.get("occurred_at") ?? "");
    if (!CAMERA_ID.test(cameraId) || Number.isNaN(occurredAt.getTime())) {
      return response({ error: "Contexto de alerta inválido" }, 400);
    }

    stage = "supabase_lookup";
    let file = null;
    try {
      file = (await resolveAlertEvidence(id, cameraId, occurredAt))?.video ?? null;
    } catch (lookupError) {
      // Compatibilidad durante despliegues escalonados: la migración puede
      // llegar unos minutos después del frontend. El fallback no afecta el
      // camino normal O(1), pero mantiene accesible evidencia histórica.
      console.warn("shoplifting evidence RPC fallback", {
        code: safeGcsErrorCode(lookupError),
      });
    }
    if (!file) {
      stage = "gcs_legacy_lookup";
      file = await findAlertVideo(cameraId, occurredAt, id);
    }
    if (!file) return response({ error: "Video no encontrado o todavía subiendo" }, 404);

    stage = "gcs_sign";
    const download = requestUrl.searchParams.get("download") === "1";
    const disposition = download
      ? `attachment; filename="alerta-${id}.mp4"`
      : undefined;
    const { url, expiresAt } = await signReadUrl(file, 5 * 60 * 1000, disposition);
    return response({ url, expires_at: new Date(expiresAt).toISOString() }, 200);
  } catch (error) {
    const code = safeGcsErrorCode(error);
    console.error("shoplifting public video signed URL", { stage, code, error });
    return response({ error: "No se pudo abrir el video", stage, code }, 500);
  }
}
