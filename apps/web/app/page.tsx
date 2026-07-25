import {
  ArrowRight,
  AudioLines,
  BrainCircuit,
  Check,
  ChevronRight,
  Mic,
  Play,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

const practiceSignals = ["Clear structure", "Strong examples", "Confident delivery"];

const capabilities = [
  {
    icon: Mic,
    eyebrow: "A conversation, not a questionnaire",
    title: "Practice out loud with an interviewer that listens.",
    description:
      "Speak naturally. The interview adapts to your answers, asks thoughtful follow-ups, and keeps the pace realistic.",
  },
  {
    icon: BrainCircuit,
    eyebrow: "Personalized to your opportunity",
    title: "Turn your resume and role into a focused rehearsal.",
    description:
      "Bring the experience and job you care about. We shape the practice around the context that actually matters.",
  },
  {
    icon: TrendingUp,
    eyebrow: "Feedback you can use",
    title: "Leave every session knowing what to do next.",
    description:
      "See where your thinking landed, how your communication came across, and the next habit to sharpen.",
  },
];

function BrandMark() {
  return (
    <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
      <Mic className="size-5" aria-hidden="true" />
    </span>
  );
}

export default function HomePage() {
  return (
    <main className="overflow-hidden">
      <section className="landing-hero relative isolate min-h-[48rem] border-b border-border">
        <div className="landing-grid pointer-events-none absolute inset-0 -z-20" />
        <div className="landing-orb landing-orb-one pointer-events-none absolute -left-32 top-20 -z-10 size-[34rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="landing-orb landing-orb-two pointer-events-none absolute -right-28 top-28 -z-10 size-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />

        <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link className="flex items-center gap-3" href="/" aria-label="Interviewer AI home">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight">Interviewer AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
              href="#how-it-works"
            >
              How it works
            </Link>
            <Link
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              href="/sign-in"
            >
              Sign in
            </Link>
            <Link
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition hover:brightness-110"
              href="/sign-up"
            >
              Start practicing
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Your next interview starts before the real one
            </div>
            <h1 className="mt-7 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Practice the moment. <span className="text-primary">Own the room.</span>
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-muted-foreground">
              Interviewer AI gives you a realistic voice interview, intelligent follow-ups, and
              clear feedback—so your next answer feels like yours.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-medium text-primary-foreground shadow-xl shadow-primary/25 transition hover:-translate-y-0.5 hover:brightness-110"
                href="/sign-up"
              >
                Start a free practice <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card/60 px-5 text-sm font-medium text-foreground transition hover:bg-accent"
                href="#how-it-works"
              >
                <Play className="size-4 fill-current" aria-hidden="true" /> See how it works
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
              {["No credit card", "Voice-first practice", "Feedback after every session"].map(
                (item) => (
                  <span className="flex items-center gap-2" key={item}>
                    <Check className="size-4 text-primary" aria-hidden="true" />
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:ml-auto">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-primary/15 blur-3xl" />
            <div className="relative rounded-[1.75rem] border border-white/10 bg-card/80 p-4 shadow-2xl shadow-black/35 backdrop-blur-xl sm:p-5">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
                    <AudioLines className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">Product strategy interview</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Live practice · 21:08 remaining
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-300" />
                  Live
                </span>
              </div>
              <div className="mt-6 rounded-2xl border border-border bg-background/55 p-5">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
                  Interviewer
                </p>
                <p className="mt-3 text-lg leading-8 text-foreground">
                  “Tell me about a decision you made with incomplete information. What changed your
                  mind?”
                </p>
                <div
                  className="landing-wave mt-6 flex h-10 items-center gap-1"
                  aria-label="Animated audio waveform"
                >
                  {Array.from({ length: 22 }, (_, index) => (
                    <span key={index} />
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3">
                  <p className="text-xs text-primary">Your response is being understood</p>
                  <p className="mt-1 text-sm text-foreground">
                    You’re grounding your answer in a clear decision.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                  Listening
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-background/35 px-4 py-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current focus</p>
                  <p className="mt-1 text-sm font-medium">Decision-making under uncertainty</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </div>
            <div className="absolute -bottom-8 -left-8 hidden rounded-2xl border border-white/10 bg-card/90 p-4 shadow-xl backdrop-blur sm:block">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
                  <Target className="size-4" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Communication</p>
                  <p className="text-sm font-semibold">Clear & structured</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card/30 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
          <p className="text-sm text-muted-foreground">
            A calmer way to prepare for consequential conversations.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-foreground/70">
            <span>Behavioral</span>
            <span>Technical</span>
            <span>System design</span>
            <span>Leadership</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32" id="how-it-works">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">Designed around the real experience</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            More than practice questions. A better way to prepare.
          </h2>
        </div>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {capabilities.map(({ icon: Icon, eyebrow, title, description }, index) => (
            <article
              className="group rounded-3xl border border-border bg-card/45 p-7 transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:bg-card"
              key={title}
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm text-muted-foreground">0{index + 1}</span>
              </div>
              <p className="mt-8 text-xs font-medium uppercase tracking-[0.13em] text-primary">
                {eyebrow}
              </p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.025em]">
                {title}
              </h3>
              <p className="mt-4 leading-7 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8 lg:pb-32">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-[linear-gradient(115deg,oklch(0.25_0.07_250),oklch(0.19_0.03_260))] px-6 py-14 sm:px-12 lg:px-16">
          <div className="landing-orb absolute -right-20 -top-32 size-96 rounded-full bg-primary/25 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_0.75fr] lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="size-4" />
                Build the answer you want to give
              </p>
              <h2 className="mt-4 max-w-2xl text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Your next interview deserves more than a guess.
              </h2>
              <p className="mt-5 max-w-xl leading-7 text-muted-foreground">
                Practice with intention, hear how you come across, and walk into the real
                conversation with a plan.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-background/35 p-5 backdrop-blur">
              <p className="text-sm font-medium">What you’ll leave with</p>
              <ul className="mt-4 space-y-3">
                {practiceSignals.map((signal) => (
                  <li
                    className="flex items-center gap-3 text-sm text-muted-foreground"
                    key={signal}
                  >
                    <Check className="size-4 text-primary" />
                    {signal}
                  </li>
                ))}
              </ul>
              <Link
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                href="/sign-up"
              >
                Create your free account <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2">
            <BrandMark />
            <span className="font-medium text-foreground">Interviewer AI</span>
          </div>
          <p>Practice interviews that feel real.</p>
        </div>
      </footer>
    </main>
  );
}
