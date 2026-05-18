import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, key);

export async function rpc<T = unknown>(
  fn: string,
  params: Record<string, unknown>
): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    console.error(`RPC ${fn} error:`, error.message);
    return [];
  }
  return (data as T[]) ?? [];
}
