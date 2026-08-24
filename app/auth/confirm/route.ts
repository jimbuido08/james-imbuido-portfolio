import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const nextParam = searchParams.get("next");

  // Only in-app relative paths may be redirected to (no open redirect).
  const next =
    nextParam?.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/account";

  if (tokenHash && type === "email") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(
    `${origin}/login?error=Could not verify your email`,
  );
}
