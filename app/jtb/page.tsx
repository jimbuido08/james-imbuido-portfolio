import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/next";
import { INITIAL_CREDITS } from "@/lib/credits/constants";
import { ChatWindow } from "@/components/jtb";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "JTB — James Imbuido",
  description: "Ask JTB about James's work, experience, skills, and projects.",
};

export const dynamic = "force-dynamic";

export default async function JtbPage() {
  const { supabase, user } = await requireUser("/jtb");

  // RLS guarantees this returns only this user's own row (or null).
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", user.id)
    .single();

  return (
    <PageShell href="/jtb">
      <ChatWindow
        initialCredits={profile?.credits_remaining ?? INITIAL_CREDITS}
        className="mt-8"
      />
    </PageShell>
  );
}
