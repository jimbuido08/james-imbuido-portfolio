import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up — James Imbuido",
  description: "Create a James Imbuido account.",
};

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user) redirect("/account");

  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="Sign up"
        description="Create an account — email, password, and employment status."
      />
      <SignupForm />
    </Container>
  );
}
