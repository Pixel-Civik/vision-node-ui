import { Storage } from "@google-cloud/storage";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: object, status: number) {
  return Response.json(body, { status, headers: NO_STORE });
}
async function storageClient(): Promise<Storage> {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("Falta GCP_PROJECT_ID");

  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (projectNumber && poolId && providerId && serviceAccount) {
    const authClient = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: getVercelOidcToken },
    });
    if (!authClient) throw new Error("No se pudo iniciar identidad efímera GCP");
    return new Storage({ projectId, authClient });
  }
  // Desarrollo local: Application Default Credentials, nunca una clave pública.
  return new Storage({ projectId });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/shoplifting-alerts/[id]/video">
) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return response({ error: "Autenticación requerida" }, 401);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return response({ error: "Supabase no configurado" }, 503);
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return response({ error: "Sesión inválida" }, 401);

    const { id } = await context.params;
    if (!UUID.test(id)) return response({ error: "Alerta inválida" }, 400);
    const { data: alert, error } = await supabase
      .from("shoplifting_alerts")
      .select("video_bucket,video_object,video_status")
      .eq("id", id)
      .maybeSingle();
    if (error) return response({ error: "No se pudo verificar la alerta" }, 502);
    if (!alert) return response({ error: "Alerta no encontrada" }, 404);
    if (alert.video_status !== "ready" || !alert.video_bucket || !alert.video_object) {
      return response({ error: "El video todavía no está disponible", status: alert.video_status }, 409);
    }

    const configuredBucket = process.env.GCP_STORAGE_BUCKET;
    if (!configuredBucket || alert.video_bucket !== configuredBucket) {
      return response({ error: "Bucket no autorizado" }, 403);
    }
    const storage = await storageClient();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const [signedUrl] = await storage
      .bucket(alert.video_bucket)
      .file(alert.video_object)
      .getSignedUrl({ version: "v4", action: "read", expires: expiresAt });
    return response({ url: signedUrl, expires_at: new Date(expiresAt).toISOString() }, 200);
  } catch (error) {
    console.error("shoplifting video signed URL", error);
    return response({ error: "No se pudo abrir el video seguro" }, 500);
  }
}
