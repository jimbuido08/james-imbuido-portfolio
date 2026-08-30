"use client";

import type { FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import {
  postJsonApi,
  outcomeErrorMessage,
  useApiSubmit,
} from "@/lib/client/submit";
import {
  MAX_EMAIL_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
} from "@/lib/contact/constants";
import type { ContactError, ContactSuccess } from "@/lib/contact/types";

const linkClasses =
  "text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong";

/** "Send a message" form: submits to POST /api/contact, which stores the message (§22). */
export function ContactForm() {
  const { state, submit } = useApiSubmit<ContactSuccess, ContactError>();

  const submitting = state.kind === "submitting";
  const sent = state.kind === "done" && state.outcome.kind === "ok";
  const failureMessage = outcomeErrorMessage(
    state.kind === "done" ? state.outcome : null,
  );

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await submit(() =>
      postJsonApi<ContactSuccess, ContactError>("/api/contact", {
        name: data.get("name"),
        email: data.get("email"),
        message: data.get("message"),
        // Honeypot — bots that fill it are rejected server-side before any
        // database work; sending it here keeps the check possible.
        website: data.get("website"),
      }),
    );
  }

  if (sent) {
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
          disabled={submitting}
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
          disabled={submitting}
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
          disabled={submitting}
          className={`${fieldClasses} h-32 resize-none overflow-y-auto`}
        ></textarea>
      </div>
      {failureMessage && (
        <p role="alert" className="text-sm text-accent-exp">
          {failureMessage}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
