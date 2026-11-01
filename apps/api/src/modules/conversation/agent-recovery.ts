/**
 * Phase 2 of the voice-system roadmap: degraded recovery for the agent lane.
 *
 * Every think failure is first absorbed by the ordered `think` fallback chain
 * (see `agent-transport.ts`). These codes only arrive once the provider has
 * exhausted that chain, or when the speak stage cannot produce audio at all.
 * Such an error is terminal for the provider session, so the interview
 * degrades to the text lane instead of dropping the candidate.
 *
 * The notice is a fixed server template — recovery must never invent interview
 * content or pretend the interviewer answered.
 */

/** Provider errors after which the realtime session cannot continue. */
const degradedProviderErrorCodes = new Set(["FAILED_TO_THINK", "FAILED_TO_SPEAK"]);

export function shouldDegradeAgentSession(code: string | undefined): boolean {
  return code !== undefined && degradedProviderErrorCodes.has(code);
}

/** Warnings that mean the think stage struggled but the session is alive. */
export function isThinkProviderWarning(code: string | undefined): boolean {
  return code === "THINK_REQUEST_FAILED" || code === "SLOW_THINK_REQUEST";
}

export function agentDegradedNotice(language: string): string {
  const byLanguage: Record<string, string> = {
    en: "I'm having trouble continuing by voice, but nothing you said is lost. Let's keep going in text — type your answer below and I'll pick up from there.",
    es: "Estoy teniendo problemas para continuar por voz, pero no se ha perdido nada de lo que dijo. Sigamos por escrito: escriba su respuesta abajo y continuaré desde ahí.",
    de: "Ich habe Schwierigkeiten, per Sprache fortzufahren, aber nichts von dem, was Sie gesagt haben, geht verloren. Machen wir schriftlich weiter — tippen Sie Ihre Antwort unten ein, und ich knüpfe dort an.",
    fr: "J'ai du mal à continuer à l'oral, mais rien de ce que vous avez dit n'est perdu. Continuons par écrit — tapez votre réponse ci-dessous et je reprendrai à partir de là.",
    nl: "Ik heb moeite om via spraak verder te gaan, maar niets van wat u zei gaat verloren. Laten we verdergaan via tekst — typ uw antwoord hieronder en ik pak het daar op.",
  };
  return byLanguage[language] ?? byLanguage.en!;
}
