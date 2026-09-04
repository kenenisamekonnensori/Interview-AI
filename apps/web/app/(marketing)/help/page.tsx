import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  GraduationCap,
  MessageSquare,
  Mic2,
  ShieldCheck,
} from "lucide-react";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "Help center" };

const categories = [
  {
    icon: Mic2,
    title: "Getting started",
    body: "Accounts, setup, and your first practice interview.",
    href: "/docs#getting-started",
    cta: "Read the guide",
  },
  {
    icon: FileText,
    title: "Resumes & job descriptions",
    body: "Uploading your context and getting the best analysis.",
    href: "/docs#resume-and-job",
    cta: "Read the guide",
  },
  {
    icon: MessageSquare,
    title: "Voice & technical",
    body: "Microphone setup, browsers, and troubleshooting.",
    href: "/docs#voice-interviews",
    cta: "Troubleshoot",
  },
  {
    icon: BookOpen,
    title: "Reports & feedback",
    body: "Understanding your scores and what to work on.",
    href: "/docs#reading-your-report",
    cta: "Understand reports",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & security",
    body: "How your data is handled, stored, and protected.",
    href: "/privacy",
    cta: "Read our policy",
  },
  {
    icon: GraduationCap,
    title: "Interview guides",
    body: "Practice strategies by interview type.",
    href: "/guides",
    cta: "Browse guides",
  },
];

const popularLinks = [
  { label: "How to structure “Tell me about yourself”", href: "/blog/structure-your-answer-tell-me-about-yourself" },
  { label: "The STAR method, beyond the acronym", href: "/blog/star-method-beyond-the-acronym" },
  { label: "What interviewers actually listen for", href: "/blog/what-interviewers-actually-listen-for" },
  { label: "Billing, plans, and refunds", href: "/faq#billing" },
  { label: "What happens to my data?", href: "/faq#data" },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <PageHeading
          eyebrow="Help center"
          title="How can we help?"
          description="Guides, documentation, and quick answers — plus a real human at the end of an email if you need one."
        />
      </div>

      {/* Category cards */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map(({ icon: Icon, title, body, href, cta }) => (
          <Link
            key={title}
            href={href}
            className="group glass-surface flex flex-col rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#6366f1]/30"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-[#6366f1]/12 text-[#c0c1ff]">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-base font-semibold text-white">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/50">{body}</p>
            <p className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-[#c0c1ff]">
              {cta}
              <ArrowUpRight
                className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden="true"
              />
            </p>
          </Link>
        ))}
      </div>

      {/* Popular articles */}
      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          Popular articles
        </h2>
        <div className="glass-surface mt-4 divide-y divide-white/[.05] overflow-hidden rounded-2xl">
          {popularLinks.map((article) => (
            <Link
              key={article.href}
              href={article.href}
              className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-white/[.03]"
            >
              <span className="text-sm text-white/70 transition-colors hover:text-white">
                {article.label}
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-14">
        <CtaCard
          title="Still stuck?"
          body="Email us and a real person will help — usually within one business day."
          ctaLabel="Email support"
          href="/contact"
        />
      </div>
    </div>
  );
}