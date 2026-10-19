"use client";

import { Check, X, Sparkles, Mic, Clock, Brain, DollarSign } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { FadeUp, StaggerContainer, StaggerItem } from "./animations";

const COMPARISON_ITEMS = [
  {
    feature: "Realistic voice conversational pressure",
    chatgpt: false,
    leetcode: false,
    human: true,
    interviewerAi: true,
    subtext: "Trains thinking out loud without backspacing",
  },
  {
    feature: "Adaptive, unscripted follow-up questions",
    chatgpt: "Partial",
    leetcode: false,
    human: true,
    interviewerAi: true,
    subtext: "Digs into your trade-offs instead of fixed scripts",
  },
  {
    feature: "Tailored to your specific resume & target JD",
    chatgpt: "Manual prompt",
    leetcode: false,
    human: "Rarely",
    interviewerAi: true,
    subtext: "Ingests both documents to calibrate difficulty",
  },
  {
    feature: "Available 24/7 on-demand with zero scheduling",
    chatgpt: true,
    leetcode: true,
    human: false,
    interviewerAi: true,
    subtext: "Practice at 11 PM before tomorrow's onsite",
  },
  {
    feature: "Cost per comprehensive mock round",
    chatgpt: "Free/Subscription",
    leetcode: "Subscription",
    human: "$150 – $300 / hr",
    interviewerAi: "Free monthly / Affordable Pro",
    subtext: "Unlimited reps without burning your wallet",
  },
  {
    feature: "Zero awkwardness or performance anxiety",
    chatgpt: true,
    leetcode: true,
    human: false,
    interviewerAi: true,
    subtext: "Make mistakes and stumble in private safe space",
  },
];

export function ComparisonSection() {
  return (
    <section className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <FadeUp>
        <SectionHeading
          eyebrow="Why It Outperforms Traditional Prep"
          title="Built for the conversation, not the questionnaire."
          description="Most candidates spend weeks grinding algorithms or typing prompts, then freeze the moment an interviewer asks them to explain their architecture out loud."
        />
      </FadeUp>

      <FadeUp delay={0.2} className="mt-14 overflow-x-auto">
        <div className="glass-panel min-w-[700px] overflow-hidden rounded-2xl border border-[var(--hairline)]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--hairline)] bg-slate-50/70 font-mono text-[11px] uppercase tracking-wider text-[var(--ink-text-secondary)]">
                <th className="p-5 font-semibold">Preparation Method</th>
                <th className="p-5 font-medium text-slate-500">Text Chatbots</th>
                <th className="p-5 font-medium text-slate-500">Code Grinding</th>
                <th className="p-5 font-medium text-slate-500">Human Mocks</th>
                <th className="bg-bronze-500/10 p-5 font-bold text-bronze-800">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-bronze-600" />
                    Interviewer AI
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline)] text-sm">
              {COMPARISON_ITEMS.map((item) => (
                <tr
                  key={item.feature}
                  className="transition-colors hover:bg-slate-50/50"
                >
                  <td className="p-5">
                    <p className="font-medium text-[var(--ink-text)]">{item.feature}</p>
                    <p className="mt-0.5 text-xs text-[var(--ink-text-secondary)]">
                      {item.subtext}
                    </p>
                  </td>

                  {/* ChatGPT */}
                  <td className="p-5 text-center text-xs text-slate-500">
                    {typeof item.chatgpt === "boolean" ? (
                      item.chatgpt ? (
                        <Check className="mx-auto size-4 text-emerald-600" />
                      ) : (
                        <X className="mx-auto size-4 text-slate-300" />
                      )
                    ) : (
                      item.chatgpt
                    )}
                  </td>

                  {/* LeetCode */}
                  <td className="p-5 text-center text-xs text-slate-500">
                    {typeof item.leetcode === "boolean" ? (
                      item.leetcode ? (
                        <Check className="mx-auto size-4 text-emerald-600" />
                      ) : (
                        <X className="mx-auto size-4 text-slate-300" />
                      )
                    ) : (
                      item.leetcode
                    )}
                  </td>

                  {/* Human Mocks */}
                  <td className="p-5 text-center text-xs text-slate-500">
                    {typeof item.human === "boolean" ? (
                      item.human ? (
                        <Check className="mx-auto size-4 text-emerald-600" />
                      ) : (
                        <X className="mx-auto size-4 text-slate-300" />
                      )
                    ) : (
                      item.human
                    )}
                  </td>

                  {/* Interviewer AI */}
                  <td className="bg-bronze-500/[0.04] p-5 text-center font-semibold text-bronze-800">
                    {typeof item.interviewerAi === "boolean" ? (
                      <span className="grid size-6 mx-auto place-items-center rounded-full bg-bronze-500/20 text-bronze-700">
                        <Check className="size-4 text-bronze-700" />
                      </span>
                    ) : (
                      <span className="rounded-full bg-bronze-500/15 px-2.5 py-1 text-xs text-bronze-800">
                        {item.interviewerAi}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FadeUp>
    </section>
  );
}
