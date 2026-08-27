import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/next";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { JtbLoginInfo } from "@/components/jtb";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign in — James Imbuido",
  description: "Sign in to your James Imbuido account.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user) redirect("/account");

  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading as="h1" title="Sign in" description="Welcome back." />
      {nextPath === "/jtb" && <JtbLoginInfo />}
      <LoginForm next={nextPath} />
    </Container>
  );
}
