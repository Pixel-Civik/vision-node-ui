import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Persist the client on globalThis so Turbopack HMR hot-reloads don't create
// a second GoTrueClient instance in the same browser context.
const G = globalThis as typeof globalThis & { __supabase?: SupabaseClient };
if (!G.__supabase) {
  G.__supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  });
}
export const supabase = G.__supabase;

export async function rpc<T = unknown>(
  fn: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data as T[]) ?? [];
}
