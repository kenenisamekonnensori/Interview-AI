import type { ReadinessAssessment } from "@interviewer-ai/types";

/** Deterministic tone bucket for the readiness gauge (never fabricated). */
export type ReadinessTone = "none" | "low" | "medium" | "high";

export function scoreTone(score: number | null): ReadinessTone {
  if (score === null) return "none";
  if (score < 50) return "low";
  if (score < 75) return "medium";
  return "high";
}

/** "+6 pts" / "−4 pts" / "No change" / null when there is no trend to show. */
export function changeLabel(change: number | null): string | null {
  if (change === null) return null;
  if (change === 0) return "No change";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)} pts`;
}

/** The single next action derived from gaps: missing evidence first, then weakest. */
export function nextAction(gaps: ReadinessAssessment["gaps"]): string | null {
  const missing = gaps.find((gap) => gap.kind === "MISSING_EVIDENCE");
  if (missing) return missing.label;
  return gaps[0]?.label ?? null;
}

/** Groups gaps for display: weak skills vs. missing evidence. */
export function groupGaps(gaps: ReadinessAssessment["gaps"]) {
  return {
    weak: gaps.filter((gap) => gap.kind === "WEAK_SKILL"),
    missing: gaps.filter((gap) => gap.kind === "MISSING_EVIDENCE"),
  };
}
