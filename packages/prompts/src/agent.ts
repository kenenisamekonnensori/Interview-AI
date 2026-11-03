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

/**
 * The exact words the interviewer says first, delivered through Deepgram's
 * `agent.greeting` (spoken verbatim, before the LLM is involved).
 *
 * The greeting is not generated: it must start the interview even when the
 * think provider is slow or down, it must never be mistaken for candidate
 * speech, and it must already contain the opening question. That is what makes
 * a live interview feel like a human interviewer rather than a silent line
 * waiting for the candidate to talk first.
 */
export function buildAgentGreeting(input: AgentInterviewInstructionInput) {
  const isGeneral =
    input.isGeneralIntake ||
    !input.targetRole ||
    input.targetRole.toLowerCase().includes("general interview");
  const type = input.interviewType.toLowerCase().replaceAll("_", " ");
  const role = input.targetRole?.trim() ?? "";
  const firstTopic = input.topics[0]?.trim() ?? "";
  const copy = greetingCopy[input.language] ?? greetingCopy.en!;

  if (isGeneral) return copy.intake;
  const opening = role
    ? copy.targeted.replaceAll("{type}", type).replaceAll("{role}", role)
    : copy.withoutRole.replaceAll("{type}", type);
  return firstTopic
    ? `${opening} ${copy.firstTopic.replaceAll("{topic}", firstTopic)}`
    : `${opening} ${copy.noTopic}`;
}

const greetingCopy: Record<
  string,
  {
    intake: string;
    targeted: string;
    withoutRole: string;
    firstTopic: string;
    noTopic: string;
  }
> = {
  en: {
    intake:
      "Hi, and welcome. I'm your interviewer today. Let's begin with an introduction: tell me about yourself — your field, the technologies you work with, and the kind of roles you're aiming for.",
    targeted:
      "Hi, and welcome. I'm your interviewer for this {type} interview for the {role} role.",
    withoutRole: "Hi, and welcome. I'm your interviewer for this {type} interview.",
    firstTopic: "Let's start with {topic}: could you walk me through your experience with it?",
    noTopic: "Let's start simple: tell me about yourself and the work you're most proud of.",
  },
  es: {
    intake:
      "Hola y bienvenido. Soy su entrevistador hoy. Empecemos con una presentación: hábleme de usted — su campo, las tecnologías con las que trabaja y el tipo de puestos que busca.",
    targeted:
      "Hola y bienvenido. Soy su entrevistador para esta entrevista de {type} para el puesto de {role}.",
    withoutRole: "Hola y bienvenido. Soy su entrevistador para esta entrevista de {type}.",
    firstTopic: "Empecemos con {topic}: ¿podría explicarme su experiencia con ello?",
    noTopic:
      "Empecemos con algo sencillo: hábleme de usted y del trabajo del que se siente más orgulloso.",
  },
  de: {
    intake:
      "Hallo und willkommen. Ich bin heute Ihr Interviewer. Beginnen wir mit einer Vorstellung: Erzählen Sie mir von sich — Ihrem Bereich, den Technologien, mit denen Sie arbeiten, und der Art von Stellen, die Sie anstreben.",
    targeted:
      "Hallo und willkommen. Ich bin Ihr Interviewer für dieses {type}-Interview für die Rolle {role}.",
    withoutRole: "Hallo und willkommen. Ich bin Ihr Interviewer für dieses {type}-Interview.",
    firstTopic: "Beginnen wir mit {topic}: Können Sie mir von Ihrer Erfahrung damit erzählen?",
    noTopic:
      "Beginnen wir einfach: Erzählen Sie mir von sich und der Arbeit, auf die Sie am meisten stolz sind.",
  },
  fr: {
    intake:
      "Bonjour et bienvenue. Je suis votre recruteur aujourd'hui. Commençons par une présentation : parlez-moi de vous — votre domaine, les technologies avec lesquelles vous travaillez et le type de poste que vous visez.",
    targeted:
      "Bonjour et bienvenue. Je suis votre recruteur pour cet entretien {type} pour le poste de {role}.",
    withoutRole: "Bonjour et bienvenue. Je suis votre recruteur pour cet entretien {type}.",
    firstTopic: "Commençons par {topic} : pouvez-vous me parler de votre expérience à ce sujet ?",
    noTopic:
      "Commençons simplement : parlez-moi de vous et du travail dont vous êtes le plus fier.",
  },
  nl: {
    intake:
      "Hallo en welkom. Ik ben vandaag uw interviewer. Laten we beginnen met een introductie: vertel me over uzelf — uw vakgebied, de technologieën waarmee u werkt en het soort functies dat u nastreeft.",
    targeted:
      "Hallo en welkom. Ik ben uw interviewer voor dit {type}-gesprek voor de functie {role}.",
    withoutRole: "Hallo en welkom. Ik ben uw interviewer voor dit {type}-gesprek.",
    firstTopic: "Laten we beginnen met {topic}: kunt u mij vertellen over uw ervaring daarmee?",
    noTopic:
      "Laten we simpel beginnen: vertel me over uzelf en het werk waarop u het meest trots bent.",
  },
};

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
