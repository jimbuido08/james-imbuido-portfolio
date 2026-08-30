"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { NAV_ITEMS } from "@/lib/navigation";
import { HEADER_SCRIM_Z, HEADER_Z } from "@/lib/universe/zIndex";
import { cx } from "@/lib/utils";

/** First four routes sit in the desktop bar; the rest fold under "More ▾". */
const primaryLinks = NAV_ITEMS.slice(0, 4);
const moreLinks = NAV_ITEMS.slice(4);
const allLinks = NAV_ITEMS;

/** The conventional navigation fallback (§11.1) — the site must work without WebGL. */
export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // mobile disclosure
  const [moreOpen, setMoreOpen] = useState(false); // desktop "More" dropdown
  const moreRef = useRef<HTMLLIElement>(null);

  const isActive = (href: string) => pathname.startsWith(href);
  const moreActive = moreLinks.some((link) => isActive(link.href));

  // Close the "More" dropdown or the mobile panel on Escape (outside click is
  // handled by the scrim for the panel, and by this listener for the dropdown).
  useEffect(() => {
    if (!moreOpen && !open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setOpen(false);
      }
    };
    const onPointerDown = moreOpen
      ? (e: MouseEvent) => {
          if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
            setMoreOpen(false);
          }
        }
      : null;
    if (onPointerDown) document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      if (onPointerDown)
        document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen, open]);

  return (
    <>
      {/* Mobile disclosure scrim — closes the panel on outside click. Lives
          outside <header> because the header's backdrop-blur would otherwise
          become the containing block for this fixed element. */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={`fixed inset-0 ${HEADER_SCRIM_Z} bg-bg/70 md:hidden`}
        />
      )}
      <header
        className={`sticky top-0 ${HEADER_Z} border-b border-border bg-bg/80 backdrop-blur`}
      >
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

        {/* Mobile disclosure panel — full link list, superimposed over the page */}
        {open && (
          <nav
            id="mobile-nav"
            aria-label="Mobile"
            className={`absolute inset-x-0 top-full ${HEADER_Z} border-b border-border bg-bg shadow-lg md:hidden`}
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
    </>
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
