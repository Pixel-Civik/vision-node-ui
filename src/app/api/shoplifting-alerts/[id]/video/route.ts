import { createHash } from "node:crypto";
import type { File } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAMERA_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

function response(body: object, status: number) {
  return Response.json(body, { status, headers: NO_STORE });
}

function uuid5(value: string): string {
  const bytes = createHash("sha1")
    .update(URL_NAMESPACE)
    .update(Buffer.from(value, "utf8"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
      // Google invokes the supplier with its own context argument. Passing the
      // Vercel helper directly makes that context look like Vercel OIDC options
      // and exchanges the token to the WIF resource audience. The provider is
      // intentionally configured for Vercel's native audience instead.
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    });
    if (!authClient) throw new Error("No se pudo iniciar identidad efímera GCP");
    return new Storage({ projectId, authClient });
  }
  return new Storage({ projectId });
}

function datePrefixes(objectRoot: string, cameraId: string, occurredAt: Date): string[] {
  // El objeto live usa la fecha UTC del evento. El backfill histórico usa el
  // mtime del archivo; ±1 día cubre clips cercanos a medianoche sin abrir todo el bucket.
  return [0, -1, 1].map((offset) => {
    const date = new Date(occurredAt);
    date.setUTCDate(date.getUTCDate() + offset);
    return [
      objectRoot,
      `cam${cameraId}`,
      String(date.getUTCFullYear()),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
      "",
    ].join("/");
  });
}

function matchesAlert(file: File, alertId: string): boolean {
  const name = file.name;
  if (name.toLowerCase().endsWith(`_${alertId.toLowerCase()}.mp4`)) return true;
  return uuid5(`pixel-civik-shoplifting:${name}`) === alertId.toLowerCase();
}

async function findVideo(
  storage: Storage,
  bucketName: string,
  objectRoot: string,
  cameraId: string,
  occurredAt: Date,
  alertId: string,
): Promise<File | null> {
  const bucket = storage.bucket(bucketName);
  for (const prefix of datePrefixes(objectRoot, cameraId, occurredAt)) {
    const [files] = await bucket.getFiles({ prefix });
    const match = files.find((file) => matchesAlert(file, alertId));
    if (match) return match;
  }
  return null;
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/shoplifting-alerts/[id]/video">
) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) return response({ error: "Alerta inválida" }, 400);

    const requestUrl = new URL(request.url);
    const cameraId = requestUrl.searchParams.get("camera_id") ?? "";
    const occurredAt = new Date(requestUrl.searchParams.get("occurred_at") ?? "");
    if (!CAMERA_ID.test(cameraId) || Number.isNaN(occurredAt.getTime())) {
      return response({ error: "Contexto de alerta inválido" }, 400);
    }

    const bucketName = process.env.GCP_STORAGE_BUCKET;
    if (!bucketName) return response({ error: "Storage no configurado" }, 503);
    const objectRoot = (process.env.GCP_STORAGE_OBJECT_PREFIX ?? "shoplifting/tienda")
      .replace(/^\/+|\/+$/g, "");
    if (!objectRoot) return response({ error: "Prefijo no configurado" }, 503);

    const storage = await storageClient();
    const file = await findVideo(storage, bucketName, objectRoot, cameraId, occurredAt, id);
    if (!file) return response({ error: "Video no encontrado o todavía subiendo" }, 404);

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });
    return response({ url: signedUrl, expires_at: new Date(expiresAt).toISOString() }, 200);
  } catch (error) {
    console.error("shoplifting public video signed URL", error);
    return response({ error: "No se pudo abrir el video" }, 500);
  }
}
