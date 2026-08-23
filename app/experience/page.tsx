import type { Metadata } from "next";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Timeline, type TimelineEntry } from "@/components/experience/Timeline";

export const metadata: Metadata = {
  title: "Experience — James Imbuido",
  description:
    "Professional experience and education — data scientist at Commonwealth Bank of Australia.",
};

const experienceEntries: TimelineEntry[] = [
  {
    period: "[TODO: James — start date] — Present",
    title: "Data Scientist",
    organisation: "Commonwealth Bank of Australia",
    summary:
      "[TODO: James — describe your role, team, and the problems you work on. 2–3 sentences. Never invent metrics.]",
  },
  {
    period: "[TODO: James — your nursing career or prior role: dates]",
    title: "[TODO: James — your nursing career or prior role: title]",
    organisation:
      "[TODO: James — your nursing career or prior role: organisation]",
    summary:
      "[TODO: James — your nursing career or prior role: summary of what you did]",
  },
];

const educationEntries: TimelineEntry[] = [
  {
    period: "[TODO: James — degree dates]",
    title: "[TODO: James — degree title]",
    organisation: "[TODO: James — university or institution]",
    summary: "[TODO: James — degree summary: field, focus, outcome]",
  },
  {
    period: "[TODO: James — dates]",
    title: "[TODO: James — certification or bootcamp title]",
    organisation: "[TODO: James — provider]",
    summary: "[TODO: James — what you learned]",
  },
];

export default function ExperiencePage() {
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title="Experience"
        description="Professional experience and education — data scientist at Commonwealth Bank of Australia."
      />
      <SectionHeading
        as="h2"
        kicker="Career"
        title="Professional experience"
        className="mt-16"
      />
      <Timeline entries={experienceEntries} />
      <SectionHeading
        as="h2"
        kicker="Education"
        title="Education"
        description="Degrees, certifications, and structured learning."
        className="mt-16"
      />
      <Timeline entries={educationEntries} />
    </Container>
  );
}
