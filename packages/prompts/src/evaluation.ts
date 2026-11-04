import { safetyPrivacyPrompt } from "./safety.js";

export function buildEvaluationPrompt() {
  return `Evaluate only the supplied completed transcript. Ground every finding in candidate responses and return structured evaluation data.
For behavioral questions, analyze answers using the STAR method: Situation, Task, Action, and Result.
Evaluate personal ownership in the Action component, noting whether the candidate used active personal ownership ("I") versus diffuse team language ("we").
Provide sub-scores (0 to 100) and evidence turn references for each STAR component.
For technical questions or non-behavioral context, the STAR breakdown may be omitted or empty.
For any candidate response whose evaluation or dimension score is under 70/100, generate a Staff/Principal-level model exemplar response demonstrating structured delivery, quantified impact metrics, and active ownership, along with a concise improvement rationale. ${safetyPrivacyPrompt}`;
}
