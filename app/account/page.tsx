import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/next";
import { CHESS_REWARD_CREDITS, INITIAL_CREDITS } from "@/lib/credits/constants";
import { PageShell } from "@/components/ui/PageShell";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = {
  title: "Account — James Imbuido",
  description: "Your James Imbuido account.",
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { supabase, user } = await requireUser("/account");

  // RLS guarantees this returns only this user's own row (or null).
  const { data: profile } = await supabase
    .from("profiles")
    .select("employment_status, credits_remaining, chess_reward_claimed")
    .eq("id", user.id)
    .single();

  return (
    <PageShell href="/account">
      <dl className="mt-8 max-w-prose space-y-4 rounded-lg border border-border bg-surface p-6">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Email</dt>
          <dd className="font-mono text-fg">{user.email ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Employment status</dt>
          <dd className="text-fg">{profile?.employment_status ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">JTB interactions left</dt>
          <dd className="font-mono text-fg">
            {profile?.credits_remaining ?? INITIAL_CREDITS}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-fg-muted">Chess reward</dt>
          <dd className="text-fg">
            {profile?.chess_reward_claimed
              ? `Claimed (+${CHESS_REWARD_CREDITS} JTB)`
              : "Not yet claimed"}
          </dd>
        </div>
      </dl>
      <p className="mt-4 max-w-prose text-sm text-fg-subtle">
        JTB and the chess reward are live — the values above are your real
        database state. Employment status is audience analytics only and never
        gates any feature.
      </p>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </PageShell>
  );
}
