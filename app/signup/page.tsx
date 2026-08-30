import type { Metadata } from "next";

import { redirectIfAuthed, safeNext } from "@/lib/auth/next";
import { PageShell } from "@/components/ui/PageShell";
import { JtbLoginInfo } from "@/components/jtb";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up — James Imbuido",
  description: "Create a James Imbuido account.",
};

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  await redirectIfAuthed();

  return (
    <PageShell href="/signup">
      {nextPath === "/jtb" && <JtbLoginInfo />}
      <SignupForm next={nextPath} />
    </PageShell>
  );
}
