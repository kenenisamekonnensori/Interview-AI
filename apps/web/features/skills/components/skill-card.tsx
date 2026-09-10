"use client";

import type { SkillAnalysisDto, SkillAssessment, SkillConfidence } from "@interviewer-ai/types";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

type SkillInsight = NonNullable<SkillAnalysisDto["insights"]>[string];

const statusChip: Record<SkillAssessment["status"], { label: string; className: string }> = {
  STRENGTH: { label: "Strength", className: "bg-emerald-300/15 text-emerald-300" },
  WEAKNESS: { label: "Area to improve", className: "bg-amber-300/15 text-amber-300" },
  IMPROVING: { label: "Improving", className: "bg-sky-300/15 text-sky-300" },
  DEVELOPING: { label: "Developing", className: "bg-muted text-muted-foreground" },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient evidence",
    className: "bg-muted text-muted-foreground",
  },
};

const confidenceLabel: Record<SkillConfidence, string> = {
  LOW: "Low confidence",
  MEDIUM: "Medium confidence",
  HIGH: "High confidence",
};

export function SkillCard({
  skill,
  insight,
}: {
  skill: SkillAssessment;
  insight?: SkillInsight | undefined;
}) {
  const [open, setOpen] = useState(false);
  const chip = statusChip[skill.status];
  return (
    <div className="surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`skill-detail-${skill.skillKey}`}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-5 text-left transition-colors hover:bg-card/60"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{skill.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
            >
              {chip.label}
            </span>
            <TrendBadge change={skill.trend.change} direction={skill.trend.direction} />
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {confidenceLabel[skill.confidence]} · {skill.observationCount}{" "}
            {skill.observationCount === 1 ? "observation" : "observations"}
          </span>
        </span>
        <span className="text-2xl font-semibold tabular-nums">
          {skill.level === null ? "—" : `${skill.level} / 100`}
        </span>
      </button>
      {open ? (
        <div
          id={`skill-detail-${skill.skillKey}`}
          className="border-t border-border/70 px-5 pb-5 pt-4"
        >
          <p className="text-sm leading-6 text-muted-foreground">{skill.explanation}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Supporting interviews
              </p>
              {skill.supportingInterviews.length ? (
                <ul className="mt-2 space-y-1.5">
                  {skill.supportingInterviews.map((interview) => (
                    <li
                      key={interview.interviewId}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {formatDate(interview.completedAt)} ·{" "}
                        {interview.interviewType.replace("_", " ")}
                      </span>
                      <span className="font-medium tabular-nums">{interview.score}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No scored interviews yet.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recommended practice
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {skill.recommendedPractice}
              </p>
            </div>
          </div>
          {insight ? (
            <div className="mt-4 rounded-xl border border-border bg-card/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AI interpretation
              </p>
              <p className="mt-2 text-sm leading-6">{insight.insight}</p>
              {insight.recommendedPractice ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">Suggested:</span>{" "}
                  {insight.recommendedPractice}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TrendBadge({
  change,
  direction,
}: {
  change: number | null;
  direction: SkillAssessment["trend"]["direction"];
}) {
  if (change === null || direction === null)
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        No trend yet
      </span>
    );
  if (direction === "flat")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Minus className="size-3" /> Steady
      </span>
    );
  const up = direction === "up";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        up ? "bg-emerald-300/15 text-emerald-300" : "bg-amber-300/15 text-amber-300"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {change} pts
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
