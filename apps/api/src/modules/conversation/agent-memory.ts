import type { Prisma } from "../../../prisma/generated/client.js";
import type { InterviewPlan } from "@interviewer-ai/types";
import { z } from "zod";

/**
 * Agent-path interview-memory adapter (Phase 2 of the voice-system roadmap).
 *
 * The Deepgram agent lane produces plain spoken text: there is no assessment
 * payload, no topicReference, and no objectiveReference like the legacy
 * generation response carries. Memory on this path tracks only what is
 * actually observable — the questions the interviewer asked, the plan topics
 * those questions plausibly covered, and whether the spoken statement is a
 * closing farewell — and passes every other memory dimension through
 * untouched so the interview's memory row never loses data.
 */

export type AgentMemorySnapshot = {
  askedQuestions: string[];
  topicCoverage: Array<{ topic: string; outcome: "ASKED" | "FOLLOWED_UP" | "COMPLETED" }>;
  candidateStrengths: string[];
  weakAreas: string[];
  missedFollowUps: string[];
  questionDifficulty: "EASY" | "MEDIUM" | "HARD" | "EXPERT";
  remainingObjectives: string[];
};

export type AgentTurnKind = "GREETING" | "QUESTION" | "CLOSING";

export const agentAnswerAssessmentSchema = z.object({
  answerDepth: z.enum(["SHALLOW", "ADEQUATE", "STRONG"]),
  followUpNeeded: z.boolean(),
  completedObjectives: z.array(z.string().trim().min(1)).max(20),
}).strict();
export type AgentAnswerAssessment = z.infer<typeof agentAnswerAssessmentSchema>;

/** Turns whose text is a question the interviewer asked (never a greeting/closing). */
const QUESTION_KINDS = new Set<AgentTurnKind>(["QUESTION"]);

export function emptyAgentMemory(plan: Pick<InterviewPlan, "objectives">): AgentMemorySnapshot {
  return {
    askedQuestions: [],
    topicCoverage: [],
    candidateStrengths: [],
    weakAreas: [],
    missedFollowUps: [],
    questionDifficulty: "MEDIUM",
    remainingObjectives: plan.objectives,
  };
}

const MEMORY_DIFFICULTIES = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;

function stringList(values: Prisma.JsonValue | null): string[] {
  return Array.isArray(values)
    ? values.filter((item): item is string => typeof item === "string")
    : [];
}

type AgentCoverageOutcome = "ASKED" | "FOLLOWED_UP" | "COMPLETED";

function coerceCoverage(values: Prisma.JsonValue): Array<{ topic: string; outcome: AgentCoverageOutcome }> {
  if (!Array.isArray(values)) return [];
  return values.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as { topic?: unknown; outcome?: unknown };
    if (typeof record.topic !== "string") return [];
    if (
      record.outcome === "ASKED" ||
      record.outcome === "FOLLOWED_UP" ||
      record.outcome === "COMPLETED"
    ) {
      return [{ topic: record.topic, outcome: record.outcome }];
    }
    return [];
  });
}

/**
 * Coerces the prisma InterviewMemory row (Json columns) into the typed
 * snapshot the agent gateway operates on. Missing/absent rows degrade to the
 * empty snapshot seeded from the plan's remaining objectives.
 */
export function coerceAgentMemory(
  memory:
    | {
        askedQuestions: Prisma.JsonValue;
        topicCoverage: Prisma.JsonValue;
        candidateStrengths: Prisma.JsonValue;
        weakAreas: Prisma.JsonValue;
        missedFollowUps: Prisma.JsonValue;
        questionDifficulty: string;
        remainingObjectives: Prisma.JsonValue;
      }
    | null
    | undefined,
  plan: Pick<InterviewPlan, "objectives">,
): AgentMemorySnapshot {
  const empty = emptyAgentMemory(plan);
  if (!memory) return empty;
  const coverage = coerceCoverage(memory.topicCoverage);
  const difficulty = (MEMORY_DIFFICULTIES as readonly string[]).includes(memory.questionDifficulty)
    ? (memory.questionDifficulty as AgentMemorySnapshot["questionDifficulty"])
    : "MEDIUM";
  const remainingObjectives = stringList(memory.remainingObjectives);
  return {
    askedQuestions: stringList(memory.askedQuestions),
    topicCoverage: coverage,
    candidateStrengths: stringList(memory.candidateStrengths),
    weakAreas: stringList(memory.weakAreas),
    missedFollowUps: stringList(memory.missedFollowUps),
    questionDifficulty: difficulty,
    remainingObjectives: remainingObjectives.length > 0 ? remainingObjectives : plan.objectives,
  };
}

function uniqueStrings(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(-limit);
}

/**
 * Fuzzy but deterministic topic mapping: significant-token overlap between the
 * spoken question and the plan topics. Two shared tokens — or one shared token
 * of six or more characters — across the whole topic string is enough; the
 * plan topic names are short and the agent quotes plan context directly.
 */
export function deriveTopicReference(questionText: string, topics: string[]): string | null {
  const tokens = (questionText.toLocaleLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(
    (token) => !STOP_TOKENS.has(token),
  );
  if (tokens.length === 0) return null;
  let best: { topic: string; score: number } | null = null;
  for (const topic of topics) {
    const topicTokens = new Set(topic.toLocaleLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    let score = 0;
    for (const token of tokens) {
      if (topicTokens.has(token)) score += token.length >= 6 ? 2 : 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best && best.score >= 2 ? best.topic : null;
}

const STOP_TOKENS = new Set([
  "the",
  "and",
  "what",
  "how",
  "why",
  "with",
  "for",
  "you",
  "your",
  "could",
  "would",
  "about",
  "describe",
  "explain",
  "tell",
  "into",
  "when",
  "where",
  "that",
  "this",
  "have",
  "been",
]);

/**
 * Closing farewell detection on the spoken lane. Conservative list: the
 * statement must LOOK like a farewell; a normal question never matches.
 */
const closingPhrases = [
  "wrap up",
  "wrapping up",
  "conclude the interview",
  "concludes the interview",
  "conclude our",
  "end of the interview",
  "end our interview",
  "that completes",
  "this completes",
  "that's all of my questions",
  "that's all my questions",
  "thank you for coming",
  "thank you for your time",
  "thanks for your time",
  "wish you luck",
  "wishing you luck",
  "best of luck",
  "good luck with",
];

export function isAgentClosingStatement(text: string): boolean {
  const haystack = text.toLocaleLowerCase().replace(/\s+/g, " ");
  return closingPhrases.some((phrase) => haystack.includes(phrase));
}

/**
 * The memory update for one agent turn. Question turns record the spoken
 * question and (when mappable) mark its plan topic as ASKED; greetings and
 * closings change nothing. Every other field passes through unchanged.
 */
export function buildAgentMemoryUpdate({
  memory,
  kind,
  responseText,
  planTopics,
}: {
  memory: AgentMemorySnapshot;
  kind: AgentTurnKind;
  responseText: string;
  planTopics: string[];
}): AgentMemorySnapshot {
  if (!QUESTION_KINDS.has(kind)) return memory;
  return {
    ...memory,
    askedQuestions: uniqueStrings([...memory.askedQuestions, responseText], 12),
    topicCoverage: mergeAgentCoverage(memory.topicCoverage, deriveTopicReference(responseText, planTopics), "ASKED"),
  };
}

function mergeAgentCoverage(
  coverage: AgentMemorySnapshot["topicCoverage"],
  topic: string | null,
  outcome: "ASKED" | "FOLLOWED_UP" | "COMPLETED",
) {
  if (!topic) return coverage;
  const existing = coverage.find((item) => item.topic === topic);
  return existing
    ? coverage.map((item) => (item.topic === topic ? { topic, outcome } : item))
    : [...coverage, { topic, outcome }];
}

/** Persist a candidate-answer assessment without blocking the streaming reply path. */
export function applyAgentAnswerAssessment({
  memory,
  topic,
  answerDepth,
  followUpNeeded,
  completedObjectives,
}: {
  memory: AgentMemorySnapshot;
  topic: string | null;
  answerDepth: "SHALLOW" | "ADEQUATE" | "STRONG";
  followUpNeeded: boolean;
  completedObjectives: string[];
}): AgentMemorySnapshot {
  const label = topic ?? "the current topic";
  const coverage = topic
    ? mergeAgentCoverage(
        memory.topicCoverage,
        topic,
        followUpNeeded ? "FOLLOWED_UP" : "COMPLETED",
      )
    : memory.topicCoverage;
  const candidateStrengths =
    answerDepth === "STRONG"
      ? uniqueStrings([...memory.candidateStrengths, `Strong evidence on ${label}`], 8)
      : memory.candidateStrengths;
  const weakAreas =
    answerDepth === "SHALLOW"
      ? uniqueStrings([...memory.weakAreas, `Needs deeper evidence on ${label}`], 8)
      : memory.weakAreas;
  const missedFollowUps =
    followUpNeeded
      ? uniqueStrings([...memory.missedFollowUps, `Follow up on ${label}`], 6)
      : topic
        ? memory.missedFollowUps.filter((item) => !item.includes(label))
        : memory.missedFollowUps;
  return {
    ...memory,
    topicCoverage: coverage,
    candidateStrengths,
    weakAreas,
    missedFollowUps,
    questionDifficulty:
      answerDepth === "STRONG"
        ? raiseDifficulty(memory.questionDifficulty)
        : answerDepth === "SHALLOW"
          ? lowerDifficulty(memory.questionDifficulty)
          : memory.questionDifficulty,
    // A shallow answer is not evidence: an objective only closes on an
    // adequate or strong answer, so the same probe can be retried.
    remainingObjectives:
      answerDepth === "SHALLOW"
        ? memory.remainingObjectives
        : memory.remainingObjectives.filter(
            (objective) => !completedObjectives.includes(objective),
          ),
  };
}

/** After the final recorded answer, unresolved objectives close the interview rather than looping. */
function raiseDifficulty(current: AgentMemorySnapshot["questionDifficulty"]) {
  const levels = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;
  return levels[Math.min(levels.indexOf(current) + 1, levels.length - 1)]!;
}

function lowerDifficulty(current: AgentMemorySnapshot["questionDifficulty"]) {
  const levels = ["EASY", "MEDIUM", "HARD", "EXPERT"] as const;
  return levels[Math.max(levels.indexOf(current) - 1, 0)]!;
}

export function hasCoveredAllAgentObjectives(memory: AgentMemorySnapshot, planTopics: string[]) {
  if (memory.remainingObjectives.length > 0) return false;
  return planTopics.length === 0 || planTopics.every((topic) =>
    memory.topicCoverage.some((item) => item.topic === topic && item.outcome === "COMPLETED"),
  );
}

/** Digest fed to the agent instruction so it never repeats what it asked. */
export function buildAgentMemoryDigest(memory: AgentMemorySnapshot) {
  return {
    askedQuestions: memory.askedQuestions.slice(-12),
    coveredTopics: memory.topicCoverage.map((item) => item.topic),
    remainingObjectives: memory.remainingObjectives,
    weakAreas: memory.weakAreas,
  };
}
