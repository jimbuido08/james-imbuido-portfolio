import type { Metadata } from "next";

import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "About — James Imbuido",
  description:
    "Who James Imbuido is — from nursing to data science, and how he thinks about technology.",
};

export default function AboutPage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="About"
        description="Who James Imbuido is — from nursing to data science, and how he thinks about technology."
      />
      <SectionHeading
        as="h2"
        kicker="Introduction"
        title="Who I am"
        className="mt-16"
      />
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        <span className="font-mono text-fg-subtle">
          [TODO: James — write your personal introduction: who you are, where
          you&apos;re based, what you&apos;re interested in]
        </span>
      </p>
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        <span className="font-mono text-fg-subtle">
          [TODO: James — a second paragraph on your background and what you do
          day to day]
        </span>
      </p>
      <SectionHeading
        as="h2"
        kicker="Journey"
        title="Nursing → Data Science"
        className="mt-16"
      />
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        James began his career in nursing before transitioning into data
        science.{" "}
        <span className="font-mono text-fg-subtle">
          [TODO: James — explain why and how you made the transition, and what
          it taught you]
        </span>
      </p>
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        <span className="font-mono text-fg-subtle">
          [TODO: James — when did the transition happen, and what training or
          self-study was involved?]
        </span>
      </p>
      <SectionHeading
        as="h2"
        kicker="Approach"
        title="How I think about technology"
        className="mt-16"
      />
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        <span className="font-mono text-fg-subtle">
          [TODO: James — your philosophy on technology: how you approach
          problems, tools, and learning]
        </span>
      </p>
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        <span className="font-mono text-fg-subtle">
          [TODO: James — a second thought on how technology should serve people
          and outcomes]
        </span>
      </p>
      <div className="mt-16">
        <Button href="/contact" variant="secondary">
          Get in touch
        </Button>
        <Button href="/experience" variant="ghost" className="ml-3">
          See experience
        </Button>
      </div>
    </Container>
  );
}
