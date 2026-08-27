import type { Metadata } from "next";

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import type { TagDomain } from "@/components/ui/Tag";

export const metadata: Metadata = {
  title: "Design System",
  robots: { index: false, follow: false },
};

const colorSwatches = [
  { name: "bg", className: "bg-bg", border: true },
  { name: "surface", className: "bg-surface", border: true },
  { name: "surface-2", className: "bg-surface-2", border: true },
  { name: "border", className: "bg-border", border: true },
  { name: "border-strong", className: "bg-border-strong" },
  { name: "fg", className: "bg-fg" },
  { name: "fg-muted", className: "bg-fg-muted" },
  { name: "fg-subtle", className: "bg-fg-subtle" },
  { name: "accent-ai", className: "bg-accent-ai" },
  { name: "accent-jtb", className: "bg-accent-jtb" },
  { name: "accent-chess", className: "bg-accent-chess" },
  { name: "accent-neut", className: "bg-accent-neut" },
  { name: "focus", className: "bg-focus" },
];

const tagDomains: TagDomain[] = ["ai", "jtb", "chess", "neutral"];

export default function DesignPage() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="space-y-16 sm:space-y-24">
        <section>
          <SectionHeading
            kicker="Phase 1 preview"
            title="Design System"
            description="Internal showcase of every token and primitive. Not linked from the site and blocked from search indexing."
          />
        </section>

        {/* Color tokens */}
        <section>
          <SectionHeading
            kicker="Tokens"
            title="Color"
            description="Design tokens from §3.1 — every color is a CSS variable, so it also exists as a utility."
          />
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {colorSwatches.map((swatch) => (
              <div key={swatch.name}>
                <div
                  className={`h-16 rounded-md ${swatch.className} ${
                    swatch.border ? "border border-border" : ""
                  }`}
                />
                <p className="mt-2 font-mono text-xs text-fg-subtle">
                  {swatch.name}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Type scale */}
        <section>
          <SectionHeading kicker="Typography" title="Type scale" />
          <div className="mt-8 space-y-6">
            <div>
              <p className="font-mono text-xs text-fg-subtle">Display / H1</p>
              <p className="text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
                The data tells a story
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-fg-subtle">H2 / section</p>
              <p className="text-2xl font-semibold tracking-tight sm:text-3xl">
                The data tells a story
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-fg-subtle">H3</p>
              <p className="text-xl font-semibold tracking-tight">
                The data tells a story
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-fg-subtle">Body</p>
              <p className="max-w-prose text-base leading-relaxed text-fg-muted">
                Body copy sits in fg-muted with relaxed leading, keeping primary
                text reserved for headings and emphasis.
              </p>
            </div>
            <div>
              <p className="font-mono text-xs text-fg-subtle">
                Small / caption
              </p>
              <p className="text-sm text-fg-subtle">Captions and metadata.</p>
            </div>
            <div>
              <p className="font-mono text-xs text-fg-subtle">
                Eyebrow / kicker
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-subtle">
                Eyebrow label
              </p>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section>
          <SectionHeading kicker="Actions" title="Buttons" />
          <div className="mt-8 flex flex-wrap gap-4">
            {(["primary", "secondary", "ghost"] as const).map((variant) => (
              <div key={variant} className="flex flex-wrap items-center gap-3">
                <Button variant={variant} size="sm">
                  {variant} sm
                </Button>
                <Button variant={variant} size="md">
                  {variant} md
                </Button>
                <Button variant={variant} size="lg">
                  {variant} lg
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-xs text-fg-subtle">
            Primary renders a Link when given href.
          </p>
        </section>

        {/* Tags */}
        <section>
          <SectionHeading kicker="Domain markers" title="Tags" />
          <div className="mt-8 flex flex-wrap gap-3">
            {tagDomains.map((domain) => (
              <Tag key={domain} domain={domain}>
                {domain}
              </Tag>
            ))}
          </div>
        </section>

        {/* Cards */}
        <section>
          <SectionHeading kicker="Composition" title="Cards" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <Tag domain="ai">AI</Tag>
                <CardTitle>Composed card</CardTitle>
                <CardDescription>
                  Header, title, description, and footer laid out with the
                  standard rhythm.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>
            <Card interactive>
              <CardHeader>
                <Tag domain="jtb">JTB</Tag>
                <CardTitle>Interactive card</CardTitle>
                <CardDescription>
                  Hovering raises the border emphasis — the affordance for
                  linked cards.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>
      </div>
    </Container>
  );
}
