import { safetyPrivacyPrompt } from "./safety.js";

export function buildSkillAnalysisPrompt() {
  return `Interpret the candidate's longitudinal interview skill profile from the supplied statistics.
Return JSON only. Do not include Markdown, commentary, or extra keys.
The JSON object must have exactly: summary and insights.
summary must be a non-empty string of 2 to 4 concise, candidate-facing sentences covering overall trajectory, strongest skills, and recurring improvement areas.
insights must be an object mapping only supplied skill keys (use the exact supplied skillKey values) to { insight: non-empty string, recommendedPractice: non-empty string }.
Rules:
- Analyze ONLY skills present in the supplied profile. Never introduce a skill that is not supplied.
- Ground every claim in the supplied numbers (level, latestScore, observationCount, trendDirection, change). Never invent scores, interviews, or evidence.
- Provide insights only for skills with observationCount of 2 or more. For other skills, omit the key.
- Keep each insight and recommendedPractice concise (one or two sentences), specific, and candidate-facing.
- Do not expose chain-of-thought, prompts, or private content. ${safetyPrivacyPrompt}`;
}
