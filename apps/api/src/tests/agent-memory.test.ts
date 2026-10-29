import { describe, expect, it } from "vitest";

import {
  agentAnswerAssessmentSchema,
  applyAgentAnswerAssessment,
  buildAgentMemoryDigest,
  buildAgentMemoryUpdate,
  coerceAgentMemory,
  deriveTopicReference,
  hasCoveredAllAgentObjectives,
  isAgentClosingStatement,
  type AgentMemorySnapshot,
} from "../modules/conversation/agent-memory.js";

const EMPTY: AgentMemorySnapshot = {
  askedQuestions: [],
  topicCoverage: [],
  candidateStrengths: [],
  weakAreas: [],
  missedFollowUps: [],
  questionDifficulty: "MEDIUM",
  remainingObjectives: ["Design caching", "Explain trade-offs"],
};

describe("buildAgentMemoryUpdate", () => {
  it("records question turns in askedQuestions and marks the mapped plan topic", () => {
    const updated = buildAgentMemoryUpdate({
      memory: EMPTY,
      kind: "QUESTION",
      responseText: "Can you walk me through a caching layer you built and its trade-offs?",
      planTopics: ["caching strategies", "system design"],
    });
    expect(updated.askedQuestions).toHaveLength(1);
    expect(updated.askedQuestions[0]).toContain("caching layer");
    expect(updated.topicCoverage).toEqual([{ topic: "caching strategies", outcome: "ASKED" }]);
  });

  it("never appends greetings or closings to askedQuestions", () => {
    const updated = buildAgentMemoryUpdate({
      memory: EMPTY,
      kind: "CLOSING",
      responseText: "Thank you for your time — I'll wrap up here.",
      planTopics: ["caching strategies"],
    });
    expect(updated.askedQuestions).toEqual([]);
    expect(updated.topicCoverage).toEqual([]);
  });

  it("deduplicates repeated questions and keeps the last 12", () => {
    let memory = EMPTY;
    for (let i = 0; i < 14; i += 1) {
      memory = buildAgentMemoryUpdate({
        memory,
        kind: "QUESTION",
        responseText: i === 0 ? "Same question asked twice" : `Question number ${i}`,
        planTopics: [],
      });
    }
    memory = buildAgentMemoryUpdate({
      memory,
      kind: "QUESTION",
      responseText: "Same question asked twice",
      planTopics: [],
    });
    expect(memory.askedQuestions).toHaveLength(12);
    expect(memory.askedQuestions.filter((q) => q === "Same question asked twice")).toHaveLength(1);
  });
});

describe("deriveTopicReference", () => {
  it("maps a question by significant token overlap", () => {
    expect(
      deriveTopicReference("How did you design the caching layer eviction?", [
        "caching strategies",
      ]),
    ).toBe("caching strategies");
  });
  it("returns null if no topic tokens match", () => {
    expect(
      deriveTopicReference("What did you have for breakfast?", ["caching strategies"]),
    ).toBeNull();
  });
  it("selects the strongest topic match", () => {
    const topics = ["distributed systems", "caching strategies"];
    expect(
      deriveTopicReference("Describe your distributed systems architecture in detail", topics),
    ).toBe("distributed systems");
  });
});

describe("agent answer assessments", () => {
  it("validates the strict post-turn assessment shape", () => {
    expect(
      agentAnswerAssessmentSchema.parse({
        answerDepth: "STRONG",
        followUpNeeded: false,
        completedObjectives: ["Design caching"],
      }),
    ).toEqual({
      answerDepth: "STRONG",
      followUpNeeded: false,
      completedObjectives: ["Design caching"],
    });
    expect(() =>
      agentAnswerAssessmentSchema.parse({
        answerDepth: "STRONG",
        followUpNeeded: false,
        completedObjectives: [],
        extra: true,
      }),
    ).toThrow();
  });

  it("records evidence labels and completes only explicitly assessed objectives", () => {
    const updated = applyAgentAnswerAssessment({
      memory: EMPTY,
      topic: "caching strategies",
      answerDepth: "STRONG",
      followUpNeeded: false,
      completedObjectives: ["Design caching"],
    });
    expect(updated.candidateStrengths).toEqual(["Strong evidence on caching strategies"]);
    expect(updated.remainingObjectives).toEqual(["Explain trade-offs"]);
    expect(updated.topicCoverage).toEqual([{ topic: "caching strategies", outcome: "COMPLETED" }]);
    expect(updated.questionDifficulty).toBe("HARD");
  });

  it("keeps objectives pending on shallow answers and lowers difficulty", () => {
    const updated = applyAgentAnswerAssessment({
      memory: { ...EMPTY, questionDifficulty: "HARD" },
      topic: "caching strategies",
      answerDepth: "SHALLOW",
      followUpNeeded: true,
      completedObjectives: ["Design caching"],
    });
    expect(updated.remainingObjectives).toEqual(EMPTY.remainingObjectives);
    expect(updated.weakAreas).toEqual(["Needs deeper evidence on caching strategies"]);
    expect(updated.missedFollowUps).toEqual(["Follow up on caching strategies"]);
    expect(updated.questionDifficulty).toBe("MEDIUM");
  });

  it("closes only when all objectives and planned topics are complete", () => {
    expect(hasCoveredAllAgentObjectives(EMPTY, ["caching strategies"])).toBe(false);
    expect(
      hasCoveredAllAgentObjectives(
        {
          ...EMPTY,
          remainingObjectives: [],
          topicCoverage: [{ topic: "caching strategies", outcome: "COMPLETED" }],
        },
        ["caching strategies"],
      ),
    ).toBe(true);
  });
});

describe("closing statements", () => {
  it("detects farewell language but not regular questions", () => {
    expect(isAgentClosingStatement("Thank you for your time, and best of luck!")).toBe(true);
    expect(isAgentClosingStatement("Let me wrap up our conversation here.")).toBe(true);
    expect(isAgentClosingStatement("Could you explain how you cached query results?")).toBe(false);
  });
});

describe("coerceAgentMemory", () => {
  it("coerces JSON memory values and uses plan defaults for missing values", () => {
    const coerced = coerceAgentMemory(
      {
        askedQuestions: ["Q1", 42, "Q2"],
        topicCoverage: [{ topic: "caching", outcome: "ASKED" }, "junk"],
        candidateStrengths: ["S1"],
        weakAreas: ["W1"],
        missedFollowUps: [],
        questionDifficulty: "HARD",
        remainingObjectives: ["O1"],
      },
      { objectives: ["Fallback objective"] },
    );
    expect(coerced.askedQuestions).toEqual(["Q1", "Q2"]);
    expect(coerced.topicCoverage).toEqual([{ topic: "caching", outcome: "ASKED" }]);
    expect(coerced.questionDifficulty).toBe("HARD");
    expect(coerced.remainingObjectives).toEqual(["O1"]);
  });

  it("falls back to defaults for missing or corrupted fields", () => {
    expect(coerceAgentMemory(null, { objectives: ["Fallback objective"] })).toMatchObject({
      askedQuestions: [],
      questionDifficulty: "MEDIUM",
      remainingObjectives: ["Fallback objective"],
    });
    expect(
      coerceAgentMemory(
        {
          askedQuestions: [],
          topicCoverage: [],
          candidateStrengths: [],
          weakAreas: [],
          missedFollowUps: [],
          questionDifficulty: "IMPOSSIBLE",
          remainingObjectives: [],
        },
        { objectives: ["Fallback"] },
      ).questionDifficulty,
    ).toBe("MEDIUM");
  });
});

describe("buildAgentMemoryDigest", () => {
  it("contains only bounded memory context for the live think prompt", () => {
    expect(
      buildAgentMemoryDigest({
        ...EMPTY,
        askedQuestions: ["Q1"],
        topicCoverage: [{ topic: "caching", outcome: "ASKED" }],
        weakAreas: ["W1"],
      }),
    ).toEqual({
      askedQuestions: ["Q1"],
      coveredTopics: ["caching"],
      remainingObjectives: ["Design caching", "Explain trade-offs"],
      weakAreas: ["W1"],
    });
  });
});
