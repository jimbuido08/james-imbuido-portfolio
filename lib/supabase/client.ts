import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/supabase";

/** Browser client (§4.2 pattern) — lazy singleton, used by client components. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
