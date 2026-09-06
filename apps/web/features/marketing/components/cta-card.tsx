import { ArrowRight } from "lucide-react";
import Link from "next/link";

type CtaCardProps = {
  title?: string;
  body?: string;
  ctaLabel?: string;
  href?: string;
};

export function CtaCard({
  title = "Ready to practice with confidence?",
  body = "Start your first AI mock interview today — free, no credit card required.",
  ctaLabel = "Get started free",
  href = "/sign-up",
}: CtaCardProps) {
  return (
    <div className="glass-panel relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-12">
      <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-bronze-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-bronze-400/8 blur-3xl" />

      <div className="relative">
        <h2 className="mx-auto max-w-lg text-balance text-2xl font-semibold tracking-[-0.02em] text-[var(--ink-text)] sm:text-3xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--ink-text-secondary)]">
          {body}
        </p>
        <Link
          className="btn-primary mx-auto mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-7 text-sm"
          href={href}
        >
          {ctaLabel} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
