"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp } from "@/lib/auth/actions";
import { EMPLOYMENT_STATUSES } from "@/lib/auth/employment-status";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { Button } from "@/components/ui/Button";

const fieldClasses =
  "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

const initialState = { error: null as string | null, sent: false };

export function SignupForm({ next = "/account" }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(signUp, initialState);

  const signInLink =
    next !== "/account" ? `/login?next=${encodeURIComponent(next)}` : "/login";

  if (state.sent) {
    return (
      <p className="mt-6 max-w-prose rounded-lg border border-border bg-surface p-6 text-fg">
        Check your email for a confirmation link. Once you verify, you can sign
        in.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 max-w-prose space-y-5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="signup-email" className="block text-sm text-fg-muted">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={fieldClasses}
        />
      </div>
      <div>
        <label
          htmlFor="signup-password"
          className="block text-sm text-fg-muted"
        >
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className={fieldClasses}
        />
        <p className="mt-1 text-xs text-fg-subtle">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>
      <div>
        <label
          htmlFor="signup-employment"
          className="block text-sm text-fg-muted"
        >
          Employment status
        </label>
        <select
          id="signup-employment"
          name="employment_status"
          required
          className={fieldClasses}
        >
          <option value="" disabled>
            Choose one…
          </option>
          {EMPLOYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-fg-subtle">
          Used only for audience analytics — never gates any feature.
        </p>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-accent-exp">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-sm text-fg-subtle">
        Already have an account?{" "}
        <Link
          href={signInLink}
          className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
        >
          Sign in
        </Link>
        .
      </p>
    </form>
  );
}
