import {
  ArrowRight,
  BrainCircuit,
  Briefcase,
  ChevronDown,
  Code2,
  FileUp,
  Gauge,
  MessagesSquare,
  Mic,
  Play,
  Users,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";

import {
  FadeUp,
  ScaleIn,
  SlideIn,
  StaggerContainer,
  StaggerItem,
} from "../features/landing/components/animations";
import { BrandMark } from "../features/landing/components/brand-mark";
import { FeedbackPreview } from "../features/landing/components/feedback-preview";
import { MockInterviewDemo } from "../features/landing/components/mock-interview-demo";
import { MoonSceneLoader } from "../features/landing/components/moon-scene-loader";
import { SectionHeading } from "../features/landing/components/section-heading";
import { SiteFooter } from "../features/landing/components/site-footer";
import { SiteNav } from "../features/landing/components/site-nav";
import { VoiceEngineShowcase } from "../features/landing/components/voice-engine-showcase";
import { InterviewTrackExplorer } from "../features/landing/components/interview-track-explorer";
import { ComparisonSection } from "../features/landing/components/comparison-section";
import { CandidateStories } from "../features/landing/components/candidate-stories";
import { SquareAccent } from "../features/landing/components/grid-background";
import { SmoothScroll } from "../features/landing/components/smooth-scroll";
import { ConnectiveSpine, AnimatedConnectionPath } from "../features/landing/components/connective-spine";
import { TiltCard } from "../features/landing/components/tilt-card";
import { AsymmetricBentoGrid } from "../features/landing/components/asymmetric-bento-grid";

const steps = [
  {
    icon: FileUp,
    title: "Bring your context",
    description:
      "Upload your resume PDF and paste the target job description. The AI creates a custom hiring rubric tailored precisely to the seniority and team requirements.",
  },
  {
    icon: MessagesSquare,
    title: "Have the conversation",
    description:
      "A live voice session that listens, interrupts when you hand-wave, and probes your conviction — never a fixed questionnaire.",
  },
  {
    icon: Gauge,
    title: "Leave with a drill plan",
    description:
      "A structured scorecard: what resonated, where you stumbled, and targeted drills to refine before your actual onsite interview.",
  },
];

const interviewTypes = [
  { icon: MessagesSquare, label: "Behavioral & STAR" },
  { icon: Code2, label: "Frontend & Web Architecture" },
  { icon: BrainCircuit, label: "Distributed System Design" },
  { icon: Briefcase, label: "Product Management & Strategy" },
  { icon: Users, label: "Executive Leadership & Culture" },
];

const trustMetrics = [
  { label: "Turn Latency", value: "< 300ms", sub: "Natural conversation flow" },
  { label: "Rounds Practiced", value: "15,000+", sub: "Across senior & staff roles" },
  { label: "Onsite Confidence", value: "94.8%", sub: "Report lower interview anxiety" },
  { label: "Scoring Rubric", value: "STAR Bar", sub: "Committee-grade feedback" },
];

const faqs = [
  {
    q: "How is this different from asking a chatbot to quiz me?",
    a: "A chatbot sends text and waits. Interviewer AI speaks with you in real time — it picks up on pacing, incomplete thoughts, and the details you skip past, then follows up on them just like a real interviewer would. You cannot backspace or edit your sentences.",
  },
  {
    q: "Does it adapt to my actual resume and target job?",
    a: "Yes. Your resume and the job description shape the question plan before you speak a word, and your answers shape every follow-up after that. No two sessions run the same script.",
  },
  {
    q: "What does the feedback actually look like?",
    a: "A structured report after every session: overall score, communication, technical depth, and pacing, plus specific strengths and weaknesses pulled from your transcript — with recommendations for what to practice next.",
  },
  {
    q: "Do I need a microphone or special setup?",
    a: "Any laptop or phone mic works — the interview runs entirely in your browser via WebSockets. If voice isn't available, you can continue by typing so a session is never wasted.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — your first practice interview is free, every month, with the full feedback report. No credit card required.",
  },
];

export default function HomePage() {
  return (
    <SmoothScroll>
      <SiteNav />
      <ConnectiveSpine />

      <main className="overflow-hidden bg-[var(--ink-canvas)]">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="landing-hero relative isolate flex min-h-dvh items-center overflow-hidden px-6 pb-20 pt-32">
          {/* Subtle architectural square blueprint grid pattern across entire hero */}
          <div className="bg-grid-squares pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />

          {/* Interactive 3D Moon Scene */}
          <MoonSceneLoader />

          {/* Soft ambient champagne & teal glow */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute right-[-10%] top-[-20%] h-[48rem] w-[48rem] rounded-full bg-[radial-gradient(circle,rgba(203,162,95,0.12)_0%,transparent_65%)]" />
            <div className="absolute bottom-[-30%] left-[-15%] h-[38rem] w-[38rem] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.06)_0%,transparent_65%)]" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--ink-canvas)] to-transparent" />
          </div>

          <div className="landing-rails relative z-10 mx-auto grid w-full max-w-6xl gap-16 px-2 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            {/* Copy column */}
            <div>
              <FadeUp delay={0.05}>
                <div className="inline-flex items-center gap-2 rounded-full border border-bronze-500/25 bg-white/90 px-3.5 py-1.5 shadow-sm">
                  <span className="live-dot" />
                  <span className="font-mono text-xs font-semibold text-bronze-800">
                    Live voice interviews with AI
                  </span>
                  <SquareAccent className="ml-1" />
                </div>
              </FadeUp>

              <FadeUp delay={0.15}>
                <h1 className="mt-7 text-balance text-[2.6rem] font-bold leading-[1.05] tracking-[-0.035em] text-[var(--ink-text)] sm:text-6xl lg:text-[4.1rem]">
                  Practice like it&rsquo;s the real interview.{" "}
                  <span className="text-gradient-bronze">Because it nearly is.</span>
                </h1>
              </FadeUp>

              <FadeUp delay={0.28}>
                <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-[var(--ink-text-secondary)]">
                  Speak with an AI interviewer that listens, questions your trade-offs, and scores your answers in real time — built from your exact resume and target role.
                </p>
              </FadeUp>

              <FadeUp delay={0.4}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold"
                    href="/sign-up"
                  >
                    Start your first interview
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <a
                    className="btn-ghost inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm"
                    href="#how-it-works"
                  >
                    <Play className="size-3.5 fill-current" aria-hidden="true" />
                    See how it works
                  </a>
                </div>
              </FadeUp>

              {/* Verified Trust Metrics Counter Strip */}
              <FadeUp delay={0.5}>
                <div className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--hairline)] pt-8 sm:grid-cols-4">
                  {trustMetrics.map((metric) => (
                    <div key={metric.label} className="relative">
                      <p className="font-mono text-xl font-bold text-[var(--ink-text)]">
                        {metric.value}
                      </p>
                      <p className="text-xs font-medium text-bronze-700">{metric.label}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--ink-text-muted)]">
                        {metric.sub}
                      </p>
                    </div>
                  ))}
                </div>
              </FadeUp>
            </div>

            {/* Interactive product demo console */}
            <FadeUp delay={0.35} className="relative">
              <MockInterviewDemo />
            </FadeUp>
          </div>
        </section>

        {/* ── Differentiators ─────────────────────────────────────────── */}
        <section className="bg-grid-squares relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <FadeUp>
            <SectionHeading
              eyebrow="Why it works"
              title="Built around how interviews actually happen."
              description="Chatbots quiz you with scripted questions. Real interviewers listen, challenge your conviction, and pull the thread — that's the muscle this trains."
            />
          </FadeUp>

          <FadeUp delay={0.1}>
            <AsymmetricBentoGrid />
          </FadeUp>
        </section>

        {/* ── Real-Time Voice Engine ───────────────────────────────────── */}
        <div className="divider-glow mx-auto max-w-6xl" />
        <div className="bg-grid-squares">
          <VoiceEngineShowcase />
        </div>

        {/* ── Targeted Role Tracks Explorer ────────────────────────────── */}
        <div className="divider-glow mx-auto max-w-6xl" />
        <div className="bg-grid-squares">
          <InterviewTrackExplorer />
        </div>

        {/* ── How it works ────────────────────────────────────────────── */}
        <section className="bg-grid-squares relative" id="how-it-works">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading
                eyebrow="How it works"
                title="Three steps between you and an offer letter."
              />
            </FadeUp>

            <StaggerContainer
              className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8"
              staggerDelay={0.15}
            >
              {steps.map(({ icon: Icon, title, description }, index) => (
                <StaggerItem key={title}>
                  <TiltCard tiltAngle={8} glareOpacity={0.12} className="h-full">
                    <div className="glass-panel relative flex h-full flex-col justify-between rounded-2xl border border-[var(--hairline)] p-6">
                      <SquareAccent className="absolute right-3.5 top-3.5" />
                      <div>
                        <span className="font-mono text-xs font-bold text-bronze-600" aria-hidden="true">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="mt-4 grid size-11 place-items-center rounded-xl border border-[var(--hairline)] bg-white text-bronze-600 shadow-sm">
                          <Icon className="size-5" aria-hidden="true" />
                        </div>
                        <h3 className="mt-5 text-base font-semibold text-[var(--ink-text)]">{title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                          {description}
                        </p>
                      </div>
                    </div>
                  </TiltCard>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <FadeUp delay={0.2}>
              <p className="mx-auto mt-16 max-w-xl text-center text-sm leading-relaxed text-[var(--ink-text-muted)]">
                Every session is scored on the same standardized rubric, so after a few runs you can inspect communication and pacing trends — not just feelings.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* ── Feedback report preview ─────────────────────────────────── */}
        <section className="bg-grid-squares relative">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading
                eyebrow="After the interview"
                title="Feedback you can act on, not a pat on the back."
                description="Every session ends with a structured report — the same dimensions a hiring committee debates, scored and explained."
              />
            </FadeUp>

            <FadeUp delay={0.2} className="mt-14">
              <FeedbackPreview />
            </FadeUp>
          </div>
        </section>

        {/* ── Comparison Section: Interviewer AI vs Traditional ───────── */}
        <div className="divider-glow mx-auto max-w-6xl" />
        <div className="bg-grid-squares">
          <ComparisonSection />
        </div>

        {/* ── Candidate Stories / Testimonials ────────────────────────── */}
        <div className="divider-glow mx-auto max-w-6xl" />
        <div className="bg-grid-squares">
          <CandidateStories />
        </div>

        {/* ── Interview types ─────────────────────────────────────────── */}
        <section className="bg-grid-squares relative">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading
                eyebrow="Interview types"
                title="Train for the interview on your calendar."
                description="Pick a type, or mix them — the interviewer adjusts structure, difficulty, and tone to match."
              />
            </FadeUp>

            <StaggerContainer
              className="mt-12 flex flex-wrap justify-center gap-3"
              staggerDelay={0.08}
            >
              {interviewTypes.map(({ icon: Icon, label }) => (
                <StaggerItem key={label}>
                  <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--hairline)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--ink-text-secondary)] shadow-sm transition-all hover:border-bronze-500/40 hover:text-[var(--ink-text)]">
                    <Icon className="size-4 text-bronze-600" aria-hidden="true" />
                    {label}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* Brand statement */}
            <FadeUp delay={0.15}>
              <div className="mt-16 flex items-center justify-center gap-3 text-[var(--ink-text-faint)]">
                <BrandMark />
                <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
                  Built for the conversation, not the questionnaire
                </span>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section className="bg-grid-squares relative" id="faq">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading eyebrow="FAQ" title="Fair questions, straight answers." />
            </FadeUp>

            <StaggerContainer className="mt-12 space-y-3" staggerDelay={0.06}>
              {faqs.map((faq) => (
                <StaggerItem key={faq.q}>
                  <details className="group rounded-xl border border-[var(--hairline)] bg-white/80 px-5 py-4 shadow-sm transition-colors open:border-bronze-500/40">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[var(--ink-text)] [&::-webkit-details-marker]:hidden">
                      {faq.q}
                      <ChevronDown
                        className="size-4 shrink-0 text-[var(--ink-text-muted)] transition-transform duration-200 group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                      {faq.a}
                    </p>
                  </details>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────────────────── */}
        <section className="bg-grid-squares relative mx-auto max-w-5xl px-6 pb-28 pt-8">
          <ScaleIn>
            <div className="glass-panel relative overflow-hidden rounded-3xl border border-[var(--hairline)] px-6 py-16 text-center shadow-xl sm:px-12">
              <SquareAccent className="absolute left-4 top-4" />
              <SquareAccent className="absolute right-4 top-4" />
              <SquareAccent className="absolute bottom-4 left-4" />
              <SquareAccent className="absolute bottom-4 right-4" />

              <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-bronze-500/15 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-16 size-56 rounded-full bg-bronze-400/10 blur-3xl" />

              <div className="relative">
                <h2 className="mx-auto max-w-xl text-balance text-3xl font-bold tracking-[-0.025em] text-[var(--ink-text)] sm:text-4xl">
                  The next interview on your calendar is real. This one is practice.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                  Walk in having already answered the hardest follow-ups out loud.
                </p>
                <Link
                  className="btn-primary mx-auto mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-8 text-sm font-semibold"
                  href="/sign-up"
                >
                  Start your first interview
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <p className="mt-4 font-mono text-[11px] text-[var(--ink-text-muted)]">
                  1 free mock interview every month · Instant report · No credit card
                </p>
              </div>
            </div>
          </ScaleIn>
        </section>
      </main>

      <SiteFooter />
    </SmoothScroll>
  );
}
