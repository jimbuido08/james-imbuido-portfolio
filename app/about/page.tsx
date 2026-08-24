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
        I&apos;m James Imbuido, a Data Scientist and AI Engineer based in
        Victoria, Australia. I build in Python and R, ship dashboards in Tableau
        and Power BI, and I don&apos;t trust a number until I&apos;ve checked it
        twice.
      </p>
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        Before this I worked for four years as a Registered Nurse in Victorian
        hospitals — most recently as a mental-health case manager in Maroondah,
        and earlier through pediatric oncology and ICU rotations at Dandenong
        Hospital, where I learned to synthesize clinical data across teams and
        act on it under precision pressure. I&apos;m an MSc Data Science
        graduate (Distinction), and I&apos;m currently an Associate Data
        Scientist at Commonwealth Bank — applying Agentic AI Engineering across
        CBA to take a POC AI solution to production.
      </p>
      <SectionHeading
        as="h2"
        kicker="Approach"
        title="How I think about technology"
        className="mt-16"
      />
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        I am fascinated with the human mind, hence my background in nursing
        (specializing in psychology &amp; mental health), of which I used in
        fusion with my casual interest in technology to ultimately pursue the
        study of Machine Learning and Artificial Intelligence (A.I.) — the
        closest and most interesting thing to me that compares to how the human
        mind works.
      </p>
      <p className="mt-6 max-w-prose text-base leading-relaxed text-fg-muted">
        Technology, to me, is only as good as the people it serves. My years in
        nursing taught me that the best tools are the ones that let a team act
        with confidence under pressure — and that a number, a model, or a
        dashboard is worthless if it can&apos;t be trusted or acted on. I care
        less about cleverness for its own sake and more about whether what I
        build helps someone make a better decision.
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
