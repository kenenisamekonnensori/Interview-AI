import type { Metadata } from "next";
import { Compass, Heart, Layers, MessageSquare, PenLine, Zap } from "lucide-react";
import { SUPPORT_EMAIL } from "../../../features/marketing/site";

export const metadata: Metadata = { title: "Careers" };

const principles = [
  {
    icon: Compass,
    title: "User-obsessed",
    body: "We talk to candidates constantly. If a change doesn't make someone more ready for their real interview, we question whether it ships.",
  },
  {
    icon: Zap,
    title: "Fast and deliberate",
    body: "Small team, short loops. We ship working software every week and let real usage steer us.",
  },
  {
    icon: PenLine,
    title: "Craft in everything",
    body: "Latency, pacing, the way a sentence lands — the details are the product. We sweat them.",
  },
  {
    icon: Layers,
    title: "Own your slice",
    body: "Engineers own features end to end: design decisions, implementation, and the users who depend on them.",
  },
];

const benefits = [
  { icon: Heart, text: "Meaningful work with a clear mission — helping people land opportunities" },
  { icon: MessageSquare, text: "Small, senior team with direct access to users and product decisions" },
  { icon: Layers, text: "Modern stack: Next.js, Fastify, PostgreSQL, Redis, and voice AI" },
  { icon: Zap, text: "Remote-friendly, async-first culture that respects your focus time" },
];

export default function CareersPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#c0c1ff]">Careers</p>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">
          Help us make interviews feel less like a test
        </h1>
        <p className="mt-4 text-base leading-relaxed text-white/55">
          We're a small team building AI that makes people better communicators — one realistic
          practice conversation at a time.
        </p>
      </div>

      {/* Principles */}
      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          How we work
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {principles.map(({ icon: Icon, title, body }) => (
            <article key={title} className="glass-surface rounded-2xl p-6">
              <span className="grid size-9 place-items-center rounded-xl bg-[#6366f1]/12 text-[#c0c1ff]">
                <Icon className="size-4.5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          Why join us
        </h2>
        <ul className="mt-4 space-y-3">
          {benefits.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="glass-surface flex items-start gap-3 rounded-2xl px-5 py-4 text-sm leading-relaxed text-white/65"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-[#c0c1ff]" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      </section>

      {/* Open roles */}
      <section className="mt-14">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">
          Open roles
        </h2>
        <div className="glass-surface mt-4 rounded-3xl px-8 py-12 text-center">
          <p className="text-lg font-semibold text-white">We&apos;re not hiring right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/55">
            We&apos;re a deliberately small team, and we only grow when the work demands it. But
            we&apos;re always glad to meet exceptional people — introduce yourself and we&apos;ll
            keep you in mind for the next chapter.
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Introduction%20—%20Interviewer%20AI`}
            className="btn-premium mt-6 inline-flex h-11 items-center rounded-xl px-6 text-sm font-semibold text-white"
          >
            Introduce yourself
          </a>
        </div>
      </section>
    </div>
  );
}