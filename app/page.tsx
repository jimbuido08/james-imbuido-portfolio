import Link from "next/link";

import { DataUniverse } from "@/components/universe/DataUniverse";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import type { TagDomain } from "@/components/ui/Tag";

const domains: {
  href: string;
  title: string;
  tag: string;
  domain: TagDomain;
  description: string;
}[] = [
  {
    href: "/about",
    title: "About",
    tag: "About",
    domain: "neutral",
    description: "Background, path, and values — content in progress.",
  },
  {
    href: "/experience",
    title: "Experience",
    tag: "Experience",
    domain: "neutral",
    description: "Professional timeline and roles — content in progress.",
  },
  {
    href: "/ai-ml",
    title: "AI / ML",
    tag: "AI",
    domain: "ai",
    description: "Machine learning projects and models — content in progress.",
  },
  {
    href: "/data",
    title: "Data Visualisation",
    tag: "Data",
    domain: "data",
    description: "Interactive charts and dashboards — content in progress.",
  },
  {
    href: "/jtb",
    title: "JTB",
    tag: "JTB",
    domain: "jtb",
    description: "A grounded conversational agent — content in progress.",
  },
  {
    href: "/chess",
    title: "Chess AI",
    tag: "Chess",
    domain: "chess",
    description: "Play against a browser chess model — content in progress.",
  },
  {
    href: "/contact",
    title: "Contact",
    tag: "Contact",
    domain: "neutral",
    description: "Get in touch — content in progress.",
  },
];

export default function Home() {
  return (
    <>
      {/* Data Universe viewport — hero copy is SSR'd FIRST (z-10), the 3D
          canvas is an enhancement layered underneath. Without WebGL the
          section still renders hero + nav; the index grid below is the
          conventional fallback (§11.1, §31 P5). */}
      <section className="relative h-[calc(100dvh-4rem)] min-h-[540px] overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-center pt-[10vh]">
          <Container>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-subtle">
              Data × AI × Interactive Systems
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              James Imbuido
            </h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-fg-muted">
              Data Scientist
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/about" className="pointer-events-auto">
                Explore
              </Button>
              <Button
                href="/contact"
                variant="secondary"
                className="pointer-events-auto"
              >
                Contact
              </Button>
            </div>
          </Container>
        </div>

        <div className="absolute inset-0">
          <DataUniverse />
        </div>
      </section>

      {/* Conventional index grid — the keyboard/screen-reader/crawlable path to
          every route; mirrors the Data Universe nodes. */}
      <section className="py-16 sm:py-24">
        <Container>
          <SectionHeading
            kicker="Index"
            title="Explore the portfolio"
            description="Seven sections, navigable in any browser — the conventional fallback that mirrors the Data Universe."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {domains.map((item) => (
              <Link key={item.href} href={item.href} className="block h-full">
                <Card interactive className="h-full">
                  <CardHeader>
                    <Tag domain={item.domain}>{item.tag}</Tag>
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
