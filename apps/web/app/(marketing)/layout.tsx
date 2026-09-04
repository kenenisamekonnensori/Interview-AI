import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "../../features/landing/components/brand-mark";
import { SiteFooter } from "../../features/landing/components/site-footer";

export const metadata: Metadata = {
  title: {
    default: "Interviewer AI",
    template: "%s · Interviewer AI",
  },
};

export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative z-10 border-b border-white/[.05]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link className="flex items-center gap-2.5" href="/" aria-label="Interviewer AI home">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight text-white">Interviewer AI</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              className="rounded-lg px-3 py-1.5 text-sm text-white/60 transition-colors hover:text-white"
              href="/sign-in"
            >
              Sign in
            </Link>
            <Link
              className="btn-premium ml-1 inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white"
              href="/sign-up"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <SiteFooter />
    </div>
  );
}