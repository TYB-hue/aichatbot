import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const browserGlobal = globalThis as typeof globalThis & { orbitSupabase?: SupabaseClient };
export function browserClient() {
  if (typeof window === "undefined") throw new Error("Browser client must be initialized in the browser.");
  return browserGlobal.orbitSupabase ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
