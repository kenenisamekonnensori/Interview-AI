import type {
  ReadinessAssessment,
  ReadinessComponent,
  ReadinessGap,
  SkillAssessment,
  SkillKey,
} from "@interviewer-ai/types";

import {
  interviewEvaluationSchema,
  readinessFormulaVersion,
  type InterviewType,
} from "@interviewer-ai/types";
import { normalizeCategoryKey, SKILL_LABELS } from "./skill-taxonomy.js";

/**
 * Deterministic readiness formula v1 — fully documented so scores are
 * explainable and reproducible.
 *
 * Inputs (all from persisted, schema-valid interview evaluations — the resume
 * is never a source of readiness):
 *
 * 1. Evidence saturation — how much scored history exists.
 *    evidence(n) = 100 * n / (n + 2)   [n = interviews with valid reports]
 *    2 interviews -> 50, 8 -> 80, 18 -> 90. Saturating by design: beyond that
 *    the score should be driven by performance, not by volume.
 *
 * 2. Category scores — each is the average of persisted evaluation dimensions
 *    (0-100) from the same schema-valid reports. Categories without evidence
 *    are null and excluded; weights are renormalized over present evidence:
 *      TECHNICAL       20%  — evaluation.technical
 *      COMMUNICATION   15%  — evaluation.communication
 *      BEHAVIORAL      15%  — behavioral observations (BEHAVIORAL/HR interviews
 *                           plus normalized behavioral categories)
 *      PROBLEM_SOLVING 10%  — evaluation.problemSolving
 *      JOB_SPECIFIC    20%  — job-required skills matched against the skill
 *                           profile taxonomy (fixed dimensions + normalized
 *                           free-form categories)
 *
 * 3. Overall = 0.2 x evidence(n) + 0.8 x weightedCategoryMean
 *
 * Bumping `readinessFormulaVersion` (packages/types) invalidates comparison
 * across old snapshots; snapshots store the version used to compute them.
 */
export const READINESS_WEIGHTS: Record<ReadinessComponent["category"], number> = {
  TECHNICAL: 0.2,
  COMMUNICATION: 0.15,
  BEHAVIORAL: 0.15,
  PROBLEM_SOLVING: 0.1,
  JOB_SPECIFIC: 0.2,
};

export const EVIDENCE_WEIGHT = 0.2;

/** Minimum interviews with valid reports before a score may be produced. */
export const MIN_INTERVIEWS_FOR_SCORE = 2;

/** Minimal shape of a completed interview row the engine consumes. */
export type ReadinessReportRow = {
  id: string;
  interviewType: string;
  report: { evaluation: unknown } | null;
  completedAt: Date | null;
};

export type ReadinessTarget = {
  id: string;
  title: string;
  company: string | null;
  /** Required-skill strings from the persisted job analysis, when present. */
  requiredSkills: string[];
};

export type ReadinessSnapshotRow = {
  id: string;
  overall: number;
  recordedAt: Date;
  interviewCount: number;
};

/** Rows with a completed timestamp and a schema-valid evaluation. */
export function validReadinessRows(rows: ReadinessReportRow[]): ReadinessReportRow[] {
  return rows.filter(
    (row) =>
      row.completedAt !== null &&
      interviewEvaluationSchema.safeParse(row.report?.evaluation).success,
  );
}

/**
 * Maps a job-analysis required-skill string onto the controlled skill taxonomy
 * via the same normalization used for evaluation categories; plus a fallback
 * substring match (e.g. "PostgreSQL (advanced)" -> "databases"). Anything that
 * cannot be mapped is returned as an unmapped keyword — never fabricated into
 * a skill.
 */
export function mapRequiredSkills(requiredSkills: string[]): {
  mapped: Set<SkillKey>;
  unmapped: string[];
} {
  const mapped = new Set<SkillKey>();
  const unmapped: string[] = [];
  for (const raw of requiredSkills) {
    const normalized = normalizeCategoryKey(raw);
    if (normalized) {
      mapped.add(normalized);
      continue;
    }
    const label = raw.trim().toLowerCase();
    const substring = SKILL_LABEL_SUBSTRINGS.find(([needle]) => label.includes(needle));
    if (substring) {
      mapped.add(substring[1]);
      continue;
    }
    if (label.length > 0 && label.length <= 60) unmapped.push(raw.trim());
  }
  return { mapped, unmapped: unmapped.slice(0, 10) };
}

const SKILL_LABEL_SUBSTRINGS: [string, SkillKey][] = [
  ["system design", "system-design"],
  ["distributed", "system-design"],
  ["scalab", "system-design"],
  ["architecture", "system-design"],
  ["sql", "databases"],
  ["postgres", "databases"],
  ["mysql", "databases"],
  ["database", "databases"],
  ["data structure", "data-structures"],
  ["algorithm", "algorithms"],
  ["communication", "communication"],
  ["behavioral", "behavioral"],
  ["leadership", "leadership"],
  ["coding", "coding"],
  ["programming", "coding"],
];

/** One observation per scored dimension, traceable to its interview. */
export type ReadinessObservation = {
  dimension: string;
  /** Canonical taxonomy key when the dimension maps onto one, else null. */
  skillKey: SkillKey | null;
  score: number;
  interviewId: string;
  interviewType: InterviewType;
};

export function computeReadinessObservations(rows: ReadinessReportRow[]): ReadinessObservation[] {
  const observations: ReadinessObservation[] = [];
  for (const row of validReadinessRows(rows)) {
    const evaluation = interviewEvaluationSchema.parse(row.report?.evaluation);
    const type = row.interviewType as InterviewType;
    for (const dimension of ["technical", "communication", "problemSolving", "confidence"] as const)
      observations.push({
        dimension,
        skillKey: dimension === "problemSolving" ? "problem-solving" : dimension,
        score: evaluation[dimension].score,
        interviewId: row.id,
        interviewType: type,
      });
    for (const [category, value] of Object.entries(evaluation.categoryScores)) {
      observations.push({
        dimension: category,
        skillKey: normalizeCategoryKey(category),
        score: value.score,
        interviewId: row.id,
        interviewType: type,
      });
    }
  }
  return observations;
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

const COMPONENT_LABELS: Record<ReadinessComponent["category"], string> = {
  TECHNICAL: "Technical",
  COMMUNICATION: "Communication",
  BEHAVIORAL: "Behavioral",
  PROBLEM_SOLVING: "Problem Solving",
  JOB_SPECIFIC: "Job-specific skills",
};

/**
 * Category scores from observations. Behavioral pools behavioral-type
 * observations (BEHAVIORAL/HR interviews and normalized behavioral categories)
 * with the fixed behavioral signal mapped from technical/communication means —
 * see the formula doc above for why.
 */
export function computeComponents(
  observations: ReadinessObservation[],
  requiredSkills: Set<SkillKey>,
): ReadinessComponent[] {
  const scoreOf = (values: number[]) => (values.length ? Math.round(average(values)) : null);

  const bySkill = new Map<string, number[]>();
  for (const observation of observations) {
    if (!observation.skillKey) continue;
    const list = bySkill.get(observation.skillKey) ?? [];
    list.push(observation.score);
    bySkill.set(observation.skillKey, list);
  }

  const technical = bySkill.get("technical") ?? [];
  const communication = bySkill.get("communication") ?? [];
  const problemSolving = bySkill.get("problem-solving") ?? [];

  const behavioralDirect = observations
    .filter(
      (observation) =>
        observation.interviewType === "BEHAVIORAL" ||
        observation.interviewType === "HR" ||
        (observation.skillKey === "behavioral" && observation.dimension !== "confidence"),
    )
    .map((observation) => observation.score);
  // Dedicated behavioral evidence once it exists; before that the fixed
  // technical/communication dimensions stand in (documented in the formula).
  const behavioral =
    behavioralDirect.length >= 2 ? behavioralDirect : [...technical, ...communication];

  // Job-specific evidence: only observations for skills this target requires.
  // Without a target (or mapped requirements) the category has no evidence and
  // is excluded; weights renormalize over the rest.
  const jobSpecific = requiredSkills.size
    ? observations
        .filter(
          (observation): observation is ReadinessObservation & { skillKey: SkillKey } =>
            observation.skillKey !== null && requiredSkills.has(observation.skillKey),
        )
        .map((observation) => observation.score)
    : [];

  const build = (
    category: ReadinessComponent["category"],
    values: number[],
  ): ReadinessComponent => ({
    category,
    label: COMPONENT_LABELS[category],
    score: scoreOf(values),
    weight: READINESS_WEIGHTS[category],
    evidenceCount: values.length,
  });

  return [
    build("TECHNICAL", technical),
    build("COMMUNICATION", communication),
    build("BEHAVIORAL", behavioral),
    build("PROBLEM_SOLVING", problemSolving),
    build("JOB_SPECIFIC", jobSpecific),
  ];
}

export function evidenceScore(validReportCount: number): number {
  return Math.round((100 * validReportCount) / (validReportCount + 2));
}

/**
 * The full deterministic assessment. Pure: same inputs always produce the same
 * output, so the score is stable across page loads and reproducible in tests.
 */
export function computeReadiness(input: {
  reports: ReadinessReportRow[];
  skills: SkillAssessment[];
  target: ReadinessTarget | null;
  snapshots: ReadinessSnapshotRow[];
  now: Date;
}): ReadinessAssessment {
  const { reports, skills, target, snapshots, now } = input;
  const validRows = validReadinessRows(reports);
  const observations = computeReadinessObservations(validRows);
  const { mapped: requiredSkills, unmapped } = target
    ? mapRequiredSkills(target.requiredSkills)
    : { mapped: new Set<SkillKey>(), unmapped: [] as string[] };
  const components = computeComponents(observations, requiredSkills);
  const lastCompletedAt =
    validRows
      .map((row) => row.completedAt!)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  const canScore = validRows.length >= MIN_INTERVIEWS_FOR_SCORE;
  const evidenceWeighted = evidenceScore(validRows.length);

  const scored = components.filter((component) => component.score !== null);
  const categoryWeightSum = scored.reduce((total, component) => total + component.weight, 0);
  const categoryMean = categoryWeightSum
    ? scored.reduce((total, component) => total + component.weight * component.score!, 0) /
      categoryWeightSum
    : null;

  const overall = canScore
    ? Math.round(EVIDENCE_WEIGHT * evidenceWeighted + (1 - EVIDENCE_WEIGHT) * categoryMean!)
    : null;

  const previous = snapshots[0] ?? null;
  const change = overall !== null && previous ? overall - previous.overall : null;

  const gaps = buildGaps(components, skills, requiredSkills, unmapped, canScore);
  const explanation = buildExplanation(target, overall, components, gaps, validRows.length, change);

  return {
    formulaVersion: readinessFormulaVersion,
    careerTarget: target ? { id: target.id, title: target.title, company: target.company } : null,
    overall,
    previousOverall: previous?.overall ?? null,
    change,
    components,
    strengths: buildStrengths(components, skills, requiredSkills),
    gaps,
    explanation,
    dataAsOf: lastCompletedAt ? lastCompletedAt.toISOString() : null,
    evidence: {
      interviewCount: validRows.length,
      validReportCount: validRows.length,
      minInterviewsRequired: MIN_INTERVIEWS_FOR_SCORE,
    },
    snapshots: snapshots.slice(0, 30).map((snapshot) => ({
      id: snapshot.id,
      overall: snapshot.overall,
      recordedAt: snapshot.recordedAt.toISOString(),
      interviewCount: snapshot.interviewCount,
    })),
    generatedAt: now.toISOString(),
  };
}

/** Ordered weak spots: weak/improving required skills first, then low categories. */
function buildGaps(
  components: ReadinessComponent[],
  skills: SkillAssessment[],
  requiredSkills: Set<SkillKey>,
  unmapped: string[],
  canScore: boolean,
): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (!canScore) return gaps;

  const bySkill = new Map(skills.map((assessment) => [assessment.skillKey, assessment]));
  const required = [...requiredSkills];
  for (const skillKey of required) {
    const assessment = bySkill.get(skillKey);
    if (!assessment) {
      gaps.push({
        skillKey,
        label: SKILL_LABELS[skillKey] ?? skillKey,
        kind: "MISSING_EVIDENCE",
        detail: `Required by this job, but no scored evidence yet.`,
      });
      continue;
    }
    if (assessment.status === "WEAKNESS" || assessment.status === "IMPROVING") {
      gaps.push({
        skillKey,
        label: assessment.label,
        kind: "WEAK_SKILL",
        detail: `Average ${assessment.level}/100 across ${assessment.observationCount} observation${assessment.observationCount === 1 ? "" : "s"} — below the role's bar.`,
      });
    }
  }
  for (const keyword of unmapped) {
    gaps.push({
      skillKey: null,
      label: keyword,
      kind: "MISSING_EVIDENCE",
      detail: "Required by this job, but it is not part of the scored skill taxonomy yet.",
    });
  }
  const lowCategories = components
    .filter((component) => component.score !== null && component.score < 65)
    .sort((left, right) => left.score! - right.score!);
  for (const component of lowCategories.slice(0, 3)) {
    gaps.push({
      skillKey: null,
      label: component.label,
      kind: "WEAK_SKILL",
      detail: `Category average ${component.score}/100 across ${component.evidenceCount} scored observation${component.evidenceCount === 1 ? "" : "s"}.`,
    });
  }
  return gaps.slice(0, 8);
}

function buildStrengths(
  components: ReadinessComponent[],
  skills: SkillAssessment[],
  requiredSkills: Set<SkillKey>,
): string[] {
  const strengths: string[] = [];
  const strongSkills = skills
    .filter(
      (assessment) =>
        assessment.status === "STRENGTH" &&
        (requiredSkills.size === 0 || requiredSkills.has(assessment.skillKey)),
    )
    .slice(0, 2);
  for (const assessment of strongSkills)
    strengths.push(
      `${assessment.label} averages ${assessment.level}/100 across ${assessment.observationCount} interview${assessment.observationCount === 1 ? "" : "s"}.`,
    );
  const strongCategories = components
    .filter((component) => component.score !== null && component.score >= 75)
    .sort((left, right) => right.score! - left.score!)
    .slice(0, 3 - strengths.length);
  for (const component of strongCategories)
    strengths.push(`${component.label} is strong at ${component.score}/100.`);
  return strengths.slice(0, 3);
}

function buildExplanation(
  target: ReadinessTarget | null,
  overall: number | null,
  components: ReadinessComponent[],
  gaps: ReadinessGap[],
  validCount: number,
  change: number | null,
): string | null {
  const role = target
    ? `for ${target.title}${target.company ? ` at ${target.company}` : ""}`
    : "without a specific target job";
  if (!canScore(validCount))
    return `Readiness ${role} needs more evidence: ${validCount} interview${validCount === 1 ? "" : "s"} with a scored report so far — ${MIN_INTERVIEWS_FOR_SCORE} are required before a score can be computed.`;
  if (overall === null) return null;

  const scored = components.filter((component) => component.score !== null);
  const strongest = [...scored].sort((left, right) => right.score! - left.score!)[0];
  const weakest = [...scored].sort((left, right) => left.score! - right.score!)[0];
  const missing = components.filter((component) => component.score === null);
  const parts: string[] = [];
  parts.push(`Readiness ${role} is ${overall}/100 (formula v${readinessFormulaVersion}).`);
  if (strongest)
    parts.push(`Your strongest signal is ${strongest.label} at ${strongest.score}/100.`);
  if (weakest && weakest !== strongest && weakest.score! < 70)
    parts.push(
      `It is currently limited by ${weakest.label.toLowerCase()} at ${weakest.score}/100.`,
    );
  if (missing.length)
    parts.push(
      `No scored evidence yet for: ${missing.map((component) => component.label.toLowerCase()).join(", ")}.`,
    );
  const topGap = gaps[0];
  if (topGap) parts.push(`Top gap: ${topGap.label} — ${topGap.detail.toLowerCase()}`);
  if (change !== null && change !== 0)
    parts.push(
      `That is ${change > 0 ? "up" : "down"} ${Math.abs(change)} points since the last snapshot.`,
    );
  return parts.join(" ");
}

function canScore(validCount: number) {
  return validCount >= MIN_INTERVIEWS_FOR_SCORE;
}
