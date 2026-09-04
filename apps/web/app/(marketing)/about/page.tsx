import type { Metadata } from "next";
import { AudioLines, HeartHandshake, ShieldCheck, Target } from "lucide-react";
import { CtaCard } from "../../../features/marketing/components/cta-card";
import { PageHeading } from "../../../features/marketing/components/page-heading";

export const metadata: Metadata = { title: "About" };

const values = [
  {
    icon: AudioLines,
    title: "Practice that feels real",
    body: "If preparation doesn't reproduce the pressure of the real thing, it's not preparation. We obsess over making sessions feel like actual interviews.",
  },
  {
    icon: Target,
    title: "Honest, specific feedback",
    body: "Generic praise helps no one. Every session ends with a candid, specific read on how you communicate and what to improve.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by default",
    body: "Your resume and practice data belong to you. We keep provider keys on the server, encrypt data, and never sell what you upload.",
  },
  {
    icon: HeartHandshake,
    title: "Accessible to everyone",
    body: "Getting better at interviews shouldn't require a personal coach. We build one platform that works for students, career changers, and seasoned professionals alike.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <PageHeading
          eyebrow="About"
          title="We're building interview practice that feels like the real thing"
          description="Interviewer AI exists to close the gap between reading about interviews and actually being ready for them."
        />
      </div>

      {/* Mission */}
      <section className="mx-auto mt-12 max-w-3xl">
        <h2 className="text-2xl font-bold tracking-[-0.02em] text-white">Why we started this</h2>
        <div className="mt-4 space-y-4 text-[15px] leading-[1.8] text-white/60">
          <p>
            Most interview preparation is passive. Candidates read question lists, watch videos,
            and memorize answers — then sit down across from a real interviewer and discover that
            speaking under pressure is a completely different skill.
          </p>
          <p>
            We started Interviewer AI to build the preparation we wished existed: a place where you
            can have a realistic conversation with an interviewer who listens to what you say,
            follows up on it, and holds you to the standard of a real hiring conversation. Then,
            when it's over, tells you the truth about how you did.
          </p>
          <p>
            The product is early and the team is small, but the direction is deliberate: every
            session should feel less like a quiz and more like the interview you're actually
            preparing for.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="mt-20">
        <h2 className="text-center text-2xl font-bold tracking-[-0.02em] text-white">
          What we believe
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {values.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="glass-surface rounded-2xl p-6 transition-all duration-300 hover:border-[#6366f1]/25"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-[#6366f1]/12 text-[#c0c1ff]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Today */}
      <section className="mx-auto mt-20 max-w-3xl rounded-3xl border border-white/[.07] bg-white/[.03] p-8">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-white">Where we are today</h2>
        <p className="mt-3 text-[15px] leading-[1.8] text-white/60">
          Interviewer AI is in public beta. Voice practice interviews, personalized planning, and
          structured feedback are live — and we're adding progress tracking, more interview types,
          and team features next. If you'd like to shape what we build, your feedback goes straight
          to the people shipping it.
        </p>
      </section>

      <div className="mt-16">
        <CtaCard
          title="Help us make interviews less intimidating"
          body="The best way to shape the product is to use it. Start a free practice session and tell us what you think."
          ctaLabel="Try Interviewer AI free"
        />
      </div>
    </div>
  );
}