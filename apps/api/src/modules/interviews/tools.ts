import type { PrismaClient } from "../../../prisma/generated/client.js";
import { interviewPlanSchema } from "@interviewer-ai/types";
import { z } from "zod";

import type { InterviewService } from "./service.js";

const interviewIdInputSchema = z.object({ interviewId: z.uuid() });
const transcriptInputSchema = interviewIdInputSchema.extend({
  limit: z.number().int().min(1).max(12).default(6),
});
const coverageInputSchema = interviewIdInputSchema.extend({
  topic: z.string().trim().min(1).max(200),
  outcome: z.enum(["ASKED", "FOLLOWED_UP", "COMPLETED"]),
});

export type InterviewToolActor = { userId: string };

/** Backend-owned tools. Each lookup verifies ownership before returning minimized data. */
export class InterviewTools {
  constructor(
    private readonly database: PrismaClient,
    private readonly interviewService: InterviewService,
  ) {}

  async retrieveResumeAnalysis(actor: InterviewToolActor, rawInput: unknown) {
    const { interviewId } = interviewIdInputSchema.parse(rawInput);
    const interview = await this.database.interview.findFirst({
      where: { id: interviewId, userId: actor.userId },
      include: { resume: { include: { analysis: true } } },
    });
    if (!interview) return null;
    const analysis = interview.resume?.deletedAt ? null : interview.resume?.analysis;
    return analysis
      ? {
          summary: analysis.summary,
          skills: asStringList(analysis.skills, 20),
          technologies: asStringList(analysis.technologies, 20),
        }
      : null;
  }

  async retrieveJobAnalysis(actor: InterviewToolActor, rawInput: unknown) {
    const { interviewId } = interviewIdInputSchema.parse(rawInput);
    const interview = await this.database.interview.findFirst({
      where: { id: interviewId, userId: actor.userId },
      include: { jobDescription: { include: { analysis: true } } },
    });
    if (!interview) return null;
    const analysis = interview.jobDescription?.deletedAt
      ? null
      : interview.jobDescription?.analysis;
    return analysis
      ? {
          requiredSkills: asStringList(analysis.requiredSkills, 20),
          responsibilities: asStringList(analysis.responsibilities, 12),
        }
      : null;
  }

  async retrieveInterviewPlan(actor: InterviewToolActor, rawInput: unknown) {
    const { interviewId } = interviewIdInputSchema.parse(rawInput);
    const interview = await this.database.interview.findFirst({
      where: { id: interviewId, userId: actor.userId },
      include: { plan: true },
    });
    return interview?.plan ? interviewPlanSchema.parse(interview.plan) : null;
  }

  async retrieveRecentTranscriptContext(actor: InterviewToolActor, rawInput: unknown) {
    const { interviewId, limit } = transcriptInputSchema.parse(rawInput);
    const conversation = await this.database.conversation.findFirst({
      where: { interviewId, interview: { userId: actor.userId } },
      include: { turns: { orderBy: { sequence: "desc" }, take: limit } },
    });
    return (conversation?.turns ?? [])
      .reverse()
      .map((turn) => ({ speaker: turn.speaker, type: turn.type, text: turn.text }));
  }

  async retrieveMemory(actor: InterviewToolActor, rawInput: unknown) {
    const { interviewId } = interviewIdInputSchema.parse(rawInput);
    const memory = await this.database.interviewMemory.findFirst({
      where: { interviewId, interview: { userId: actor.userId } },
    });
    return memory ? memoryOutput(memory) : null;
  }

  async recordTopicCoverage(actor: InterviewToolActor, rawInput: unknown) {
    const input = coverageInputSchema.parse(rawInput);
    const memory = await this.database.interviewMemory.findFirst({
      where: { interviewId: input.interviewId, interview: { userId: actor.userId } },
    });
    if (!memory) return null;
    const coverage = asCoverage(memory.topicCoverage);
    const existing = coverage.find((item) => item.topic === input.topic);
    const nextCoverage = existing
      ? coverage.map((item) =>
          item.topic === input.topic ? { ...item, outcome: input.outcome } : item,
        )
      : [...coverage, { topic: input.topic, outcome: input.outcome }];
    const updated = await this.database.interviewMemory.update({
      where: { id: memory.id },
      data: { topicCoverage: nextCoverage },
    });
    return memoryOutput(updated);
  }

  async identifyNextPlannedTopic(actor: InterviewToolActor, rawInput: unknown) {
    const plan = await this.retrieveInterviewPlan(actor, rawInput);
    const memory = await this.retrieveMemory(actor, rawInput);
    if (!plan) return null;
    const covered = new Set((memory?.topicCoverage ?? []).map((item) => item.topic));
    const next = [...plan.topics]
      .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority))
      .find((topic) => !covered.has(topic.topic));
    return next
      ? { topic: next.topic, priority: next.priority, reason: "UNCOVERED_PLAN_TOPIC" as const }
      : null;
  }

  async retrievePriorWeakAreas(actor: InterviewToolActor, rawInput: unknown) {
    const memory = await this.retrieveMemory(actor, rawInput);
    return memory?.weakAreas ?? [];
  }

  async requestConversationCompletion(actor: InterviewToolActor, rawInput: unknown) {
    const { interviewId } = interviewIdInputSchema.parse(rawInput);
    const interview = await this.interviewService.requestCompletion(interviewId, actor.userId);
    return { interviewId: interview.id, status: interview.status };
  }

  async queueEvaluation(actor: InterviewToolActor, rawInput: unknown) {
    return this.requestConversationCompletion(actor, rawInput);
  }
}

function asStringList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

type Coverage = { topic: string; outcome: "ASKED" | "FOLLOWED_UP" | "COMPLETED" };
function asCoverage(value: unknown): Coverage[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Coverage =>
          typeof item === "object" &&
          item !== null &&
          "topic" in item &&
          "outcome" in item &&
          typeof item.topic === "string" &&
          ["ASKED", "FOLLOWED_UP", "COMPLETED"].includes(String(item.outcome)),
      )
    : [];
}

function memoryOutput(memory: {
  askedQuestions: unknown;
  topicCoverage: unknown;
  candidateStrengths: unknown;
  weakAreas: unknown;
  missedFollowUps: unknown;
  questionDifficulty: string;
  remainingObjectives: unknown;
}) {
  return {
    askedQuestions: asStringList(memory.askedQuestions, 12),
    topicCoverage: asCoverage(memory.topicCoverage),
    candidateStrengths: asStringList(memory.candidateStrengths, 8),
    weakAreas: asStringList(memory.weakAreas, 8),
    missedFollowUps: asStringList(memory.missedFollowUps, 6),
    questionDifficulty: memory.questionDifficulty,
    remainingObjectives: asStringList(memory.remainingObjectives, 12),
  };
}

function priorityRank(priority: "HIGH" | "MEDIUM" | "LOW") {
  return priority === "HIGH" ? 0 : priority === "MEDIUM" ? 1 : 2;
}
