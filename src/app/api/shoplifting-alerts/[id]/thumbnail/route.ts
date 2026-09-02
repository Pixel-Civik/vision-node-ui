import {
  findAlertThumbnail,
  findAlertVideo,
  resolveAlertEvidence,
  safeGcsErrorCode,
  signReadUrl,
} from "@/lib/server/shoplifting-gcs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMERA_ID = /^[a-zA-Z0-9_-]{1,64}$/;

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/shoplifting-alerts/[id]/thumbnail">,
) {
  let stage = "request";
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) return json({ error: "Alerta inválida" }, 400);

    const requestUrl = new URL(request.url);
    const cameraId = requestUrl.searchParams.get("camera_id") ?? "";
    const occurredAt = new Date(requestUrl.searchParams.get("occurred_at") ?? "");
    if (!CAMERA_ID.test(cameraId) || Number.isNaN(occurredAt.getTime())) {
      return json({ error: "Contexto de alerta inválido" }, 400);
    }

    stage = "supabase_lookup";
    let resolved = null;
    try {
      resolved = await resolveAlertEvidence(id, cameraId, occurredAt);
    } catch (lookupError) {
      console.warn("shoplifting thumbnail RPC fallback", {
        code: safeGcsErrorCode(lookupError),
      });
    }
    let video = resolved?.video ?? null;
    if (!video) {
      stage = "gcs_legacy_lookup";
      video = await findAlertVideo(cameraId, occurredAt, id);
    }
    if (!video) return json({ error: "Evidencia no encontrada" }, 404);
    const thumbnail = resolved?.thumbnail ?? await findAlertThumbnail(video);
    if (!thumbnail) return json({ error: "Vista previa todavía no disponible" }, 404);

    stage = "gcs_sign";
    const { url } = await signReadUrl(thumbnail, 60 * 60 * 1000);
    return new Response(null, {
      status: 307,
      headers: {
        Location: url,
        "Cache-Control": "private, max-age=300",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const code = safeGcsErrorCode(error);
    console.error("shoplifting thumbnail signed URL", { stage, code, error });
    return json({ error: "No se pudo abrir la vista previa", stage, code }, 500);
  }
}
