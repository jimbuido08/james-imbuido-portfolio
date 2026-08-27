import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { apiError, getClientIp, parseJsonBody } from "@/lib/server/http";
import { createClient } from "@/lib/supabase/server";
import { submitContactMessage } from "@/lib/contact/submit";
import { RATE_LIMIT_WINDOW_MS } from "@/lib/contact/constants";
import { parseContactMessage } from "@/lib/validation/contact";
import type { ContactErrorCode, ContactSuccess } from "@/lib/contact/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// No maxDuration override: there is no upstream call — the route is one count
// RPC plus one insert RPC, and the rate limit bounds hammering.

/**
 * Salt for hashing client IPs into contact_messages.ip_hash. Unsalted hashing
 * still avoids storing raw IPs; the salt only prevents trivial rainbow-matching
 * against a known IP list, so a missing salt warns once and proceeds.
 */
const CONTACT_IP_SALT = process.env.CONTACT_IP_SALT ?? "";
let saltWarned = false;

export async function POST(request: NextRequest) {
  if (!CONTACT_IP_SALT && !saltWarned) {
    saltWarned = true;
    console.warn(
      "[contact] CONTACT_IP_SALT is unset — ip_hash is unsalted. Set it in .env.local and Vercel.",
    );
  }

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
    .update(CONTACT_IP_SALT + getClientIp(request))
    .digest("hex");

  // 3) Validation — shape-check the submission before any DB work (§33.11).
  const parsedBody = await parseJsonBody(request);
  if (!parsedBody.ok) {
    return apiError<ContactErrorCode>(
      "invalid",
      "Request body must be valid JSON.",
      400,
    );
  }
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

  // 5) Outcome → HTTP. Every wire shape mirrors the jtb/chess routes.
  switch (outcome.kind) {
    case "ok": {
      const body: ContactSuccess = { ok: true };
      return NextResponse.json(body);
    }
    case "rate_limited":
      return apiError<ContactErrorCode>(
        "rate_limited",
        "Too many messages from this network — please try again later or email directly.",
        429,
        { retryAfterSeconds: RATE_LIMIT_WINDOW_MS / 1000 },
      );
    case "internal":
      console.error("[contact] internal:", outcome.detail);
      return apiError<ContactErrorCode>(
        "internal",
        "Something went wrong on our side — please try again.",
        500,
      );
  }
}
