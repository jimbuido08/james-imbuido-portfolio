import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { contactIpSalt } from "@/lib/config";
import {
  apiError,
  getClientIp,
  invalidJsonError,
  outcomeError,
  parseJsonBody,
} from "@/lib/server/http";
import { createClient } from "@/lib/supabase/server";
import { describeOutcome, submitContactMessage } from "@/lib/contact/submit";
import { parseContactMessage } from "@/lib/validation/contact";
import type { ContactErrorCode, ContactSuccess } from "@/lib/contact/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No maxDuration override: there is no upstream call — the route is one count
// RPC plus one insert RPC, and the rate limit bounds hammering.

/**
 * The IP salt is read through lib/config.ts inside the handler: a missing
 * salt throws EnvConfigError (→ 500) rather than silently recording an
 * unsalted hash — see that module for the rationale.
 */
export async function POST(request: NextRequest) {
  const ipSalt = contactIpSalt();

  // 1) Same-origin guard — a cross-origin browser form post carries an origin
  //    header that cannot match this host. Cheap, and complements the honeypot.
  const origin = request.headers.get("origin");
  if (origin) {
    const originHost = new URL(origin).host;
    if (originHost !== request.headers.get("host")) {
      return apiError<ContactErrorCode>(
        "invalid",
        "Submission could not be accepted.",
        403,
      );
    }
  }

  // 2) Client identity — hashed IP (§21: never store raw visitor identifiers).
  const ipHash = createHash("sha256")
    .update(ipSalt + getClientIp(request))
    .digest("hex");

  // 3) Validation — shape-check the submission before any DB work (§33.11).
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) return invalidJsonError();
  const parsed = parseContactMessage(parsedBody.body);
  if (!parsed.ok) {
    return apiError<ContactErrorCode>("invalid", parsed.error, 400);
  }

  // 4) The submission — §22's policy lives in lib/contact/submit.ts; the
  //    closures below are the Supabase adapter it runs against. Nothing here
  //    decides. No auth: the form is deliberately open to anonymous visitors.
  const supabase = await createClient();
  const outcome = await submitContactMessage(
    {
      countRecentByIp: async (hash, windowStartIso) => {
        const { data, error } = await supabase.rpc(
          "count_recent_contact_messages",
          { p_ip_hash: hash, p_since: windowStartIso },
        );
        if (error) {
          console.error(
            "[contact] count_recent_contact_messages error:",
            error.message,
          );
          return { ok: false };
        }
        return { ok: true, count: typeof data === "number" ? data : 0 };
      },
      insertMessage: async ({ name, email, message, ipHash }) => {
        const { data, error } = await supabase.rpc("record_contact_message", {
          p_name: name,
          p_email: email,
          p_message: message,
          p_ip_hash: ipHash,
        });
        if (error) {
          console.error(
            "[contact] record_contact_message error:",
            error.message,
          );
          return { ok: false };
        }
        return { ok: true, recorded: data === true };
      },
    },
    {
      name: parsed.value.name,
      email: parsed.value.email,
      message: parsed.value.message,
      ipHash,
    },
    Date.now(),
  );

  // 5) Outcome → HTTP. Success is an empty body; every error view comes from
  //    the outcome table in lib/contact/submit.ts (describeOutcome).
  if (outcome.kind !== "ok") {
    if ("detail" in outcome) {
      console.error(`[contact] ${outcome.kind}:`, outcome.detail);
    }
    return outcomeError(describeOutcome(outcome));
  }

  const body: ContactSuccess = { ok: true };
  return NextResponse.json(body);
}
