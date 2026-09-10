import {
  interviewEvaluationSchema,
  type InterviewEvaluation,
  type InterviewType,
  type SkillAssessment,
  type SkillConfidence,
  type SkillKey,
  type SkillStatus,
} from "@interviewer-ai/types";

import { FIXED_DIMENSION_SKILLS, normalizeCategoryKey, SKILL_LABELS } from "./skill-taxonomy.js";

/** Minimal shape of a completed interview row the engine consumes. */
export type SkillReportRow = {
  id: string;
  interviewType: string;
  report: { evaluation: unknown } | null;
  completedAt: Date | null;
};

export type SkillObservation = {
  skillKey: SkillKey;
  score: number;
  feedback: string;
  interviewId: string;
  completedAt: Date;
  interviewType: InterviewType;
};

type Trend = SkillAssessment["trend"];

/** Rows with a completed timestamp and a schema-valid evaluation. */
export function validSkillReportRows(rows: SkillReportRow[]): SkillReportRow[] {
  return rows.filter(
    (row) =>
      row.completedAt !== null &&
      interviewEvaluationSchema.safeParse(row.report?.evaluation).success,
  );
}

/**
 * Extracts one observation per evaluation dimension onto a canonical skill.
 * Fixed dimensions always map; free-form category labels are normalized onto
 * the controlled taxonomy (unknown labels are skipped, never fabricated).
 */
export function computeSkillObservations(
  rows: SkillReportRow[],
): Map<SkillKey, SkillObservation[]> {
  const observations = new Map<SkillKey, SkillObservation[]>();
  for (const row of validSkillReportRows(rows)) {
    const evaluation = interviewEvaluationSchema.parse(row.report?.evaluation);
    const add = (skillKey: SkillKey, score: number, feedback: string) => {
      const list = observations.get(skillKey) ?? [];
      list.push({
        skillKey,
        score,
        feedback,
        interviewId: row.id,
        completedAt: row.completedAt!,
        interviewType: row.interviewType as InterviewType,
      });
      observations.set(skillKey, list);
    };
    for (const [dimension, skillKey] of Object.entries(FIXED_DIMENSION_SKILLS)) {
      const value = evaluation[dimension as keyof InterviewEvaluation] as {
        score: number;
        feedback: string;
      };
      add(skillKey, value.score, value.feedback);
    }
    for (const [category, dimension] of Object.entries(evaluation.categoryScores)) {
      const skillKey = normalizeCategoryKey(category);
      if (skillKey) add(skillKey, dimension.score, dimension.feedback);
    }
  }
  for (const list of observations.values())
    list.sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime());
  return observations;
}

/** Derives one skill assessment from its chronological observations. */
export function assessSkill(skillKey: SkillKey, observations: SkillObservation[]): SkillAssessment {
  const scores = observations.map((observation) => observation.score);
  const count = scores.length;
  const level = count
    ? Math.round(scores.reduce((total, score) => total + score, 0) / count)
    : null;
  const latestScore = scores.at(-1) ?? null;
  const trend = trendFor(scores);
  const status = statusFor(count, level, trend);
  return {
    skillKey,
    label: SKILL_LABELS[skillKey],
    status,
    level,
    latestScore,
    trend,
    confidence: confidenceFor(count),
    observationCount: count,
    explanation: explanationFor(
      skillKey,
      count,
      level,
      latestScore,
      trend,
      observations.at(-1)?.feedback,
    ),
    recommendedPractice: recommendedPracticeFor(skillKey, status),
    supportingInterviews: observations
      .slice(-5)
      .reverse()
      .map((observation) => ({
        interviewId: observation.interviewId,
        completedAt: observation.completedAt.toISOString(),
        score: observation.score,
        interviewType: observation.interviewType,
      })),
  };
}

/**
 * Deterministic skill profile from persisted evaluations. All numbers are
 * computed here — no AI is used for statistics.
 */
export function computeSkillProfile(rows: SkillReportRow[]): SkillAssessment[] {
  const observations = computeSkillObservations(rows);
  const assessments = [...observations.entries()].map(([skillKey, list]) =>
    assessSkill(skillKey, list),
  );
  const statusOrder: Record<SkillStatus, number> = {
    WEAKNESS: 0,
    IMPROVING: 1,
    STRENGTH: 2,
    DEVELOPING: 3,
    INSUFFICIENT_EVIDENCE: 4,
  };
  assessments.sort(
    (left, right) =>
      statusOrder[left.status] - statusOrder[right.status] ||
      right.observationCount - left.observationCount ||
      (right.level ?? 0) - (left.level ?? 0),
  );
  return assessments;
}

function average(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function confidenceFor(count: number): SkillConfidence {
  if (count >= 10) return "HIGH";
  if (count >= 5) return "MEDIUM";
  return "LOW";
}

/**
 * Trend from persisted scores. With 4+ observations the two halves are
 * compared so a single answer cannot flip the direction; below that the first
 * and latest observation are compared.
 */
function trendFor(scores: number[]): Trend {
  let change: number | null = null;
  if (scores.length >= 4) {
    const midpoint = Math.floor(scores.length / 2);
    change = Math.round(average(scores.slice(midpoint)) - average(scores.slice(0, midpoint)));
  } else if (scores.length >= 2) {
    change = scores.at(-1)! - scores[0]!;
  }
  if (change === null) return { change: null, direction: null };
  return {
    change,
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
}

function statusFor(count: number, level: number | null, trend: Trend): SkillStatus {
  if (count < 2) return "INSUFFICIENT_EVIDENCE";
  if (trend.direction === "up" && (trend.change ?? 0) >= 5) return "IMPROVING";
  if (level === null) return "INSUFFICIENT_EVIDENCE";
  if (level >= 75) return "STRENGTH";
  if (level <= 60) return "WEAKNESS";
  return "DEVELOPING";
}

function trendSentence(change: number | null, direction: Trend["direction"], sampleSize: number) {
  if (change === null || direction === null) return "Not enough history to measure a trend.";
  if (direction === "flat") return "Steady over time.";
  const sign = change > 0 ? "+" : "";
  if (sampleSize >= 4) return `The recent half averaged ${sign}${change} pts vs the earlier half.`;
  return `Latest is ${sign}${change} pts vs the first observation.`;
}

function explanationFor(
  skillKey: SkillKey,
  count: number,
  level: number | null,
  latestScore: number | null,
  trend: Trend,
  latestFeedback: string | undefined,
) {
  const label = SKILL_LABELS[skillKey];
  if (count < 2)
    return `${label} needs more evidence to assess — ${count} scored observation${count === 1 ? "" : "s"} so far.`;
  const feedback = latestFeedback ? ` Recent feedback: "${clip(latestFeedback)}"` : "";
  return `Average ${level}/100 across ${count} scored interview${count === 1 ? "" : "s"}. Latest: ${latestScore}/100. ${trendSentence(trend.change, trend.direction, count)}${feedback}`;
}

function recommendedPracticeFor(skillKey: SkillKey, status: SkillStatus) {
  const label = SKILL_LABELS[skillKey].toLowerCase();
  switch (status) {
    case "WEAKNESS":
      return `Practice ${label} in a focused interview, then review the report for specific gaps.`;
    case "IMPROVING":
      return `You're improving in ${label} — keep practicing so the gain becomes durable.`;
    case "STRENGTH":
      return `Keep ${label} sharp with occasional practice; it's a consistent strength.`;
    case "DEVELOPING":
      return `Give ${label} targeted practice to move it into strength territory.`;
    case "INSUFFICIENT_EVIDENCE":
      return `Complete more interviews that exercise ${label} to build evidence.`;
  }
}

function clip(text: string) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 160 ? `${singleLine.slice(0, 157)}…` : singleLine;
}
