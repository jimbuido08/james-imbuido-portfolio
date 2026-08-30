"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import {
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
} from "@/lib/contact/constants";
import type { ContactError, ContactSuccess } from "@/lib/contact/types";

type ContactFormState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent" }
  | { kind: "failed"; message: string };

const fieldClasses =
  "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/** "Send a message" form: submits to POST /api/contact, which stores the message (§22). */
export function ContactForm() {
  const [state, setState] = useState<ContactFormState>({ kind: "idle" });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          // Honeypot — bots that fill it are rejected server-side before any
          // database work; sending it here keeps the check possible.
          website: data.get("website"),
        }),
      });
      const payload = (await res.json()) as ContactSuccess | ContactError;
      if (res.ok && "ok" in payload && payload.ok) {
        setState({ kind: "sent" });
        return;
      }
      if (!("error" in payload)) {
        setState({ kind: "failed", message: "Unexpected server response." });
        return;
      }
      setState({ kind: "failed", message: payload.error.message });
    } catch {
      setState({
        kind: "failed",
        message: "Couldn't reach the server — check your connection.",
      });
    }
  }

  if (state.kind === "sent") {
    return (
      <div aria-live="polite" className="mt-6 max-w-prose">
        <p className="text-sm text-fg">
          Message sent — thank you. James will read it soon.
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          Need a faster reply?{" "}
          <a className={linkClasses} href="mailto:jtb9029@protonmail.com">
            Email directly
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      className="mt-6 max-w-prose space-y-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      {/* Honeypot: hidden from people, irresistible to naive form-spam bots. */}
      <input
        type="text"
        name="website"
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div>
        <label htmlFor="contact-name" className="block text-sm text-fg-muted">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={MAX_NAME_LENGTH}
          disabled={state.kind === "submitting"}
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="contact-email" className="block text-sm text-fg-muted">
          Email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={MAX_EMAIL_LENGTH}
          disabled={state.kind === "submitting"}
          className={fieldClasses}
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm text-fg-muted"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={state.kind === "submitting"}
          className={`${fieldClasses} h-32 resize-none overflow-y-auto`}
        ></textarea>
      </div>
      {state.kind === "failed" && (
        <p role="alert" className="text-sm text-accent-exp">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={state.kind === "submitting"}>
        {state.kind === "submitting" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
