import type { Metadata } from "next";
import { Rocket, Sparkles } from "lucide-react";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "Changelog" };

type Release = {
  version: string;
  date: string;
  label: string;
  items: string[];
};

const releases: Release[] = [
  {
    version: "v0.2.0",
    date: "September 2026",
    label: "Reliability & performance",
    items: [
      "Reworked background processing so interviews, reports, and emails complete faster and recover cleanly from failures.",
      "Added email verification and Google sign-in for more secure account access.",
      "Improved voice streaming latency so conversations feel closer to real time.",
      "New structured onboarding flow that guides you from sign-up to your first interview.",
    ],
  },
  {
    version: "v0.1.1",
    date: "August 2026",
    label: "Feedback polish",
    items: [
      "Redesigned the report view with clearer scores, strengths, and prioritized next steps.",
      "More natural interviewer behavior: better timing, fewer interruptions at awkward moments.",
      "Fixed several edge cases in resume parsing for unusual formats.",
    ],
  },
  {
    version: "v0.1.0",
    date: "July 2026",
    label: "Public beta",
    items: [
      "Voice-first practice interviews with real-time speech recognition.",
      "Resume and job-description analysis to personalize every session.",
      "AI interview generation across behavioral, HR, technical, and mixed formats.",
      "Automatic evaluation and structured feedback reports.",
      "Interview history so you can review everything you've practiced.",
      "Accounts with secure authentication — your data stays yours.",
    ],
  },
];

const roadmap = [
  "Cross-session progress analytics and trends",
  "More interview types, including system design and coding",
  "Custom interviewer personalities and pacing",
  "Team accounts for bootcamps, universities, and career services",
  "Company-specific interview simulations",
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <PageHeading
        eyebrow="Changelog"
        title="What's new in Interviewer AI"
        description="We ship continuously. Here's everything that's landed recently — and what we're building next."
      />

      <div className="relative mt-14 space-y-10 before:absolute before:inset-y-2 before:left-[1.06rem] before:w-px before:bg-gradient-to-b before:from-[#6366f1]/40 before:via-white/[.08] before:to-transparent sm:before:left-[1.31rem]">
        {releases.map((release) => (
          <article key={release.version} className="relative pl-12 sm:pl-14">
            <span className="absolute left-0 top-1 grid size-9 place-items-center rounded-full border border-[#6366f1]/25 bg-[#0f131d] sm:size-10">
              <Sparkles className="size-4 text-[#c0c1ff]" aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold tracking-tight text-white">{release.version}</h2>
              <span className="text-xs text-white/40">{release.date}</span>
              <span className="rounded-full border border-white/[.08] bg-white/[.04] px-2 py-0.5 text-[11px] text-white/50">
                {release.label}
              </span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {release.items.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/60">
                  <span className="mt-[0.6rem] size-1 shrink-0 rounded-full bg-[#6366f1]/60" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      {/* Roadmap */}
      <section className="glass-surface mt-16 rounded-3xl p-8">
        <div className="flex items-center gap-2">
          <Rocket className="size-4 text-[#c0c1ff]" aria-hidden="true" />
          <h2 className="text-base font-semibold text-white">On the roadmap</h2>
        </div>
        <ul className="mt-4 space-y-2.5">
          {roadmap.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/60">
              <span className="mt-[0.6rem] size-1 shrink-0 rounded-full bg-[#06b6d4]/70" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-16">
        <CtaCard
          title="Try the latest build"
          body="Every release is available immediately — start a practice interview and see what's new."
          ctaLabel="Start practicing free"
        />
      </div>
    </div>
  );
}