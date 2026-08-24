"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isEmploymentStatus } from "@/lib/auth/employment-status";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

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

  if (!EMAIL_RE.test(email))
    return { error: "Enter a valid email address.", sent: false };
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      sent: false,
    };
  if (!isEmploymentStatus(employmentStatus))
    return { error: "Please choose an employment status.", sent: false };

  // Email redirect URL must be an absolute URL (the confirmation email links to
  // /auth/confirm?token_hash=…&type=email&next=<this>).
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  const origin = `${protocol}://${host}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/account`,
      data: { employment_status: employmentStatus }, // trigger writes it to profiles
    },
  });

  if (error) return { error: error.message, sent: false };
  // Confirmations are ON → session is null; the user must verify the email.
  if (data.session) redirect("/account");
  return { error: null, sent: true };
}

export async function signIn(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };
  redirect("/account");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
