import { safetyPrivacyPrompt } from "./safety.js";

/**
 * Realtime voice-agent instruction (Phase 1 of the voice-system roadmap).
 *
 * The Deepgram Voice Agent `think` provider streams PLAIN SPOKEN TEXT — there
 * is no JSON schema, no assessment block, and no retry envelope on this path:
 * the offline assessment lane owns interview quality. Everything spoken here
 * must be directly speakable, and the candidate hears every character.
 */
export type AgentInterviewInstructionInput = {
  interviewType: string;
  difficulty: string;
  targetRole: string | null;
  language: string;
  isGeneralIntake?: boolean | undefined;
  /** Interview plan: the topics this session must cover, in order. */
  topics: string[];
  objectives: string[];
  resumeSummary?: string | null;
  resumeSkills?: string[] | null;
  jobRequiredSkills?: string[] | null;
  /** Digest of the live conversation memory for per-turn adaptation. */
  memoryDigest?: {
    askedQuestions: string[];
    coveredTopics: string[];
    weakAreas: string[];
  } | null;
};

function languageName(language: string) {
  const names: Record<string, string> = {
    en: "English",
    es: "Spanish",
    de: "German",
    fr: "French",
    nl: "Dutch",
  };
  return names[language] ?? language;
}

/**
 * The per-session system instruction: persona + delivery rules (stable) and
 * the session context pack (per-turn dynamic state is refreshed by the gateway
 * with UpdateSettings after each completed turn).
 */
export function buildAgentInterviewInstruction(input: AgentInterviewInstructionInput) {
  const isGeneral =
    input.isGeneralIntake ||
    !input.targetRole ||
    input.targetRole.toLowerCase().includes("general interview");

  const persona = isGeneral
    ? `You are a warm, experienced senior interviewer conducting a live conversational voice interview (a get-to-know-you intake) as a real-time voice call.`
    : `You are an expert, human senior interviewer conducting a live voice ${input.interviewType.toLowerCase().replaceAll("_", " ")} interview for a ${input.targetRole} role at difficulty level ${input.difficulty}.`;

  const intakeInstruction = isGeneral
    ? `\n### Intake mode\nThere is no saved profile or resume yet. Open by warmly welcoming the candidate, explain that you would like to get to know them, and ask them to introduce themselves: their field, the technologies they work with, and the kind of roles they aim for. Then follow up on what they actually say.\n`
    : "";

  const contextLines: string[] = [];
  if (input.topics.length > 0) {
    contextLines.push(`Planned topics, in order: ${input.topics.join("; ")}.`);
  }
  if (input.objectives.length > 0) {
    contextLines.push(`Interview objectives: ${input.objectives.join("; ")}.`);
  }
  if (input.resumeSummary) {
    contextLines.push(`Candidate resume summary: ${input.resumeSummary}`);
  }
  if (input.resumeSkills && input.resumeSkills.length > 0) {
    contextLines.push(`Candidate skills: ${input.resumeSkills.join(", ")}.`);
  }
  if (input.jobRequiredSkills && input.jobRequiredSkills.length > 0) {
    contextLines.push(`Job requirements: ${input.jobRequiredSkills.join(", ")}.`);
  }
  const digest = input.memoryDigest;
  if (digest) {
    if (digest.askedQuestions.length > 0) {
      contextLines.push(
        `Already asked (ask nothing similar again, and never repeat one): ${digest.askedQuestions.slice(-12).join(" | ")}.`,
      );
    }
    if (digest.coveredTopics.length > 0) {
      contextLines.push(`Topics already covered: ${digest.coveredTopics.join(", ")}.`);
    }
    if (digest.weakAreas.length > 0) {
      contextLines.push(`Candidate weak areas to probe carefully: ${digest.weakAreas.join(", ")}.`);
    }
  }

  return `${persona}

### Language
Respond ONLY in ${languageName(input.language)}, the interview's language. Never switch languages.

### Output rules (critical — every word is spoken aloud)
- Your reply is SPOKEN TEXT ONLY: no JSON, no lists, no headings, no notes, no stage directions.
- One clear question or prompt per turn.
- Keep it to 1–3 short sentences (under 40 words). Speak naturally as if across a desk; never monologue.
- Use short natural conversational bridges ("Got it.", "That makes sense.", "Good point.") before your next question.
- Probe vague or high-level answers for trade-offs, architecture choices, edge cases, or concrete implementation detail.
- If the candidate shows strong depth, raise the challenge; if they struggle, shift to related foundations without making them feel bad.
${intakeInstruction}
### Session context
${contextLines.length > 0 ? contextLines.map((line) => `- ${line}`).join("\n") : "- No extra context is loaded; follow your general interviewer judgment."}

${safetyPrivacyPrompt}`;
}

/** Deterministic opening instruction sent right after the agent session is ready. */
export function buildAgentOpeningMessage(input: AgentInterviewInstructionInput) {
  const isGeneral =
    input.isGeneralIntake ||
    !input.targetRole ||
    input.targetRole.toLowerCase().includes("general interview");
  return isGeneral
    ? `The interview session has just begun. Greet the candidate warmly, and ask them to introduce themselves: their field, the technologies they work with, and the roles they aim for.`
    : `The interview session has just begun. Greet the candidate warmly, briefly say what this session will cover (${input.interviewType.toLowerCase().replaceAll("_", " ")} for ${input.targetRole}), and ask your opening question.`;
}
