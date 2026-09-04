/**
 * Languages the voice pipeline can serve end-to-end (browser STT + server TTS).
 * Must stay in sync with `supportedVoiceLanguages` in the API conversation module.
 */
export const SUPPORTED_VOICE_LANGUAGES = ["en", "es", "de", "fr", "nl"] as const;
export type SupportedVoiceLanguage = (typeof SUPPORTED_VOICE_LANGUAGES)[number];

export function isSupportedVoiceLanguage(language: string): language is SupportedVoiceLanguage {
  return (SUPPORTED_VOICE_LANGUAGES as readonly string[]).includes(language);
}

export const voiceLanguageNames: Record<SupportedVoiceLanguage, string> = {
  en: "English",
  es: "Spanish",
  de: "German",
  fr: "French",
  nl: "Dutch",
};
