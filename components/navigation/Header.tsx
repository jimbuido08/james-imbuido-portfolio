"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cx } from "@/lib/utils";

const navLinks = [
  { href: "/about", label: "About" },
  { href: "/experience", label: "Experience" },
  { href: "/ai-ml", label: "AI/ML" },
  { href: "/data", label: "Data Viz" },
  { href: "/jtb", label: "JTB" },
  { href: "/chess", label: "Chess" },
  { href: "/contact", label: "Contact" },
] as const;

/** The conventional navigation fallback (§11.1) — the site must work without WebGL. */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold">
          James Imbuido | Data Scientist & AI Engineer
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cx(
                    "text-sm transition-colors",
                    isActive(link.href)
                      ? "text-fg"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {/* Mobile disclosure panel */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-border bg-bg md:hidden"
        >
          <ul className="flex flex-col px-4 sm:px-6 lg:px-8">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "block border-b border-border/60 py-3 text-sm transition-colors last:border-b-0",
                    isActive(link.href)
                      ? "text-fg"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h14M3 10h14M3 14h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 5l10 10M15 5l-10 10" />
    </svg>
  );
}
