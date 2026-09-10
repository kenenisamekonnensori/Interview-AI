import type {
  InterviewDifficulty,
  InterviewType,
  NextPracticeRecommendation,
  ReadinessAssessment,
  RecommendationActionType,
  SkillAssessment,
} from "@interviewer-ai/types";

import { mapRequiredSkills } from "./readiness-engine.js";

/**
 * Deterministic next-step recommendation. Everything is computed from
 * persisted data — the AI provider is never called. Candidates are scored and
 * the winner is picked with a fixed tie-break order, so the same data always
 * yields the same recommendation (no churn between page loads, no repetition
 * that ignores evidence).
 *
 * Priority model (documented for explainability):
 * - severity: WEAKNESS 40, IMPROVING 28, DEVELOPING 18, INSUFFICIENT 8 —
 *   scaled ×0.6 below 5 observations (low-confidence evidence)
 * - job relevance: skill is required by the target's job description → +20
 * - plan agreement: a pending plan item matching the skill → +15 (HIGH) / +8
 *   (MEDIUM); continuing a pending plan as the primary action scores 30+
 * - readiness pressure: readiness below 70 → up to +10
 * - improving trend ×0.9 (momentum matters slightly less than active gaps)
 */
/** Lightweight plan summary the engine needs — read-only, never rebuilds the plan. */
export type RecommendationPlan = {
  pendingCount: number;
  nextActivity: {
    id: string;
    activityType: string;
    title: string;
    priority: string;
    rationale: string;
  } | null;
  items: Array<{
    id: string;
    activityType: string;
    title: string;
    priority: string;
    status: string;
  }>;
} | null;

export type RecommendationContext = {
  profileTargetRole: string | null;
  defaultDifficulty: InterviewDifficulty;
  defaultDurationMinutes: number;
  skills: SkillAssessment[];
  readiness: ReadinessAssessment | null;
  plan: RecommendationPlan;
  target: {
    id: string;
    title: string;
    company: string | null;
    /** Required-skill strings from the persisted job analysis. */
    requiredSkills: string[];
  } | null;
  hasActiveResume: boolean;
  latestReport: { interviewId: string; interviewType: string; summary: string | null } | null;
};

type Candidate = {
  actionType: RecommendationActionType;
  priority: number;
  interviewType: InterviewType;
  gapStatement: string;
  actionLabel: string;
  action: NextPracticeRecommendation["action"];
  reason: string;
  focusAreas: string[];
};

const SEVERITY: Record<SkillAssessment["status"], number> = {
  WEAKNESS: 40,
  IMPROVING: 28,
  DEVELOPING: 18,
  INSUFFICIENT_EVIDENCE: 8,
  STRENGTH: 0,
};

const TIE_BREAK: Record<RecommendationActionType, number> = {
  PRACTICE_WEAK_SKILL: 0,
  CONTINUE_PRACTICE_PLAN: 1,
  PREPARE_TARGET_JOB: 2,
  PRACTICE_BEHAVIORAL: 3,
  START_MOCK_INTERVIEW: 4,
  REVIEW_PREVIOUS_INTERVIEW: 5,
  UPDATE_RESUME: 6,
};

function interviewTypeForSkill(skillKey: string): InterviewType {
  switch (skillKey) {
    case "behavioral":
    case "leadership":
      return "BEHAVIORAL";
    case "system-design":
      return "SYSTEM_DESIGN";
    default:
      return "TECHNICAL";
  }
}

function interviewTypeForPlanActivity(activityType: string): InterviewType {
  switch (activityType) {
    case "SYSTEM_DESIGN_EXERCISE":
      return "SYSTEM_DESIGN";
    case "QUESTION_SET":
      return "BEHAVIORAL";
    case "TECHNICAL_TOPIC":
    case "CODING_EXERCISE":
      return "TECHNICAL";
    default:
      return "MIXED";
  }
}

function typePhrase(type: InterviewType): string {
  return type === "MIXED" ? "focused" : type.replaceAll("_", " ").toLowerCase();
}

function clip(text: string, max = 120): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > max ? `${singleLine.slice(0, max - 1)}…` : singleLine;
}

export function recommendNextAction(context: RecommendationContext): NextPracticeRecommendation {
  const { skills, readiness, plan, target, latestReport } = context;
  const suggestedTargetRole =
    target?.title ?? context.profileTargetRole ?? "General interview practice";

  const required = target ? mapRequiredSkills(target.requiredSkills).mapped : new Set();
  const pendingPlanItems = plan?.pendingCount ?? 0;
  const readinessPressure =
    readiness?.overall != null && readiness.overall < 70
      ? Math.round((70 - readiness.overall) / 3)
      : 0;

  const candidates: Candidate[] = [];

  for (const skill of skills) {
    if (skill.observationCount === 0) continue;
    // Under-evidenced behavioral skill gets its own dedicated candidate below.
    if (skill.skillKey === "behavioral" && skill.observationCount < 2) continue;
    const confidenceFactor = skill.observationCount >= 5 ? 1 : 0.6;
    const isRequired = required.has(skill.skillKey);
    const planItem = plan?.items.find(
      (item) =>
        item.status === "PENDING" &&
        (item.title.toLowerCase().includes(skill.label.toLowerCase()) ||
          item.title.toLowerCase().includes(skill.skillKey.replaceAll("-", " "))),
    );
    const priority = Math.round(
      (SEVERITY[skill.status] * confidenceFactor +
        (isRequired ? 20 : 0) +
        (planItem ? (planItem.priority === "HIGH" ? 15 : 8) : 0) +
        (pendingPlanItems > 0 ? 5 : 0) +
        readinessPressure) *
        (skill.trend.direction === "up" ? 0.9 : 1),
    );
    const trendNote =
      skill.trend.direction === "up" && (skill.trend.change ?? 0) > 0
        ? " You are improving — keep the momentum."
        : skill.trend.direction === "down"
          ? " Recent scores are trending down."
          : "";
    const type = interviewTypeForSkill(skill.skillKey);
    candidates.push({
      actionType: "PRACTICE_WEAK_SKILL",
      priority,
      interviewType: type,
      gapStatement: `Your biggest current gap is ${skill.label}.`,
      actionLabel: `Complete a ${typePhrase(type)} interview focused on ${skill.label.toLowerCase()}.`,
      action: {
        href: `/interviews/new?type=${type}`,
        interviewType: type,
        ...(planItem ? { planItemId: planItem.id } : {}),
      },
      reason: `${skill.label} averages ${skill.level}/100 across ${skill.observationCount} observation${skill.observationCount === 1 ? "" : "s"}${isRequired ? " and is required for this job" : ""}.${trendNote}`,
      focusAreas: [skill.label],
    });
  }

  const behavioral = skills.find((skill) => skill.skillKey === "behavioral");
  // Bootstrap behavioral practice only once real history exists — before that,
  // first-interview setup actions are the sensible recommendation.
  if (latestReport && (!behavioral || behavioral.observationCount < 2)) {
    candidates.push({
      actionType: "PRACTICE_BEHAVIORAL",
      priority: 26 + readinessPressure,
      interviewType: "BEHAVIORAL",
      gapStatement: "You have little or no behavioral interview evidence yet.",
      actionLabel: "Complete a behavioral interview practice session.",
      action: { href: "/interviews/new?type=BEHAVIORAL", interviewType: "BEHAVIORAL" },
      reason: `Behavioral interviewing has ${behavioral?.observationCount ?? 0} scored observation${(behavioral?.observationCount ?? 0) === 1 ? "" : "s"} — interviewers weight it heavily.`,
      focusAreas: ["Behavioral Interviewing"],
    });
  }

  if (latestReport) {
    candidates.push({
      actionType: "REVIEW_PREVIOUS_INTERVIEW",
      priority: 22,
      interviewType: latestReport.interviewType as InterviewType,
      gapStatement: "Your latest interview left clear feedback worth consolidating.",
      actionLabel: "Review the feedback from your last interview.",
      action: { href: `/interviews/${latestReport.interviewId}/report` },
      reason: `Converting feedback into improvement is cheap — your latest report: “${clip(latestReport.summary ?? "completed")}”.`,
      focusAreas: [],
    });
  }

  const nextPlanItem = plan?.nextActivity ?? null;
  if (nextPlanItem && pendingPlanItems > 0) {
    const type = interviewTypeForPlanActivity(nextPlanItem.activityType);
    candidates.push({
      actionType: "CONTINUE_PRACTICE_PLAN",
      priority:
        30 + (nextPlanItem.priority === "HIGH" ? 12 : nextPlanItem.priority === "MEDIUM" ? 6 : 0),
      interviewType: type,
      gapStatement: `Your practice plan still has ${pendingPlanItems} prioritized activit${pendingPlanItems === 1 ? "y" : "ies"}.`,
      actionLabel: nextPlanItem.title,
      action: {
        href: `/interviews/new?type=${type}`,
        interviewType: type,
        planItemId: nextPlanItem.id,
      },
      reason: nextPlanItem.rationale,
      focusAreas: [],
    });
  }

  // Setup recommendations only apply before any scored history exists.
  if (!latestReport) {
    if (target) {
      candidates.push({
        actionType: "PREPARE_TARGET_JOB",
        priority: 34,
        interviewType: "MIXED",
        gapStatement: `You are preparing for ${target.title}${target.company ? ` at ${target.company}` : ""} without scored evidence yet.`,
        actionLabel: `Run a first mock interview for ${target.title}.`,
        action: { href: "/interviews/new?type=MIXED", interviewType: "MIXED" },
        reason: "A first scored interview grounds every later recommendation in real evidence.",
        focusAreas: [],
      });
    }
    if (!context.hasActiveResume) {
      candidates.push({
        actionType: "UPDATE_RESUME",
        priority: 24,
        interviewType: "MIXED",
        gapStatement: "No active resume is on file, which limits how tailored practice can be.",
        actionLabel: "Upload or activate a resume so practice matches your background.",
        action: { href: "/resumes" },
        reason: "Practice interviews use your resume to ask relevant, experience-based questions.",
        focusAreas: [],
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.priority - left.priority || TIE_BREAK[left.actionType] - TIE_BREAK[right.actionType],
  );
  const winner: Candidate = candidates[0] ?? {
    actionType: "START_MOCK_INTERVIEW",
    priority: 10,
    interviewType: "MIXED",
    gapStatement: "Start building your interview evidence base.",
    actionLabel: "Start a mixed mock interview.",
    action: { href: "/interviews/new?type=MIXED", interviewType: "MIXED" },
    reason: "Every completed interview makes recommendations more precise.",
    focusAreas: [],
  };

  const reasons = [winner.reason];
  if (readiness?.overall != null)
    reasons.push(
      `Current readiness is ${readiness.overall}%${readiness.careerTarget ? ` for ${readiness.careerTarget.title}` : ""}.`,
    );
  if (plan?.nextActivity && winner.actionType !== "CONTINUE_PRACTICE_PLAN")
    reasons.push(`Your practice plan's next item is “${plan.nextActivity.title}”.`);

  return {
    suggestedTargetRole,
    interviewType: winner.interviewType,
    difficulty: context.defaultDifficulty,
    suggestedDurationMinutes: context.defaultDurationMinutes,
    ...(target ? { careerTargetId: target.id } : {}),
    reasons: reasons.slice(0, 3),
    focusAreas: winner.focusAreas.slice(0, 3),
    basis: latestReport ? "HISTORY" : "PROFILE",
    actionType: winner.actionType,
    gapStatement: winner.gapStatement,
    actionLabel: winner.actionLabel,
    action: winner.action,
    priority: winner.priority,
  };
}
