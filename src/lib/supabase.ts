import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// La configuración viene EXCLUSIVAMENTE del entorno. No hay fallback.
//
// Antes había una PROJECT_URL y una anon key del proyecto xpubdazwixxdckiunhvt
// escritas aquí, como red de seguridad ante una variable de Vercel truncada.
// Se eliminaron el 2026-09-13 al migrar el proyecto: un fallback apuntando al
// proyecto viejo hace que una variable mal configurada conecte la app en
// silencio a la base equivocada, que es peor que una caída visible. Además esa
// key quedó versionada en GitHub.
//
// Si esto revienta en build o arranque, la causa es una variable ausente o mal
// pegada en Vercel, no un problema de código.

function isCompleteJwt(value: string | undefined): value is string {
  if (!value || value.length < 150) return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every(Boolean);
}

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!configuredUrl?.startsWith("https://")) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL ausente o inválida. Debe ser la URL https del proyecto Supabase."
  );
}
if (!isCompleteJwt(configuredKey)) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY ausente o incompleta. Suele ser una variable truncada al pegarla en Vercel."
  );
}

const url = configuredUrl;
const key = configuredKey;

// Persist the client on globalThis so Turbopack HMR hot-reloads don't create
// a second GoTrueClient instance in the same browser context.
const G = globalThis as typeof globalThis & { __supabase?: SupabaseClient };
if (!G.__supabase) {
  G.__supabase = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: {
      headers: { apikey: key },
    },
  });
}
export const supabase = G.__supabase;

export async function rpc<T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T[]> {
  const q = supabase.rpc(fn, params);
  const { data, error } = await (signal ? q.abortSignal(signal) : q);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data as T[]) ?? [];
}

/**
 * RPC que devuelve un valor escalar (jsonb), no un conjunto de filas.
 * dashboard_overview y dashboard_compare devuelven un único objeto JSON, así
 * que castearlo a array como hace `rpc` daría un tipo equivocado.
 */
export async function rpcOne<T = unknown>(
  fn: string,
  params: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const q = supabase.rpc(fn, params);
  const { data, error } = await (signal ? q.abortSignal(signal) : q);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
