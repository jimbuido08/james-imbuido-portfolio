/**
 * Only in-app relative paths are acceptable post-auth destinations — the one
 * open-redirect guard, used by the auth actions and app/auth/confirm/route.ts.
 * Defaults to /account.
 *
 * Plain module (no "use server") so it can be imported by server pages and
 * action modules alike without Next treating it as an async server action.
 */
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export function safeNext(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
}

/**
 * The protected-page guard: a verified session or a redirect to /login — §5.1
 * and §21 demand the former before any user-specific work. Returns the client
 * (already-refreshed session) and the verified user.
 */
export async function requireUser(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect(`/login?next=${nextPath}`);
  return { supabase, user };
}

/** The auth-page inverse: an authenticated visitor has no business here. */
export async function redirectIfAuthed(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user) redirect("/account");
}
