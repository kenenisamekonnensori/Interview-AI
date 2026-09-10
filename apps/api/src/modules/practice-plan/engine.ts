import type { PracticeActivityType, SkillAssessment, SkillKey } from "@interviewer-ai/types";

import { SKILL_LABELS } from "../analytics/skill-taxonomy.js";

export type PlanDraftItem = {
  phase: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  activityType: PracticeActivityType;
  title: string;
  description: string | null;
  rationale: string;
  estimatedMinutes: number;
  /** Stable key used to carry completed status across regenerations. */
  dedupeKey: string;
};

export type PlanContext = {
  skills: SkillAssessment[];
  target: {
    id: string;
    title: string;
    company: string | null;
    requiredSkills: string[];
  } | null;
  profileTargetRole: string | null;
};

export const PLAN_PHASES = {
  gaps: "1 · Close your biggest gaps",
  momentum: "2 · Keep the momentum",
  simulate: "3 · Simulate the real thing",
  completed: "Completed",
} as const;

const weaknessActivities: Record<
  SkillKey,
  { activityType: PracticeActivityType; title: string; description: string | null }
> = {
  "system-design": {
    activityType: "SYSTEM_DESIGN_EXERCISE",
    title: "System design trade-offs",
    description: "A focused system design mock: requirements, scale, availability, and trade-offs.",
  },
  behavioral: {
    activityType: "QUESTION_SET",
    title: "Behavioral STAR question set",
    description: "Structured behavioral questions answered with Situation, Task, Action, Result.",
  },
  communication: {
    activityType: "COMMUNICATION_EXERCISE",
    title: "Communication drill",
    description: "Practice structuring answers: claim, evidence, impact.",
  },
  technical: {
    activityType: "TECHNICAL_TOPIC",
    title: "Technical fundamentals review",
    description: "A technical interview focused on the core concepts for your target role.",
  },
  algorithms: {
    activityType: "CODING_EXERCISE",
    title: "Algorithm practice",
    description: "Solve and explain algorithm problems under interview conditions.",
  },
  "data-structures": {
    activityType: "CODING_EXERCISE",
    title: "Data structure drills",
    description: "Practice arrays, hash maps, trees, and graphs with live explanation.",
  },
  databases: {
    activityType: "TECHNICAL_TOPIC",
    title: "Database design practice",
    description: "A technical interview on schema design, indexing, and query reasoning.",
  },
  confidence: {
    activityType: "MOCK_INTERVIEW",
    title: "Confidence-building mock",
    description: "A relaxed mock interview to practice delivering answers with poise.",
  },
  leadership: {
    activityType: "QUESTION_SET",
    title: "Leadership scenario questions",
    description: "Behavioral questions on ownership, influence, and team leadership.",
  },
  coding: {
    activityType: "CODING_EXERCISE",
    title: "Coding exercise",
    description: "A coding interview focused on writing clean, working solutions.",
  },
  "problem-solving": {
    activityType: "MOCK_INTERVIEW",
    title: "Problem-solving mock",
    description: "A mock interview centered on breaking down unfamiliar problems.",
  },
};

const improvingActivities: Record<SkillKey, PracticeActivityType> = {
  "system-design": "SYSTEM_DESIGN_EXERCISE",
  behavioral: "QUESTION_SET",
  communication: "COMMUNICATION_EXERCISE",
  technical: "TECHNICAL_TOPIC",
  algorithms: "CODING_EXERCISE",
  "data-structures": "CODING_EXERCISE",
  databases: "TECHNICAL_TOPIC",
  confidence: "MOCK_INTERVIEW",
  leadership: "QUESTION_SET",
  coding: "CODING_EXERCISE",
  "problem-solving": "MOCK_INTERVIEW",
};

export function planGoal(context: PlanContext) {
  if (context.target)
    return `Prepare for ${context.target.title}${
      context.target.company ? ` at ${context.target.company}` : ""
    } interview`;
  if (context.profileTargetRole) return `Prepare for ${context.profileTargetRole} interviews`;
  return "Prepare for your next interview";
}

export function planTargetRole(context: PlanContext) {
  return context.target?.title ?? context.profileTargetRole ?? null;
}

/**
 * Builds a prioritized practice plan from real user data only: recurring
 * weaknesses first, then target-job requirements, then improving skills, then
 * a baseline full mock. Every recommendation carries a rationale citing the
 * underlying evidence. Deterministic — same data yields the same plan.
 */
export function buildPlanItems(context: PlanContext): PlanDraftItem[] {
  const items: PlanDraftItem[] = [];

  for (const skill of context.skills) {
    if (skill.status !== "WEAKNESS") continue;
    const activity = weaknessActivities[skill.skillKey];
    items.push({
      phase: PLAN_PHASES.gaps,
      priority: "HIGH",
      activityType: activity.activityType,
      title: activity.title,
      description: activity.description,
      rationale: `Average ${skill.level}/100 across ${skill.observationCount} scored interviews — your lowest area.`,
      estimatedMinutes: 30,
      dedupeKey: dedupeKey(activity.activityType, activity.title),
    });
  }

  for (const requiredSkill of context.target?.requiredSkills.slice(0, 3) ?? []) {
    const title = `${requiredSkill} for ${context.target!.title}`;
    if (
      items.some(
        (item) =>
          normalizeTitle(item.title) === normalizeTitle(title) ||
          normalizeTitle(item.title).includes(normalizeTitle(requiredSkill)) ||
          normalizeTitle(requiredSkill).includes(normalizeTitle(item.title)),
      )
    )
      continue;
    items.push({
      phase: PLAN_PHASES.gaps,
      priority: "HIGH",
      activityType: "TECHNICAL_TOPIC",
      title,
      description: `A technical interview exercising ${requiredSkill}, as required by the saved job description.`,
      rationale: `Required for ${context.target!.title}${
        context.target!.company ? ` at ${context.target!.company}` : ""
      } — from your saved job description.`,
      estimatedMinutes: 25,
      dedupeKey: dedupeKey("TECHNICAL_TOPIC", title),
    });
  }

  for (const skill of context.skills) {
    if (skill.status !== "IMPROVING") continue;
    const title = `Continue ${SKILL_LABELS[skill.skillKey].toLowerCase()} practice`;
    items.push({
      phase: PLAN_PHASES.momentum,
      priority: "MEDIUM",
      activityType: improvingActivities[skill.skillKey],
      title,
      description: null,
      rationale: `Trending up ${(skill.trend.change ?? 0) > 0 ? "+" : ""}${skill.trend.change ?? 0} pts — keep practicing so the gain becomes durable.`,
      estimatedMinutes: 20,
      dedupeKey: dedupeKey(improvingActivities[skill.skillKey], title),
    });
  }

  items.push({
    phase: PLAN_PHASES.simulate,
    priority: "MEDIUM",
    activityType: "MOCK_INTERVIEW",
    title: "Full mock interview",
    description: "A complete simulation under realistic conditions.",
    rationale: "A full simulation builds your performance history and calibrates your readiness.",
    estimatedMinutes: 45,
    dedupeKey: dedupeKey("MOCK_INTERVIEW", "Full mock interview"),
  });

  return items;
}

function dedupeKey(activityType: PracticeActivityType, title: string) {
  return `${activityType}:${normalizeTitle(title)}`;
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
