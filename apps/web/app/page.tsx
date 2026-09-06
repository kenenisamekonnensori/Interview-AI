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
} from "lucide-react";
import Link from "next/link";

import {
  FadeUp,
  ScaleIn,
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

/* Content is colocated with its section and kept as plain data — easy to edit,
   easy to lift into the CMS later without touching JSX. */

const differentiators = [
  {
    icon: Mic,
    title: "Spoken, not typed",
    description:
      "Talk through your answers the way you would in the room. Thinking out loud is the skill — this is where you practice it.",
  },
  {
    icon: BrainCircuit,
    title: "Follow-ups from your answers",
    description:
      "The interviewer digs into what you actually said — the same way a sharp hiring manager pulls the thread.",
  },
  {
    icon: Gauge,
    title: "A score you can train against",
    description:
      "Communication, technical depth, and pacing — measured per session so progress is a number, not a feeling.",
  },
];

const steps = [
  {
    icon: FileUp,
    title: "Bring your context",
    description:
      "Upload your resume and paste the job description. The session is built around the role you're actually chasing.",
  },
  {
    icon: MessagesSquare,
    title: "Have the conversation",
    description:
      "A live voice interview that listens, interrupts, and follows up — never a fixed question list.",
  },
  {
    icon: Gauge,
    title: "Leave with a plan",
    description:
      "A structured report: what landed, what didn't, and exactly what to drill before the real thing.",
  },
];

const interviewTypes = [
  { icon: MessagesSquare, label: "Behavioral" },
  { icon: Code2, label: "Technical" },
  { icon: BrainCircuit, label: "System design" },
  { icon: Briefcase, label: "HR screening" },
  { icon: Users, label: "Panel-style" },
];

const faqs = [
  {
    q: "How is this different from asking a chatbot to quiz me?",
    a: "A chatbot sends text and waits. Interviewer AI speaks with you in real time — it picks up on pacing, incomplete thoughts, and the details you skip past, then follows up on them just like a real interviewer would.",
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
    a: "Any laptop or phone mic works — the interview runs entirely in your browser. If voice isn't available, you can continue by typing so a session is never wasted.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes — your first practice interview is free, every month, with the full feedback report. No credit card required.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />

      <main className="overflow-hidden">
        {/* ── Hero ────────────────────────────────────────────────────────
            Product-led layout: copy left, working demo right. The moon sits
            upper-right behind the demo instead of competing with the copy. */}
        <section className="landing-hero relative isolate flex min-h-dvh items-center overflow-hidden px-6 pb-20 pt-32">
          <MoonSceneLoader />

          {/* Warm ambient glow keyed to the bronze palette */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute right-[-10%] top-[-20%] h-[46rem] w-[46rem] rounded-full bg-[radial-gradient(circle,rgba(203,162,95,0.10)_0%,transparent_65%)]" />
            <div className="absolute bottom-[-30%] left-[-15%] h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.045)_0%,transparent_65%)]" />
            <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[var(--ink-canvas)] to-transparent" />
          </div>

          <div className="landing-rails relative z-10 mx-auto grid w-full max-w-6xl gap-16 px-2 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            {/* Copy column */}
            <div>
              <FadeUp delay={0.05}>
                <span className="badge-live">Voice interviews, live with AI</span>
              </FadeUp>

              <FadeUp delay={0.15}>
                <h1 className="mt-7 text-balance text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.035em] text-[var(--ink-text)] sm:text-6xl lg:text-[4.1rem]">
                  Practice like it&rsquo;s the real interview.{" "}
                  <span className="text-gradient-bronze">Because it nearly is.</span>
                </h1>
              </FadeUp>

              <FadeUp delay={0.28}>
                <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-[var(--ink-text-secondary)]">
                  Speak with an AI interviewer that listens, follows up, and scores you — built from
                  your resume and the role you&rsquo;re applying for.
                </p>
              </FadeUp>

              <FadeUp delay={0.4}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    className="btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm"
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

              <FadeUp delay={0.52}>
                <p className="mt-7 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-text-faint)]">
                  Free monthly practice · No credit card · ~15 min per session
                </p>
              </FadeUp>
            </div>

            {/* Interactive product demo */}
            <FadeUp delay={0.35} className="relative">
              <MockInterviewDemo />
            </FadeUp>
          </div>
        </section>

        {/* ── Differentiators ─────────────────────────────────────────── */}
        <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <FadeUp>
            <SectionHeading
              eyebrow="Why it works"
              title="Built around how interviews actually happen."
              description="Chatbots quiz you with scripted questions. Real interviewers listen and pull the thread — that's the muscle this trains."
            />
          </FadeUp>

          <StaggerContainer className="mt-14 grid gap-4 md:grid-cols-3" staggerDelay={0.12}>
            {differentiators.map(({ icon: Icon, title, description }) => (
              <StaggerItem key={title}>
                <article className="glass-panel group relative h-full overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[rgba(203,162,95,0.35)]">
                  <div className="glass-highlight absolute inset-0" />
                  <span className="grid size-10 place-items-center rounded-xl bg-bronze-500/15 text-bronze-300">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-[var(--ink-text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                    {description}
                  </p>
                </article>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        {/* ── How it works ────────────────────────────────────────────── */}
        <section className="relative" id="how-it-works">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading
                eyebrow="How it works"
                title="Three steps between you and a better interview."
              />
            </FadeUp>

            <StaggerContainer
              className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8"
              staggerDelay={0.15}
            >
              {steps.map(({ icon: Icon, title, description }, index) => (
                <StaggerItem key={title}>
                  <div className="relative">
                    <span className="font-mono text-xs text-bronze-500/70" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="mt-4 grid size-11 place-items-center rounded-xl border border-[var(--hairline)] bg-[var(--ink-raised)] text-bronze-300">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-base font-semibold text-[var(--ink-text)]">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                      {description}
                    </p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* Social-proof-free trust line — no fake customer logos */}
            <FadeUp delay={0.2}>
              <p className="mx-auto mt-16 max-w-xl text-center text-sm leading-relaxed text-[var(--ink-text-muted)]">
                Every session is scored on the same rubric, so after a few runs you can see
                communication and pacing trends — not just vibes.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* ── Feedback report preview ─────────────────────────────────── */}
        <section className="relative">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading
                eyebrow="After the interview"
                title="Feedback you can act on, not a pat on the back."
                description="Every session ends with a structured report — the same dimensions a hiring panel debates, scored and explained."
              />
            </FadeUp>

            <FadeUp delay={0.2} className="mt-14">
              <FeedbackPreview />
            </FadeUp>
          </div>
        </section>

        {/* ── Interview types ─────────────────────────────────────────── */}
        <section className="relative">
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
                  <span className="inline-flex items-center gap-2.5 rounded-full border border-[var(--hairline)] bg-[var(--ink-raised)] px-5 py-2.5 text-sm font-medium text-[var(--ink-text-secondary)] transition-colors hover:border-[rgba(203,162,95,0.35)] hover:text-[var(--ink-text)]">
                    <Icon className="size-4 text-bronze-300" aria-hidden="true" />
                    {label}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* Brand strip — quiet statement, not a claim */}
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
        <section className="relative" id="faq">
          <div className="divider-glow mx-auto max-w-6xl" />
          <div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
            <FadeUp>
              <SectionHeading eyebrow="FAQ" title="Fair questions, straight answers." />
            </FadeUp>

            <StaggerContainer className="mt-12 space-y-3" staggerDelay={0.06}>
              {faqs.map((faq) => (
                <StaggerItem key={faq.q}>
                  <details className="group rounded-xl border border-[var(--hairline)] bg-[var(--ink-raised)]/60 px-5 py-4 transition-colors open:border-[rgba(203,162,95,0.35)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-[var(--ink-text)] [&::-webkit-details-marker]:hidden">
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
        <section className="relative mx-auto max-w-5xl px-6 pb-28 pt-8">
          <ScaleIn>
            <div className="glass-panel relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12">
              <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-bronze-500/18 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-16 size-56 rounded-full bg-bronze-400/10 blur-3xl" />

              <div className="relative">
                <h2 className="mx-auto max-w-xl text-balance text-3xl font-semibold tracking-[-0.025em] text-[var(--ink-text)] sm:text-4xl">
                  The next interview on your calendar is real. This one is practice.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[var(--ink-text-secondary)]">
                  Walk in having already answered the hard questions out loud.
                </p>
                <Link
                  className="btn-primary mx-auto mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-8 text-sm"
                  href="/sign-up"
                >
                  Start your first interview
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </ScaleIn>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
