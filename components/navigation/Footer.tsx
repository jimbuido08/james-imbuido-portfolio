import Link from "next/link";

import { Container } from "@/components/ui/Container";

const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/experience", label: "Experience" },
  { href: "/ai-ml", label: "AI/ML" },
  { href: "/data", label: "Data" },
  { href: "/jtb", label: "JTB" },
  { href: "/chess", label: "Chess" },
  { href: "/contact", label: "Contact" },
] as const;

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
        <p className="text-sm text-fg-subtle">© {year} James Imbuido</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-fg-subtle transition-colors hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </Container>
    </footer>
  );
}
