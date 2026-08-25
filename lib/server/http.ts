/**
 * Server-side request plumbing for API routes — one adapter owning auth, JSON
 * body parsing, and the error envelope, so route handlers keep only their
 * domain stages (see app/api/jtb/route.ts, app/api/chess/route.ts). Adding a
 * route under §10 (contact, rewards) means writing only its decision core.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Uniform error envelope: { error: { code, message, retryAfterSeconds? }, creditsRemaining? }. */
export function apiError<C extends string>(
  code: C,
  message: string,
  status: number,
  options?: { creditsRemaining?: number; retryAfterSeconds?: number },
): NextResponse {
  const body = {
    error: {
      code,
      message,
      ...(options?.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: options.retryAfterSeconds }
        : {}),
    },
    ...(options?.creditsRemaining !== undefined
      ? { creditsRemaining: options.creditsRemaining }
      : {}),
  };
  return NextResponse.json(body, { status });
}

/** Parse a JSON body without throwing; the caller's error vocabulary renders the 400. */
export async function parseJsonBody(
  request: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false };
  }
}

export type RequireUserResult =
  | { ok: true; supabase: ServerClient; user: User }
  | { ok: false; response: NextResponse };

/** Verified session or a ready-made 401 — §21 demands the former before any work. */
export async function requireUser(
  signInMessage: string,
): Promise<RequireUserResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: apiError("unauthenticated", signInMessage, 401) };
  }
  return { ok: true, supabase, user };
}
