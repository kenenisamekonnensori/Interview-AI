import type { SkillKey } from "@interviewer-ai/types";

/** Human-readable labels for every canonical skill key. */
export const SKILL_LABELS: Record<SkillKey, string> = {
  communication: "Communication",
  "problem-solving": "Problem Solving",
  technical: "Technical Knowledge",
  confidence: "Confidence",
  "system-design": "System Design",
  algorithms: "Algorithms",
  "data-structures": "Data Structures",
  databases: "Databases",
  behavioral: "Behavioral Interviewing",
  leadership: "Leadership",
  coding: "Coding",
};

/** Fixed evaluation dimensions always map to these canonical skills. */
export const FIXED_DIMENSION_SKILLS: Record<
  "technical" | "communication" | "confidence" | "problemSolving",
  SkillKey
> = {
  technical: "technical",
  communication: "communication",
  confidence: "confidence",
  problemSolving: "problem-solving",
};

/**
 * Normalization map for free-form evaluation category labels onto the
 * controlled taxonomy. Keys are lowercased, trimmed, with punctuation replaced
 * by spaces. Unknown labels are ignored — skills are never invented.
 */
const CATEGORY_SKILL_ALIASES: Record<string, SkillKey> = {
  communication: "communication",
  "problem solving": "problem-solving",
  problemsolving: "problem-solving",
  technical: "technical",
  "technical knowledge": "technical",
  confidence: "confidence",
  "system design": "system-design",
  systemdesign: "system-design",
  architecture: "system-design",
  "system architecture": "system-design",
  algorithms: "algorithms",
  algorithm: "algorithms",
  "data structures": "data-structures",
  datastructures: "data-structures",
  databases: "databases",
  database: "databases",
  sql: "databases",
  behavioral: "behavioral",
  "behavioral interviewing": "behavioral",
  "behavioral structure": "behavioral",
  "behavioral questions": "behavioral",
  leadership: "leadership",
  coding: "coding",
  programming: "coding",
  "code quality": "coding",
};

/** Maps a free-form evaluation category label to a canonical skill, or null. */
export function normalizeCategoryKey(raw: string): SkillKey | null {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CATEGORY_SKILL_ALIASES[normalized] ?? null;
}
