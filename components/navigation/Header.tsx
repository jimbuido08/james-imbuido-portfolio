"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/utils";

const primaryLinks = [
  { href: "/about", label: "About" },
  { href: "/experience", label: "Experience" },
  { href: "/ai-ml", label: "AI/ML" },
  { href: "/data", label: "Data Viz" },
] as const;

/** Folded under the desktop "More ▾" menu; listed plainly in the mobile panel. */
const moreLinks = [
  { href: "/jtb", label: "JTB" },
  { href: "/chess", label: "Chess" },
  { href: "/contact", label: "Contact" },
] as const;

const allLinks = [...primaryLinks, ...moreLinks] as const;

/** The conventional navigation fallback (§11.1) — the site must work without WebGL. */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile disclosure
  const [moreOpen, setMoreOpen] = useState(false); // desktop "More" dropdown
  const moreRef = useRef<HTMLLIElement>(null);

  const isActive = (href: string) => pathname.startsWith(href);
  const moreActive = moreLinks.some((link) => isActive(link.href));

  // Close the "More" dropdown on outside click or Escape.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-semibold">
          James Imbuido | Data Scientist & AI Engineer
        </Link>

        {/* Desktop nav — primary links + "More" dropdown + Account icon */}
        <nav aria-label="Primary" className="hidden md:block">
          <div className="flex items-center gap-5">
            <ul className="flex items-center gap-5">
              {primaryLinks.map((link) => (
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
              <li ref={moreRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  onClick={() => setMoreOpen((v) => !v)}
                  className={cx(
                    "inline-flex items-center gap-1 text-sm transition-colors",
                    moreActive || moreOpen
                      ? "text-fg"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  More
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={cx(
                      "transition-transform",
                      moreOpen && "rotate-180",
                    )}
                  >
                    <path d="M5 8l5 5 5-5" />
                  </svg>
                </button>
                {moreOpen && (
                  <ul
                    role="menu"
                    className="absolute right-0 top-full mt-2 min-w-40 rounded-md border border-border bg-bg py-1 shadow-lg"
                  >
                    {moreLinks.map((link) => (
                      <li key={link.href} role="none">
                        <Link
                          href={link.href}
                          role="menuitem"
                          onClick={() => setMoreOpen(false)}
                          className={cx(
                            "block px-4 py-2 text-sm transition-colors",
                            isActive(link.href)
                              ? "text-fg"
                              : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
            <Link
              href="/account"
              aria-label="Account"
              className={cx(
                "ml-1 transition-colors",
                isActive("/account")
                  ? "text-fg"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              <AccountIcon />
            </Link>
          </div>
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

      {/* Mobile disclosure panel — full link list */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-border bg-bg md:hidden"
        >
          <ul className="flex flex-col px-4 sm:px-6 lg:px-8">
            {[...allLinks, { href: "/account", label: "Account" }].map(
              (link) => (
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
              ),
            )}
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

function AccountIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="7" r="3.5" />
      <path d="M4 17c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5" />
    </svg>
  );
}
