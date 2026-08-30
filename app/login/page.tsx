import type { Metadata } from "next";

import { redirectIfAuthed, safeNext } from "@/lib/auth/next";
import { PageShell } from "@/components/ui/PageShell";
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
  await redirectIfAuthed();

  return (
    <PageShell href="/login">
      {nextPath === "/jtb" && <JtbLoginInfo />}
      <LoginForm next={nextPath} />
    </PageShell>
  );
}
