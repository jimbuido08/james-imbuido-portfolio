import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { INITIAL_CREDITS } from "@/lib/credits/constants";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ChatWindow } from "@/components/jtb";

export const metadata: Metadata = {
  title: "JTB — James Imbuido",
  description:
    "Ask JTB about James's work, experience, skills, and projects.",
};

export const dynamic = "force-dynamic";

export default async function JtbPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect("/login?next=/jtb");

  // RLS guarantees this returns only this user's own row (or null).
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", user.id)
    .single();

  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="JTB — James Talks Back"
        description="A chatbot grounded in approved information about James's work."
      />
      <ChatWindow
        initialCredits={profile?.credits_remaining ?? INITIAL_CREDITS}
        className="mt-8"
      />
    </Container>
  );
}
