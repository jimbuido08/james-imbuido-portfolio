import type { Metadata } from "next";

import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Contact — James Imbuido",
  description: "How to reach James Imbuido — email, LinkedIn, GitHub, Kaggle.",
};

const fieldClasses =
  "mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40";

export default function ContactPage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="Contact"
        description="How to reach James Imbuido — email, LinkedIn, GitHub, Kaggle."
      />
      <SectionHeading
        as="h2"
        kicker="Direct"
        title="Find me"
        className="mt-16"
      />
      <ul className="mt-6 space-y-3">
        <li>
          <span className="text-fg">Email</span> —{" "}
          <a
            className="font-mono text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
            href="mailto:jtb9029@protonmail.com"
          >
            jtb9029@protonmail.com
          </a>
        </li>
        <li>
          <span className="text-fg">LinkedIn</span> —{" "}
          <a
            className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
            href="https://www.linkedin.com/in/jamesimbuido/"
            rel="noopener noreferrer"
            target="_blank"
          >
            linkedin.com/in/jamesimbuido{" "}
            <span className="text-fg-subtle">↗</span>
          </a>
        </li>
        <li>
          <span className="text-fg">GitHub</span> —{" "}
          <a
            className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
            href="https://github.com/jimbuido08"
            rel="noopener noreferrer"
            target="_blank"
          >
            github.com/jimbuido08 <span className="text-fg-subtle">↗</span>
          </a>
        </li>
        <li>
          <span className="text-fg">Kaggle</span> —{" "}
          <a
            className="text-fg underline underline-offset-4 decoration-border hover:decoration-border-strong"
            href="https://www.kaggle.com/jamesimbuido"
            rel="noopener noreferrer"
            target="_blank"
          >
            kaggle.com/jamesimbuido <span className="text-fg-subtle">↗</span>
          </a>
        </li>
      </ul>
      <SectionHeading
        as="h2"
        kicker="Message"
        title="Send a message"
        description="This form will be wired to a server route in a later phase — it does not send yet."
        className="mt-16"
      />
      <form className="mt-6 max-w-prose space-y-5">
        <div>
          <label htmlFor="contact-name" className="block text-sm text-fg-muted">
            Name
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            disabled
            className={fieldClasses}
          />
        </div>
        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm text-fg-muted"
          >
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            disabled
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
            disabled
            className={fieldClasses}
          ></textarea>
        </div>
        <Button type="submit" disabled>
          Send message
        </Button>
        <p className="text-sm text-fg-subtle">
          This form is not connected yet — it will be handled by a server route
          in a later phase. Until then, use email or LinkedIn above.
        </p>
      </form>
    </Container>
  );
}
