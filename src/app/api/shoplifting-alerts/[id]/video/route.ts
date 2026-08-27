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

type OidcDiagnostics = {
  iss?: string;
  aud?: string | string[];
  owner_id?: string;
  project_id?: string;
  environment?: string;
};

class OidcExchangeError extends Error {
  constructor(
    message: string,
    readonly diagnostics: OidcDiagnostics,
  ) {
    super(message);
    this.name = "OidcExchangeError";
  }
}

function oidcDiagnostics(token: string): OidcDiagnostics {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    return {
      iss: typeof payload.iss === "string" ? payload.iss : undefined,
      aud:
        typeof payload.aud === "string" || Array.isArray(payload.aud)
          ? (payload.aud as string | string[])
          : undefined,
      owner_id: typeof payload.owner_id === "string" ? payload.owner_id : undefined,
      project_id: typeof payload.project_id === "string" ? payload.project_id : undefined,
      environment:
        typeof payload.environment === "string" ? payload.environment : undefined,
    };
  } catch {
    return {};
  }
}

function response(body: object, status: number) {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, "X-App-Revision": revision },
  });
}

function safeErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("oidc token") || message.includes("vercel_oidc_token")) {
    return "OIDC_TOKEN_UNAVAILABLE";
  }
  if (message.includes("invalid_target") || message.includes("audience")) {
    return "OIDC_AUDIENCE_REJECTED";
  }
  if (message.includes("attribute condition")) return "OIDC_ATTRIBUTE_REJECTED";
  if (message.includes("permission") || message.includes("forbidden")) {
    return "GCP_PERMISSION_DENIED";
  }
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
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
    // Obtenerlo dentro del contexto de la petición garantiza que Vercel
    // entregue x-vercel-oidc-token. Además permite separar fallos OIDC de
    // errores posteriores al buscar o firmar el objeto de GCS.
    const subjectToken = await getVercelOidcToken();
    const diagnostics = oidcDiagnostics(subjectToken);
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
      subject_token_supplier: { getSubjectToken: async () => subjectToken },
    });
    if (!authClient) throw new Error("No se pudo iniciar identidad efímera GCP");
    try {
      await authClient.getAccessToken();
    } catch (error) {
      throw new OidcExchangeError(
        error instanceof Error ? error.message : "OIDC exchange failed",
        diagnostics,
      );
    }
    return new Storage({ projectId, authClient });
  }
  return new Storage({ projectId });
}

function datePrefixes(objectRoot: string, cameraId: string, occurredAt: Date): string[] {
  // El objeto usa la fecha Perú del evento. ±1 día UTC cubre clips cercanos a
  // medianoche sin listar el bucket completo; la categoría es un subdirectorio.
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

    stage = "configuration";
    const bucketName = process.env.GCP_STORAGE_BUCKET;
    if (!bucketName) return response({ error: "Storage no configurado" }, 503);
    const objectRoot = (process.env.GCP_STORAGE_OBJECT_PREFIX ?? "shoplifting/tienda")
      .replace(/^\/+|\/+$/g, "");
    if (!objectRoot) return response({ error: "Prefijo no configurado" }, 503);

    stage = "gcp_auth";
    const storage = await storageClient();
    stage = "gcs_lookup";
    const file = await findVideo(storage, bucketName, objectRoot, cameraId, occurredAt, id);
    if (!file) return response({ error: "Video no encontrado o todavía subiendo" }, 404);

    stage = "gcs_sign";
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });
    return response({ url: signedUrl, expires_at: new Date(expiresAt).toISOString() }, 200);
  } catch (error) {
    const code = safeErrorCode(error);
    console.error("shoplifting public video signed URL", { stage, code, error });
    return response(
      {
        error: "No se pudo abrir el video",
        stage,
        code,
        ...(error instanceof OidcExchangeError
          ? { oidc: error.diagnostics }
          : {}),
      },
      500,
    );
  }
}
