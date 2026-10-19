"use client";

import { Star, CheckCircle } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { FadeUp, StaggerContainer, StaggerItem } from "./animations";
import { TiltCard } from "./tilt-card";

const STORIES = [
  {
    candidate: "Alex R.",
    role: "Senior Distributed Systems Engineer",
    company: "Offer accepted: Tier 1 Cloud Infrastructure",
    quote:
      "The hardest part of system design interviews was articulating why I picked a specific database topology under pressure. Interviewer AI interrupted me when I hand-waved sharding keys, exactly like my actual Meta interviewer did. I walked into the loop completely calm.",
    scoreBefore: "68%",
    scoreAfter: "91%",
    rounds: "6 voice rounds",
  },
  {
    candidate: "Maya K.",
    role: "Lead Product Manager",
    company: "Offer accepted: High-growth Fintech",
    quote:
      "I used to ramble for 4 minutes during product sense questions. The pacing metric and instant transcription feedback trained me to lead with the metric hypothesis and framework in the first 30 seconds. It transformed how hiring managers perceived my executive presence.",
    scoreBefore: "62%",
    scoreAfter: "89%",
    rounds: "8 voice rounds",
  },
  {
    candidate: "David T.",
    role: "Full-Stack Software Engineer",
    company: "Offer accepted: Series B AI Startup",
    quote:
      "ChatGPT just nods along with whatever code you paste. Interviewer AI heard the hesitation in my voice when asked about browser micro-task queues, asked for a deeper explanation, and scored my technical depth accurately. It is night and day compared to text.",
    scoreBefore: "71%",
    scoreAfter: "94%",
    rounds: "5 voice rounds",
  },
];

export function CandidateStories() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <FadeUp>
        <SectionHeading
          eyebrow="Candidate Outcomes"
          title="From freezing on follow-ups to commanding the room."
          description="Read how candidates transformed their verbal delivery, eliminated nervous rambling, and landed senior engineering and product offers."
        />
      </FadeUp>

      <StaggerContainer className="mt-14 grid gap-6 md:grid-cols-3" staggerDelay={0.12}>
        {STORIES.map((story) => (
          <StaggerItem key={story.candidate}>
            <TiltCard tiltAngle={7} glareOpacity={0.12} className="h-full">
              <div className="glass-panel group relative flex h-full flex-col justify-between rounded-2xl border border-[var(--hairline)] p-6 transition-all duration-300 hover:border-bronze-500/40 hover:shadow-lg">
                {/* Corner square architectural mark */}
                <span className="absolute right-3.5 top-3.5 size-1.5 rounded-[1px] bg-bronze-500/70" />

                <div>
                  <div className="flex items-center gap-1 text-amber-500">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} className="size-3.5 fill-current" />
                    ))}
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-[var(--ink-text)]">
                    &ldquo;{story.quote}&rdquo;
                  </p>
                </div>

                <div className="mt-6 border-t border-[var(--hairline)] pt-4">
                  {/* Score progression indicator */}
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs">
                    <span className="font-mono text-slate-500">Practice Progression:</span>
                    <div className="flex items-center gap-1.5 font-mono font-semibold">
                      <span className="text-slate-400">{story.scoreBefore}</span>
                      <span className="text-slate-400">→</span>
                      <span className="text-emerald-600">{story.scoreAfter}</span>
                      <span className="text-[10px] text-slate-400">({story.rounds})</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[var(--ink-text)]">
                      {story.candidate}
                    </h4>
                    <p className="text-xs text-[var(--ink-text-secondary)]">{story.role}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                      <CheckCircle className="size-3" />
                      {story.company}
                    </p>
                  </div>
                </div>
              </div>
            </TiltCard>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}
