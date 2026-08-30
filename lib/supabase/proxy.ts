import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/config";

/**
 * Session-refresh helper for the root proxy.ts (Next 16 renamed middleware →
 * proxy). Runs on every non-static request so the auth cookie stays fresh.
 * This is a public portfolio — the proxy NEVER redirects; each protected
 * route guards itself with getUser()/redirect().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims().
  // getClaims() verifies the JWT locally (JWKS) — Supabase's recommended
  // server-side identity check; refresh flows through the setAll handler.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
