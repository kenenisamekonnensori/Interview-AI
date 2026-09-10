import type {
  PracticeItemStatus,
  PracticePlanDto,
  PracticePlanItemDto,
} from "@interviewer-ai/types";

import { computeSkillProfile, validSkillReportRows } from "../analytics/skill-engine.js";
import {
  buildPlanItems,
  planGoal,
  planTargetRole,
  PLAN_PHASES,
  type PlanContext,
  type PlanDraftItem,
} from "./engine.js";
import { PracticePlanRepository } from "./repository.js";
import type { PrismaClient } from "../../../prisma/generated/client.js";

export class PracticePlanError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PracticePlanError";
  }
}

type PreviousItem = {
  dedupeKey: string;
  phase: string;
  priority: string;
  activityType: string;
  title: string;
  description: string | null;
  rationale: string;
  estimatedMinutes: number;
  status: string;
  completedAt: Date | null;
};

export class PracticePlanService {
  readonly repository: PracticePlanRepository;

  constructor(database: PrismaClient) {
    this.repository = new PracticePlanRepository(database);
  }

  /**
   * Serves the user's plan, rebuilding it deterministically only when it is
   * missing, failed, or based on older data (new interviews, changed target).
   * The same data always yields the same plan, so page refreshes are stable and
   * completed items are carried over rather than silently lost.
   */
  async getPlan(userId: string): Promise<PracticePlanDto> {
    const [targetRow, profile, rows, existing] = await this.repository.context(userId);
    const valid = validSkillReportRows(rows);
    const skills = computeSkillProfile(valid);
    const currentInterviewIds = valid.map((row) => row.id);
    const target = targetRow
      ? {
          id: targetRow.id,
          title: targetRow.title,
          company: targetRow.company,
          requiredSkills: requiredSkillsOf(targetRow),
        }
      : null;
    const context: PlanContext = {
      skills,
      target,
      profileTargetRole: profile?.targetRole ?? null,
    };
    const currentTargetId = target?.id ?? null;
    const stale =
      !existing ||
      existing.status !== "READY" ||
      existing.careerTargetId !== currentTargetId ||
      !sameIds(existing.basedOnInterviewIds, currentInterviewIds);
    if (!stale) return toDto(existing);
    return this.rebuild(
      userId,
      context,
      valid.map((row) => row.id),
      previousItems(existing?.items ?? []),
      (existing?.version ?? 0) + 1,
    );
  }

  /** Forces a rebuild on demand; completed items are preserved by stable key. */
  async regenerate(userId: string): Promise<PracticePlanDto> {
    const [targetRow, profile, rows, existing] = await this.repository.context(userId);
    const valid = validSkillReportRows(rows);
    const skills = computeSkillProfile(valid);
    const target = targetRow
      ? {
          id: targetRow.id,
          title: targetRow.title,
          company: targetRow.company,
          requiredSkills: requiredSkillsOf(targetRow),
        }
      : null;
    const context: PlanContext = {
      skills,
      target,
      profileTargetRole: profile?.targetRole ?? null,
    };
    return this.rebuild(
      userId,
      context,
      valid.map((row) => row.id),
      previousItems(existing?.items ?? []),
      (existing?.version ?? 0) + 1,
    );
  }

  /** Marks an owned plan item complete (or reopens it). */
  async updateItem(
    userId: string,
    itemId: string,
    status: PracticeItemStatus,
  ): Promise<PracticePlanItemDto> {
    const item = await this.repository.findItem(userId, itemId);
    if (!item)
      throw new PracticePlanError("PRACTICE_ITEM_NOT_FOUND", "Practice plan item not found.");
    const completedAt = status === "COMPLETED" ? new Date() : null;
    const updated = await this.repository.updateItemStatus(itemId, status, completedAt);
    return toItemDto(updated);
  }

  private async rebuild(
    userId: string,
    context: PlanContext,
    interviewIds: string[],
    previous: PreviousItem[],
    version: number,
  ): Promise<PracticePlanDto> {
    const draft = applyCarryOver(buildPlanItems(context), previous);
    const plan = await this.repository.replacePlan(userId, {
      version,
      goal: planGoal(context),
      targetRole: planTargetRole(context),
      careerTargetId: context.target?.id ?? null,
      basedOnInterviewIds: interviewIds,
      basedOnValidReportCount: interviewIds.length,
      items: draft.map((item, position) => ({
        position,
        phase: item.phase,
        priority: item.priority,
        activityType: item.activityType,
        title: item.title,
        description: item.description,
        rationale: item.rationale,
        estimatedMinutes: item.estimatedMinutes,
        status: item.status,
        completedAt: item.completedAt,
      })),
    });
    return toDto(plan);
  }
}

/** Applies completed status from the previous plan by stable key and preserves orphaned completions. */
function applyCarryOver(newItems: PlanDraftItem[], previous: PreviousItem[]): CarriedItem[] {
  const completedByKey = new Map(
    previous
      .filter((item) => item.status === "COMPLETED")
      .map((item) => [dedupeKey(item.activityType, item.title), item]),
  );
  const carried: CarriedItem[] = newItems.map((item) => {
    const previousItem = completedByKey.get(item.dedupeKey);
    return {
      ...item,
      status: previousItem ? ("COMPLETED" as const) : ("PENDING" as const),
      completedAt: previousItem?.completedAt ?? null,
    };
  });
  const preserved = previous
    .filter(
      (item) =>
        item.status === "COMPLETED" &&
        !newItems.some((next) => next.dedupeKey === dedupeKey(item.activityType, item.title)),
    )
    .map((item) => ({
      phase: PLAN_PHASES.completed,
      priority: "LOW" as const,
      activityType: item.activityType as CarriedItem["activityType"],
      title: item.title,
      description: item.description,
      rationale: item.rationale,
      estimatedMinutes: item.estimatedMinutes,
      dedupeKey: dedupeKey(item.activityType, item.title),
      status: "COMPLETED" as const,
      completedAt: item.completedAt,
    }));
  return [...carried, ...preserved];
}

type CarriedItem = PlanDraftItem & {
  status: "PENDING" | "COMPLETED";
  completedAt: Date | null;
};

function previousItems(
  items: Array<{
    activityType: string;
    title: string;
    phase: string;
    priority: string;
    description: string | null;
    rationale: string;
    estimatedMinutes: number;
    status: string;
    completedAt: Date | null;
  }>,
): PreviousItem[] {
  return items.map((item) => ({
    ...item,
    dedupeKey: dedupeKey(item.activityType, item.title),
  }));
}

function dedupeKey(activityType: string, title: string) {
  return `${activityType}:${title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()}`;
}

function requiredSkillsOf(target: {
  jobDescription: { deletedAt: Date | null; analysis: { requiredSkills: unknown } | null } | null;
}) {
  if (!target.jobDescription || target.jobDescription.deletedAt) return [];
  const raw = target.jobDescription.analysis?.requiredSkills;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function sameIds(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function toDto(plan: {
  id: string;
  status: string;
  version: number;
  goal: string;
  targetRole: string | null;
  careerTargetId: string | null;
  basedOnInterviewIds: string[];
  basedOnValidReportCount: number;
  generatedAt: Date | null;
  items: Array<{
    id: string;
    activityType: string;
    title: string;
    description: string | null;
    rationale: string;
    phase: string;
    priority: string;
    status: string;
    estimatedMinutes: number;
    completedAt: Date | null;
  }>;
}): PracticePlanDto {
  const items = plan.items.map(toItemDto);
  const completed = items.filter((item) => item.status === "COMPLETED").length;
  return {
    id: plan.id,
    status: plan.status === "READY" ? "READY" : "FAILED",
    version: plan.version,
    goal: plan.goal,
    targetRole: plan.targetRole,
    careerTargetId: plan.careerTargetId,
    basedOnInterviewIds: plan.basedOnInterviewIds,
    basedOnValidReportCount: plan.basedOnValidReportCount,
    generatedAt: plan.generatedAt?.toISOString() ?? null,
    progress: {
      completed,
      total: items.length,
      estimatedMinutesTotal: items.reduce((total, item) => total + item.estimatedMinutes, 0),
    },
    nextActivity: items.find((item) => item.status === "PENDING") ?? null,
    items,
  };
}

function toItemDto(item: {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  rationale: string;
  phase: string;
  priority: string;
  status: string;
  estimatedMinutes: number;
  completedAt: Date | null;
}): PracticePlanItemDto {
  return {
    id: item.id,
    activityType: item.activityType as PracticePlanItemDto["activityType"],
    title: item.title,
    description: item.description,
    rationale: item.rationale,
    phase: item.phase,
    priority: item.priority as PracticePlanItemDto["priority"],
    status: item.status as PracticePlanItemDto["status"],
    estimatedMinutes: item.estimatedMinutes,
    completedAt: item.completedAt?.toISOString() ?? null,
  };
}
