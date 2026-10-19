"use client";

import { useState } from "react";
import {
  Code2,
  BrainCircuit,
  Briefcase,
  Layers,
  MessagesSquare,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Award,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionHeading } from "./section-heading";
import { FadeUp } from "./animations";
import { TiltCard } from "./tilt-card";

interface Track {
  id: string;
  name: string;
  badge: string;
  icon: typeof Code2;
  level: string;
  starterQuestion: string;
  candidateSnippet: string;
  adaptiveFollowUp: string;
  evaluationRubric: {
    criteria: string;
    targetScore: string;
    whyItMatters: string;
  }[];
}

const TRACKS: Track[] = [
  {
    id: "system-design",
    name: "System Design & Architecture",
    badge: "Staff / Senior Backend",
    icon: BrainCircuit,
    level: "L5 / L6",
    starterQuestion:
      "Design a real-time collaborative whiteboarding service (like Figma or Miro) that supports 50 concurrent editors per room with sub-50ms sync latency.",
    candidateSnippet:
      "I'll use WebSockets with operational transformation or CRDTs for document convergence, and persist states to DynamoDB with a Redis cache layer for active rooms.",
    adaptiveFollowUp:
      "You mentioned CRDTs with Redis — what happens to state convergence when a network partition isolates three clients for 15 seconds while they continue editing conflicting nodes?",
    evaluationRubric: [
      {
        criteria: "CAP Theorem Trade-offs",
        targetScore: "92%",
        whyItMatters: "Proves candidate understands consistency vs availability in partitioned networks.",
      },
      {
        criteria: "Conflict Resolution Protocol",
        targetScore: "88%",
        whyItMatters: "Validates depth beyond textbook buzzwords.",
      },
      {
        criteria: "Failure Domain Isolation",
        targetScore: "85%",
        whyItMatters: "Ensures single room spike doesn't degrade cluster throughput.",
      },
    ],
  },
  {
    id: "frontend",
    name: "Frontend & Web Architecture",
    badge: "Senior / Lead Frontend",
    icon: Code2,
    level: "L5",
    starterQuestion:
      "A financial dashboard with 2,000 live updating ticker items has an unacceptable Interaction to Next Paint (INP) score of 420ms. How do you isolate and resolve it?",
    candidateSnippet:
      "I would profile the main thread using Chrome Performance DevTools, check for long tasks caused by un-virtualized DOM re-renders, and debounce state updates.",
    adaptiveFollowUp:
      "Debouncing reduces ticker update frequency, but traders demand sub-second freshness. How would you handle virtualization and offload calculation without losing real-time updates?",
    evaluationRubric: [
      {
        criteria: "Browser Rendering Pipeline",
        targetScore: "94%",
        whyItMatters: "Distinguishes junior UI devs from high-performance web engineers.",
      },
      {
        criteria: "Concurrency & Workers",
        targetScore: "90%",
        whyItMatters: "Evaluates ability to keep main thread unblocked under heavy streaming data.",
      },
      {
        criteria: "Memory Leak Diagnostics",
        targetScore: "86%",
        whyItMatters: "Prevents memory bloat over extended trading dashboard sessions.",
      },
    ],
  },
  {
    id: "product-mgmt",
    name: "Product Strategy & Execution",
    badge: "Lead / Group PM",
    icon: Briefcase,
    level: "L6 / Principal",
    starterQuestion:
      "Your core subscription product experienced a 14% drop in Day-30 user retention after a redesign meant to improve discovery. How do you lead your team through the response?",
    candidateSnippet:
      "First, I'll segment by user cohorts to isolate whether power users or new signups dropped off. Then we review heatmaps and funnel drop-offs before deciding whether to roll back.",
    adaptiveFollowUp:
      "The cohort analysis shows power users dropped 22% because their primary workflow was moved into a sub-navigation. The design team argues the new IA is better long-term. What is your exact decision?",
    evaluationRubric: [
      {
        criteria: "Metric Root-Cause Analysis",
        targetScore: "91%",
        whyItMatters: "Tests hypothesis-driven investigation vs knee-jerk rollbacks.",
      },
      {
        criteria: "Stakeholder Conflict Resolution",
        targetScore: "89%",
        whyItMatters: "Measures executive presence when engineering, design, and business clash.",
      },
      {
        criteria: "Actionable 7-Day Plan",
        targetScore: "87%",
        whyItMatters: "Validates crisp prioritization under business pressure.",
      },
    ],
  },
  {
    id: "behavioral",
    name: "Behavioral & STAR Leadership",
    badge: "Universal All Roles",
    icon: MessagesSquare,
    level: "Mid to Staff",
    starterQuestion:
      "Tell me about a high-stakes scenario where you had to push back on a critical deadline set by an executive.",
    candidateSnippet:
      "Our VP wanted to launch a payment integration three weeks early for a conference. I audited test coverage, showed the team could not guarantee zero transaction failure, and proposed a staged beta.",
    adaptiveFollowUp:
      "The VP rejected your beta proposal and said the PR value of the keynote outweighed the risk. What was your immediate next action, and how did you protect both the team and customer data?",
    evaluationRubric: [
      {
        criteria: "STAR Framework Rigor",
        targetScore: "95%",
        whyItMatters: "Situation, Task, Action, and Quantified Result structure.",
      },
      {
        criteria: "Principled Disagreement",
        targetScore: "92%",
        whyItMatters: "Shows emotional intelligence and courage without being combative.",
      },
      {
        criteria: "Risk Quantification",
        targetScore: "88%",
        whyItMatters: "Translates technical exposure into business risk metrics.",
      },
    ],
  },
];

export function InterviewTrackExplorer() {
  const [selectedId, setSelectedId] = useState(TRACKS[0]!.id);
  const activeTrack = TRACKS.find((t) => t.id === selectedId) || TRACKS[0]!;

  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <FadeUp>
        <SectionHeading
          eyebrow="Targeted Role Tracks"
          title="Trained on the exact rubrics hiring committees actually debate."
          description="Click a track below to see how Interviewer AI listens to your answer, finds the weak point, and immediately tests your conviction with a realistic follow-up."
        />
      </FadeUp>

      {/* Track selector tabs */}
      <FadeUp delay={0.15}>
        <div className="mt-12 flex flex-wrap justify-center gap-2 border-b border-[var(--hairline)] pb-4">
          {TRACKS.map((track) => {
            const Icon = track.icon;
            const isSelected = track.id === selectedId;

            return (
              <button
                key={track.id}
                type="button"
                onClick={() => setSelectedId(track.id)}
                className={`relative inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                  isSelected
                    ? "bg-white text-[var(--ink-text)] shadow-[0_4px_16px_-4px_rgba(15,23,42,0.1)] ring-1 ring-[var(--hairline-strong)]"
                    : "text-[var(--ink-text-secondary)] hover:bg-white/60 hover:text-[var(--ink-text)]"
                }`}
              >
                <Icon
                  className={`size-4 ${isSelected ? "text-bronze-600" : "text-slate-400"}`}
                  aria-hidden="true"
                />
                <span>{track.name}</span>
                {isSelected && (
                  <motion.div
                    layoutId="activeTrackTab"
                    className="absolute inset-x-0 -bottom-4 h-0.5 bg-bronze-600"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </FadeUp>

      {/* Dynamic interactive scenario preview */}
      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTrack.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]"
          >
            {/* Left: Dialogue simulation */}
            <TiltCard tiltAngle={5} glareOpacity={0.1} className="h-full">
              <div className="glass-panel relative flex h-full flex-col justify-between rounded-2xl p-6 sm:p-8">
                {/* Corner square architectural mark */}
                <span className="absolute right-3.5 top-3.5 size-1.5 rounded-[1px] bg-bronze-500/70" />

                <div>
                  <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-bronze-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-bronze-700">
                        {activeTrack.level}
                      </span>
                      <span className="font-mono text-xs text-[var(--ink-text-secondary)]">
                        {activeTrack.badge}
                      </span>
                    </div>
                    <span className="live-dot font-mono text-[11px] text-[var(--teal)]">
                      Simulated Turn
                    </span>
                  </div>

                  {/* Question from interviewer */}
                  <div className="mt-6">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-bronze-700">
                      Interviewer Question
                    </p>
                    <p className="mt-2 text-base font-semibold leading-relaxed text-[var(--ink-text)]">
                      &ldquo;{activeTrack.starterQuestion}&rdquo;
                    </p>
                  </div>

                  {/* Candidate response excerpt */}
                  <div className="mt-6 rounded-xl border border-[var(--hairline)] bg-white/70 p-4">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-slate-500">
                      Candidate Answer (Spoken)
                    </p>
                    <p className="mt-1.5 text-sm italic leading-relaxed text-[var(--ink-text-secondary)]">
                      &ldquo;{activeTrack.candidateSnippet}&rdquo;
                    </p>
                  </div>

                  {/* Adaptive follow-up challenge */}
                  <div className="mt-6 rounded-xl border border-bronze-500/30 bg-bronze-500/[0.04] p-4.5">
                    <div className="flex items-center gap-2 text-bronze-700">
                      <Sparkles className="size-4" aria-hidden="true" />
                      <p className="font-mono text-[11px] font-bold uppercase tracking-wider">
                        Interviewer Adaptive Follow-up
                      </p>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--ink-text)]">
                      &ldquo;{activeTrack.adaptiveFollowUp}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-[var(--hairline)] pt-4 text-xs text-[var(--ink-text-secondary)]">
                  <span>Evaluates trade-off conviction</span>
                  <span className="font-mono text-[11px] font-semibold text-bronze-700">
                    Target: Senior Hiring Bar
                  </span>
                </div>
              </div>
            </TiltCard>

            {/* Right: Real-time Rubric breakdown */}
            <TiltCard tiltAngle={5} glareOpacity={0.1} className="h-full">
              <div className="glass-panel relative flex h-full flex-col justify-between rounded-2xl p-6 sm:p-8">
                <span className="absolute right-3.5 top-3.5 size-1.5 rounded-[1px] bg-bronze-500/70" />

                <div>
                  <div className="flex items-center gap-2 border-b border-[var(--hairline)] pb-4">
                    <Award className="size-4 text-bronze-600" aria-hidden="true" />
                    <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink-text)]">
                      Automated Committee Rubric
                    </h4>
                  </div>

                  <div className="mt-6 space-y-4">
                    {activeTrack.evaluationRubric.map((item, idx) => (
                      <div
                        key={item.criteria}
                        className="rounded-xl border border-[var(--hairline)] bg-white/70 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-[var(--ink-text)]">
                            {item.criteria}
                          </span>
                          <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-700">
                            {item.targetScore}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-text-secondary)]">
                          {item.whyItMatters}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-xl bg-slate-100/70 p-3.5 text-center text-xs text-[var(--ink-text-secondary)]">
                  Scored automatically against 4,000+ real hiring decisions at top tier technology companies.
                </div>
              </div>
            </TiltCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
