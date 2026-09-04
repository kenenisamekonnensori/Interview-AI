import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Check,
  FileSearch,
  Gauge,
  Mic,
  Play,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { MoonSceneLoader } from "../features/landing/components/moon-scene-loader";
import { BrandMark } from "../features/landing/components/brand-mark";
import { SiteFooter } from "../features/landing/components/site-footer";
import {
  FadeUp,
  StaggerContainer,
  StaggerItem,
  ScaleIn,
} from "../features/landing/components/animations";

const capabilities = [
  {
    icon: Mic,
    title: "Voice-first practice",
    description:
      "Speak naturally with an AI interviewer that listens, adapts, and asks the follow-ups that matter.",
  },
  {
    icon: BrainCircuit,
    title: "Personalized to your role",
    description:
      "Your resume and target job shape every question. Practice with context that actually reflects your opportunity.",
  },
  {
    icon: TrendingUp,
    title: "Actionable feedback",
    description:
      "Walk away knowing exactly what to improve—communication, structure, and confidence included.",
  },
];

const steps = [
  {
    icon: FileSearch,
    title: "Bring your context",
    description: "Upload your resume and the role you're aiming for.",
  },
  {
    icon: AudioLines,
    title: "Have the conversation",
    description: "Speak with an AI interviewer that follows your thinking, not a script.",
  },
  {
    icon: Gauge,
    title: "Leave with clarity",
    description: "Get a candid read on your communication, reasoning, and next move.",
  },
];

export default function HomePage() {
  return (
    <>
      <main className="overflow-hidden">
        {/* ── Hero ── */}
        <section className="landing-hero relative isolate flex min-h-dvh flex-col items-center justify-center px-6">
          <MoonSceneLoader />

          {/* Ambient glow behind hero text */}
          <div className="pointer-events-none absolute inset-0 -z-5">
            <div className="absolute left-1/2 top-1/2 h-[50rem] w-[50rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18)_0%,transparent_65%)]" />
            <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background to-transparent" />
          </div>

          {/* Nav */}
          <nav className="absolute inset-x-0 top-0 z-20 mx-auto flex h-16 max-w-5xl items-center justify-between">
            <Link className="flex items-center gap-2.5" href="/" aria-label="Interviewer AI home">
              <BrandMark />
              <span className="text-sm font-semibold tracking-tight text-white">
                Interviewer AI
              </span>
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
          </nav>

          {/* Hero content — centered */}
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <FadeUp delay={0.1}>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#6366f1]/25 bg-[#6366f1]/10 px-3.5 py-1.5 text-xs font-medium text-[#c0c1ff] backdrop-blur-sm">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#6366f1] opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-[#6366f1]" />
                </span>
                AI interview preparation
              </div>
            </FadeUp>

            <FadeUp delay={0.2}>
              <h1 className="mt-7 text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl lg:text-[4.25rem]">
                Practice the moment. <span className="text-gradient-primary">Own the room.</span>
              </h1>
            </FadeUp>

            <FadeUp delay={0.35}>
              <p className="mx-auto mt-5 max-w-lg text-balance text-lg leading-relaxed text-white/55">
                A realistic voice interview with intelligent follow-ups and clear feedback—so your
                next answer feels like yours.
              </p>
            </FadeUp>

            <FadeUp delay={0.5}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  className="btn-premium inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold text-white"
                  href="/sign-up"
                >
                  Start a free practice <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <a
                  className="btn-ghost-glass inline-flex h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-medium text-white"
                  href="#how-it-works"
                >
                  <Play className="size-3.5 fill-current" aria-hidden="true" />
                  See how it works
                </a>
              </div>
            </FadeUp>

            <FadeUp delay={0.6}>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/45">
                {["No credit card", "Voice-first", "Feedback every session"].map((item) => (
                  <span className="flex items-center gap-1.5" key={item}>
                    <Check className="size-3 text-[#6366f1]" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="relative mx-auto max-w-3xl px-6 py-24 sm:py-32" id="how-it-works">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute left-1/2 top-0 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(99,102,241,0.1)_0%,transparent_70%)]" />

          <FadeUp>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c0c1ff]">
                Why it works
              </p>
              <h2 className="mx-auto mt-4 max-w-xl text-balance text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
                Built around how people actually prepare.
              </h2>
            </div>
          </FadeUp>

          <StaggerContainer className="mt-14 grid gap-4 sm:grid-cols-3" staggerDelay={0.12}>
            {capabilities.map(({ icon: Icon, title, description }) => (
              <StaggerItem key={title}>
                <article className="glass-surface group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#6366f1]/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.12)]">
                  <div className="glass-highlight" />
                  <span className="grid size-10 place-items-center rounded-xl bg-[#6366f1]/12 text-[#c0c1ff] transition-colors duration-300 group-hover:bg-[#6366f1]/20">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>
                </article>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </section>

        {/* ── How it works ── */}
        <section className="relative border-y border-white/[.05] bg-white/[.02]">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(76,215,246,0.07)_0%,transparent_70%)]" />

          <div className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
            <FadeUp>
              <div className="text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c0c1ff]">
                  How it works
                </p>
                <h2 className="mx-auto mt-4 max-w-md text-balance text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
                  Three steps to a better interview.
                </h2>
              </div>
            </FadeUp>

            <StaggerContainer
              className="mt-14 grid gap-8 sm:grid-cols-3 sm:gap-10"
              staggerDelay={0.15}
            >
              {steps.map(({ icon: Icon, title, description }, index) => (
                <StaggerItem key={title}>
                  <div className="text-center">
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-white/[.07] bg-white/[.04] text-[#c0c1ff] transition-all duration-300 hover:border-[#6366f1]/25 hover:bg-[#6366f1]/10">
                      <Icon className="size-5" />
                    </div>
                    <p className="mt-5 text-xs font-mono font-medium text-white/30">0{index + 1}</p>
                    <h3 className="mt-1 text-base font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="relative mx-auto max-w-3xl px-6 py-24 sm:py-32">
          <ScaleIn>
            <div className="glass-surface-deep relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12">
              <div className="absolute -right-16 -top-24 size-72 rounded-full bg-[#6366f1]/25 blur-3xl" />
              <div className="absolute -bottom-16 -left-16 size-56 rounded-full bg-[#06b6d4]/12 blur-3xl" />

              <div className="relative">
                <div className="mx-auto grid size-10 place-items-center rounded-xl bg-[#6366f1]/15 text-[#c0c1ff]">
                  <Sparkles className="size-5" />
                </div>
                <h2 className="mx-auto mt-6 max-w-lg text-balance text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
                  Your next interview deserves more than a guess.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/50">
                  Practice with intention, hear how you come across, and walk in with a plan.
                </p>
                <Link
                  className="btn-premium mx-auto mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-8 text-sm font-semibold text-white"
                  href="/sign-up"
                >
                  Get started for free <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </ScaleIn>
        </section>
      </main>

      {/* ── Footer ── */}
      <SiteFooter />
    </>
  );
}
