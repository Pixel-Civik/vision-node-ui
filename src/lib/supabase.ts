import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://xpubdazwixxdckiunhvt.supabase.co";

// This is the project's public `anon` JWT, not a service-role/secret key.
// Keeping a known-good public fallback prevents a truncated Vercel variable
// from disabling the dashboard, alerts and Realtime for every visitor.
const PROJECT_ANON_PUBLIC_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwdWJkYXp3aXh4ZGNraXVuaHZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTc0NzksImV4cCI6MjA4ODgzMzQ3OX0.BcJaPndbNGsc9l4B7bNHeJvABQKwUtnXkywlbFrnEFs";

function isCompleteJwt(value: string | undefined): value is string {
  if (!value || value.length < 150) return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every(Boolean);
}

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const url = configuredUrl?.startsWith("https://") ? configuredUrl : PROJECT_URL;
const key = isCompleteJwt(configuredKey)
  ? configuredKey
  : PROJECT_ANON_PUBLIC_KEY;

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
