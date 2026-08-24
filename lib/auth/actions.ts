"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isEmploymentStatus } from "@/lib/auth/employment-status";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Only in-app relative paths are acceptable post-auth destinations — same
 * guard as app/auth/confirm/route.ts (no open redirect). Defaults to /account.
 */
export function safeNext(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/account";
}

export interface AuthFormState {
  error: string | null;
}

export interface SignUpState extends AuthFormState {
  /** true only after a successful sign-up when email confirmation is pending. */
  sent: boolean;
}

export async function signUp(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const employmentStatus = String(formData.get("employment_status") ?? "");
  const next = safeNext(formData.get("next"));

  if (!EMAIL_RE.test(email))
    return { error: "Enter a valid email address.", sent: false };
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      sent: false,
    };
  if (!isEmploymentStatus(employmentStatus))
    return { error: "Please choose an employment status.", sent: false };

  // The confirmation email links to
  // /auth/confirm?token_hash=…&type=email&next=<emailRedirectTo>, so the
  // redirect URL points at our confirm route with the destination in `next`.
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: { employment_status: employmentStatus }, // trigger writes it to profiles
    },
  });

  if (error) return { error: error.message, sent: false };
  // Confirmations are ON → session is null; the user must verify the email.
  if (data.session) redirect(next);
  return { error: null, sent: true };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };
  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
