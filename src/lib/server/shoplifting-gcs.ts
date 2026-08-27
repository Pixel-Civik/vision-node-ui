import { createHash } from "node:crypto";
import type { File } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

const URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

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

export function safeGcsErrorCode(error: unknown): string {
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

async function storageClient(): Promise<Storage> {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) throw new Error("Falta GCP_PROJECT_ID");

  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (projectNumber && poolId && providerId && serviceAccount) {
    const subjectToken = await getVercelOidcToken();
    const audience = `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
    const authClient = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: async () => subjectToken },
    });
    if (!authClient) throw new Error("No se pudo iniciar identidad efímera GCP");
    await authClient.getAccessToken();
    return new Storage({ projectId, authClient });
  }
  return new Storage({ projectId });
}

function datePrefixes(objectRoot: string, cameraId: string, occurredAt: Date): string[] {
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
  if (file.name.toLowerCase().endsWith(`_${alertId.toLowerCase()}.mp4`)) return true;
  return uuid5(`pixel-civik-shoplifting:${file.name}`) === alertId.toLowerCase();
}

export async function findAlertVideo(
  cameraId: string,
  occurredAt: Date,
  alertId: string,
): Promise<File | null> {
  const bucketName = process.env.GCP_STORAGE_BUCKET;
  if (!bucketName) throw new Error("Storage no configurado");
  const objectRoot = (process.env.GCP_STORAGE_OBJECT_PREFIX ?? "shoplifting/tienda")
    .replace(/^\/+|\/+$/g, "");
  if (!objectRoot) throw new Error("Prefijo no configurado");

  const storage = await storageClient();
  const bucket = storage.bucket(bucketName);
  for (const prefix of datePrefixes(objectRoot, cameraId, occurredAt)) {
    const [files] = await bucket.getFiles({ prefix });
    const match = files.find((file) => matchesAlert(file, alertId));
    if (match) return match;
  }
  return null;
}

export async function findAlertThumbnail(video: File): Promise<File | null> {
  const thumbnail = video.bucket.file(video.name.replace(/\.mp4$/i, ".jpg"));
  const [exists] = await thumbnail.exists();
  return exists ? thumbnail : null;
}

export async function signReadUrl(file: File, ttlMs = 5 * 60 * 1000) {
  const expiresAt = Date.now() + ttlMs;
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: expiresAt,
  });
  return { url, expiresAt };
}
