import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Mail, MessageSquare, Newspaper } from "lucide-react";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "../../../features/marketing/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <PageHeading
        eyebrow="Contact"
        title="We'd love to hear from you"
        description="Questions, feedback, a bug report, or a partnership idea — pick the channel that fits and we'll get back to you within one business day."
      />

      {/* Main support card */}
      <div className="glass-panel mt-12 rounded-3xl p-8 sm:p-10">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-bronze-300 to-bronze-500 text-[#221a0d] shadow-lg shadow-bronze-500/25">
              <Mail className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-[var(--ink-text)]">Email support</h2>
              <p className="mt-0.5 text-sm text-[var(--ink-text-secondary)]">{SUPPORT_EMAIL}</p>
            </div>
          </div>
          <a
            href={SUPPORT_MAILTO}
            className="btn-primary inline-flex h-11 shrink-0 items-center rounded-xl px-6 text-sm"
          >
            Send an email
          </a>
        </div>

        <div className="mt-8 grid gap-6 border-t border-white/[.07] pt-8 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-text-muted)]">
              <MessageSquare className="size-3.5" aria-hidden="true" />
              What to include
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
              For account issues, include the email you signed up with. For bug reports, tell us
              what you were doing, what you expected, and what happened — screenshots help.
            </p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-text-muted)]">
              <Clock className="size-3.5" aria-hidden="true" />
              Response time
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
              We reply within one business day, usually faster. Critical account or privacy issues
              are handled the same day they arrive.
            </p>
          </div>
        </div>
      </div>

      {/* Other channels */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/faq"
          className="group rounded-2xl border border-[var(--hairline)] bg-[var(--ink-raised)]/60 p-6 transition-all hover:border-[rgba(203,162,95,0.3)]"
        >
          <MessageSquare className="size-5 text-bronze-300" aria-hidden="true" />
          <h2 className="mt-4 text-sm font-semibold text-[var(--ink-text)]">Check the FAQ first</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
            Most common questions — accounts, pricing, privacy, and technical setup — are answered
            there instantly.
          </p>
        </Link>
        <Link
          href="/status"
          className="group rounded-2xl border border-[var(--hairline)] bg-[var(--ink-raised)]/60 p-6 transition-all hover:border-[rgba(203,162,95,0.3)]"
        >
          <Newspaper className="size-5 text-bronze-300" aria-hidden="true" />
          <h2 className="mt-4 text-sm font-semibold text-[var(--ink-text)]">Something down?</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
            Check the system status page for live service health before you write in.
          </p>
        </Link>
      </section>

      <div className="mt-14">
        <CtaCard
          title="Prefer to try it yourself?"
          body="Most questions disappear once you're inside the product. Start free and explore."
          ctaLabel="Get started free"
        />
      </div>
    </div>
  );
}
