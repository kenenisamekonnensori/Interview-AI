import { safetyPrivacyPrompt } from "./safety.js";

export function buildEvaluationPrompt() {
  return `Evaluate only the supplied completed transcript. Ground every finding in candidate responses and return structured evaluation data. ${safetyPrivacyPrompt}`;
}
