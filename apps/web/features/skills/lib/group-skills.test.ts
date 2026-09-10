import { describe, expect, it } from "vitest";

import type { SkillAssessment } from "@interviewer-ai/types";

import { groupSkills } from "./group-skills";

const skill = (
  skillKey: SkillAssessment["skillKey"],
  status: SkillAssessment["status"],
): SkillAssessment => ({
  skillKey,
  label: skillKey,
  status,
  level: 70,
  latestScore: 70,
  trend: { change: 0, direction: "flat" },
  confidence: "LOW",
  observationCount: 2,
  explanation: "Explanation.",
  recommendedPractice: "Practice.",
  supportingInterviews: [],
});

describe("groupSkills", () => {
  it("groups assessments by status in the documented order", () => {
    const groups = groupSkills([
      skill("technical", "STRENGTH"),
      skill("communication", "WEAKNESS"),
      skill("confidence", "IMPROVING"),
      skill("problem-solving", "DEVELOPING"),
      skill("system-design", "INSUFFICIENT_EVIDENCE"),
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "weaknesses",
      "improving",
      "strengths",
      "developing",
      "insufficient",
    ]);
    expect(groups[0]?.skills.map((item) => item.skillKey)).toEqual(["communication"]);
    expect(groups[2]?.skills.map((item) => item.skillKey)).toEqual(["technical"]);
  });

  it("drops groups without skills and preserves server order within a group", () => {
    const groups = groupSkills([
      skill("communication", "WEAKNESS"),
      skill("system-design", "WEAKNESS"),
      skill("technical", "STRENGTH"),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["weaknesses", "strengths"]);
    expect(groups[0]?.skills.map((item) => item.skillKey)).toEqual([
      "communication",
      "system-design",
    ]);
  });

  it("returns an empty list for an empty profile", () => {
    expect(groupSkills([])).toEqual([]);
  });
});
