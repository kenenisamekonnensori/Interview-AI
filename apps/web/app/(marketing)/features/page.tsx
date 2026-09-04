import type { Metadata } from "next";
import {
  AudioLines,
  BrainCircuit,
  Gauge,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "Features" };

const features = [
  {
    icon: AudioLines,
    title: "Voice-first interviews",
    description:
      "Speak naturally with an AI interviewer that listens in real time, asks follow-ups, and responds like a person — not a script.",
  },
  {
    icon: BrainCircuit,
    title: "Personalized to your role",
    description:
      "Your resume and the job description you're targeting shape every question. Every session reflects your actual opportunity.",
  },
  {
    icon: MessageSquare,
    title: "Dynamic follow-up questions",
    description:
      "The interviewer reacts to what you say. Mention a gap in your experience and it will ask about it — just like a real hiring manager would.",
  },
  {
    icon: Gauge,
    title: "Structured evaluation",
    description:
      "Every answer is scored across communication, structure, technical depth, and confidence — so feedback is specific, not vague.",
  },
  {
    icon: TrendingUp,
    title: "Progress tracking",
    description:
      "Every interview is saved. Compare sessions over time and watch your scores move as you practice.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy-first by design",
    description:
      "Your resume and transcripts are encrypted, provider keys never touch the browser, and your data is never sold.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <PageHeading
          eyebrow="Features"
          title="Everything you need to interview with confidence"
          description="Interviewer AI turns your resume and target role into a realistic, voice-first practice interview — then shows you exactly what to improve before the real thing."
        />
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, description }) => (
          <article
            key={title}
            className="glass-surface group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#6366f1]/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.12)]"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-[#6366f1]/12 text-[#c0c1ff] transition-colors duration-300 group-hover:bg-[#6366f1]/20">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-5 text-base font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>
          </article>
        ))}
      </div>

      {/* How a practice session works */}
      <section className="mt-24">
        <h2 className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-[#c0c1ff]">
          Inside a session
        </h2>
        <div className="mx-auto mt-4 max-w-md text-center">
          <p className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            What actually happens when you practice
          </p>
        </div>

        <div className="glass-surface mx-auto mt-10 max-w-3xl overflow-hidden rounded-3xl">
          <div className="grid divide-y divide-white/[.05] md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              {
                step: "01",
                title: "It analyzes your context",
                body: "Your resume and job description are parsed into the skills, responsibilities, and experience the interviewer will probe.",
              },
              {
                step: "02",
                title: "You speak, it adapts",
                body: "The interviewer listens to each answer and decides what to ask next — deepening, clarifying, or changing direction like a real conversation.",
              },
              {
                step: "03",
                title: "You get a candid report",
                body: "Scores across communication and content, what went well, what to fix, and concrete suggestions for your next session.",
              },
            ].map((item) => (
              <div key={item.step} className="p-7">
                <p className="text-xs font-mono font-medium text-[#6366f1]">{item.step}</p>
                <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-20">
        <CtaCard
          title="See it for yourself"
          body="Start a free practice interview in the next two minutes and hear how different it feels."
          ctaLabel="Try a practice interview"
        />
      </div>
    </div>
  );
}
