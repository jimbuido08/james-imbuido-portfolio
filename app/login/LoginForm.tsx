"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";

const initialState = { error: null as string | null };

export function LoginForm({ next = "/account" }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  const crossLink =
    next !== "/account"
      ? `/signup?next=${encodeURIComponent(next)}`
      : "/signup";

  return (
    <form action={formAction} className="mt-6 max-w-prose space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="login-email" className="block text-sm text-fg-muted">
          Email
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="login-password" className="block text-sm text-fg-muted">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={fieldClasses}
        />
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-accent-exp">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-sm text-fg-subtle">
        No account yet?{" "}
        <Link
          href={crossLink}
          className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
        >
          Create one
        </Link>
        .
      </p>
    </form>
  );
}
