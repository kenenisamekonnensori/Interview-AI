"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

import { BrandMark } from "./brand-mark";

const NAV_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "FAQ", href: "/#faq" },
  { label: "Pricing", href: "/pricing" },
] as const;

/**
 * Sticky marketing navigation. Turns solid and gains a hairline once the page
 * scrolls so it stays legible over the moon scene.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "glass-panel rounded-none border-x-0 border-t-0" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link className="flex items-center gap-2.5" href="/" aria-label="Interviewer AI home">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--ink-text)]">
            Interviewer AI
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--ink-text-secondary)] transition-colors hover:text-[var(--ink-text)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--ink-text-secondary)] transition-colors hover:text-[var(--ink-text)] sm:block"
            href="/sign-in"
          >
            Sign in
          </Link>
          <Link
            className="btn-primary inline-flex h-9 items-center rounded-lg px-4 text-sm"
            href="/sign-up"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
