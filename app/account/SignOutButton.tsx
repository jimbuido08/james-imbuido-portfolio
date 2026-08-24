"use client";

import { useTransition } from "react";

import { signOut } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => signOut())}
    >
      {isPending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
