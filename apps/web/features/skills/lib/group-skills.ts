import type { SkillAssessment, SkillStatus } from "@interviewer-ai/types";

export type SkillGroupKey =
  "weaknesses" | "improving" | "strengths" | "developing" | "insufficient";

export type SkillGroup = {
  key: SkillGroupKey;
  title: string;
  description: string;
  skills: SkillAssessment[];
};

const groupDefinitions: Array<Omit<SkillGroup, "skills">> = [
  {
    key: "weaknesses",
    title: "Areas to improve",
    description: "Repeatedly lower scores across interviews.",
  },
  {
    key: "improving",
    title: "Improving",
    description: "Trending upward from repeated evidence.",
  },
  {
    key: "strengths",
    title: "Strengths",
    description: "Consistently strong performance.",
  },
  {
    key: "developing",
    title: "Developing",
    description: "Steady, but not yet a strength.",
  },
  {
    key: "insufficient",
    title: "Needs more evidence",
    description: "Not enough scored interviews to assess yet.",
  },
];

const statusToGroup: Record<SkillStatus, SkillGroupKey> = {
  WEAKNESS: "weaknesses",
  IMPROVING: "improving",
  STRENGTH: "strengths",
  DEVELOPING: "developing",
  INSUFFICIENT_EVIDENCE: "insufficient",
};

/** Groups assessments by status, preserving the server's order within each group. */
export function groupSkills(skills: SkillAssessment[]): SkillGroup[] {
  return groupDefinitions
    .map((definition) => ({
      ...definition,
      skills: skills.filter((skill) => statusToGroup[skill.status] === definition.key),
    }))
    .filter((group) => group.skills.length > 0);
}
