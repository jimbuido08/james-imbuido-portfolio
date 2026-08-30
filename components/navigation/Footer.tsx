import Link from "next/link";

import { Container } from "@/components/ui/Container";

/** Utility footer: copyright + current link. Social links (LinkedIn/GitHub)
    belong here once their URLs exist — see app/contact/page.tsx placeholders. */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <Container className="flex items-center justify-between py-8">
        <p className="text-sm text-fg-subtle">© {year} James Imbuido</p>
        <Link
          href="/contact"
          className="text-sm text-fg-subtle transition-colors hover:text-fg"
        >
          Contact
        </Link>
      </Container>
    </footer>
  );
}
