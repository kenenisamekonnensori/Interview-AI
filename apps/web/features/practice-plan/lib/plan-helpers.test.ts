import { describe, expect, it } from "vitest";

import type { PracticePlanItemDto } from "@interviewer-ai/types";

import { groupByPhase, interviewTypeForActivity } from "./plan-helpers";

const item = (phase: string, title: string): PracticePlanItemDto => ({
  id: "11111111-1111-4111-8111-111111111111",
  activityType: "MOCK_INTERVIEW",
  title,
  description: null,
  rationale: "Rationale.",
  phase,
  priority: "MEDIUM",
  status: "PENDING",
  estimatedMinutes: 30,
  completedAt: null,
});

describe("groupByPhase", () => {
  it("groups items by phase preserving server order", () => {
    const groups = groupByPhase([
      item("1 · Gaps", "A"),
      item("1 · Gaps", "B"),
      item("3 · Simulate", "C"),
      item("2 · Momentum", "D"),
    ]);
    expect(groups.map((group) => group.phase)).toEqual([
      "1 · Gaps",
      "3 · Simulate",
      "2 · Momentum",
    ]);
    expect(groups[0]?.items.map((entry) => entry.title)).toEqual(["A", "B"]);
  });

  it("returns an empty list for no items", () => {
    expect(groupByPhase([])).toEqual([]);
  });
});

describe("interviewTypeForActivity", () => {
  it("maps practice activities to supported interview types", () => {
    expect(interviewTypeForActivity("SYSTEM_DESIGN_EXERCISE")).toBe("SYSTEM_DESIGN");
    expect(interviewTypeForActivity("QUESTION_SET")).toBe("BEHAVIORAL");
    expect(interviewTypeForActivity("CODING_EXERCISE")).toBe("CODING");
    expect(interviewTypeForActivity("TECHNICAL_TOPIC")).toBe("TECHNICAL");
    expect(interviewTypeForActivity("MOCK_INTERVIEW")).toBe("MIXED");
  });
});
