import type {
  InterviewType,
  PracticeActivityType,
  PracticePlanItemDto,
} from "@interviewer-ai/types";

export type PhaseGroup = {
  phase: string;
  items: PracticePlanItemDto[];
};

/** Groups plan items by phase, preserving the server's ordering. */
export function groupByPhase(items: PracticePlanItemDto[]): PhaseGroup[] {
  const groups: PhaseGroup[] = [];
  for (const item of items) {
    const group = groups.find((candidate) => candidate.phase === item.phase);
    if (group) group.items.push(item);
    else groups.push({ phase: item.phase, items: [item] });
  }
  return groups;
}

export const activityTypeInfo: Record<
  PracticeActivityType,
  { label: string; interviewType: InterviewType }
> = {
  MOCK_INTERVIEW: { label: "Mock interview", interviewType: "MIXED" },
  QUESTION_SET: { label: "Question set", interviewType: "BEHAVIORAL" },
  TECHNICAL_TOPIC: { label: "Technical topic", interviewType: "TECHNICAL" },
  SYSTEM_DESIGN_EXERCISE: { label: "System design", interviewType: "SYSTEM_DESIGN" },
  CODING_EXERCISE: { label: "Coding exercise", interviewType: "CODING" },
  COMMUNICATION_EXERCISE: { label: "Communication", interviewType: "MIXED" },
};

/** The interview type a practice activity should launch as. */
export function interviewTypeForActivity(activityType: PracticeActivityType): InterviewType {
  return activityTypeInfo[activityType].interviewType;
}
