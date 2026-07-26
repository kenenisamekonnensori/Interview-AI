import { safetyPrivacyPrompt } from "./safety.js";

export function buildReportPrompt() {
  return `Create a concise, candidate-facing report from the supplied validated evaluation and interview metadata. ${safetyPrivacyPrompt}`;
}
