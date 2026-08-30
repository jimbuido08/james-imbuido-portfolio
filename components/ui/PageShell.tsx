import type { ReactNode } from "react";

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { sectionFor } from "@/lib/sections";

/**
 * One conventional page shell: container + h1 + description pulled from the
 * SectionDef registry by route, then the page's own content. A section's
 * heading copy changes in lib/sections.ts, not in nine page files.
 */
export function PageShell({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const section = sectionFor(href);
  if (!section) {
    throw new Error(
      `PageShell: "${href}" has no SectionDef in lib/sections.ts`,
    );
  }
  return (
    <Container className="py-16 sm:py-24">
      <SectionHeading
        as="h1"
        title={section.h1}
        description={section.description}
      />
      {children}
    </Container>
  );
}
