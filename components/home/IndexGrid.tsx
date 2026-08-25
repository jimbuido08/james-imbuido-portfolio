import Link from "next/link";

import { NAV_ITEMS } from "@/lib/navigation";
import { UNIVERSE_NODES } from "@/lib/universe/config";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";

// The conventional index — mirrors the Data Universe nodes. Sourced from the
// same registries (lib/navigation.ts + lib/universe/config.ts) so routes and
// labels can't drift from the header or the 3D scene.
const nodeByRoute = new Map(UNIVERSE_NODES.map((node) => [node.route, node]));

const items = NAV_ITEMS.map((item) => {
  const node = nodeByRoute.get(item.href);
  return {
    href: item.href,
    title: node?.label ?? item.label,
    tag: node?.shortLabel ?? node?.label ?? item.label,
    domain: node?.domain ?? "neutral",
    description: node?.blurb ?? "Get in touch — content in progress.",
  };
});

/**
 * §11.1 fallback: the conventional, crawlable path to every route. Rendered
 * below the Data Universe viewport so the homepage works without WebGL, JS, or
 * a screen reader that can't see the canvas.
 */
export function IndexGrid() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <SectionHeading
          kicker="Index"
          title="Explore the portfolio"
          description="Seven sections, navigable in any browser — the conventional fallback that mirrors the Data Universe."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
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
  );
}
