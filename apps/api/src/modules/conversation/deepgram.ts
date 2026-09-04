import { DeepgramClient } from "@deepgram/sdk";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { observability } from "../../services/observability.js";

export class DeepgramConfigurationError extends Error {
  constructor() {
    super("DEEPGRAM_API_KEY is not configured.");
    this.name = "DeepgramConfigurationError";
  }
}

/**
 * Raised when the voice provider cannot issue a short-lived session token.
 * The service deliberately fails closed: the server API key must never be
 * handed to the browser, so there is no fallback to the raw key.
 */
export class DeepgramTokenGrantError extends Error {
  constructor() {
    super("The voice provider could not issue a session token.");
    this.name = "DeepgramTokenGrantError";
  }
}

/** Raised when the voice provider returns no audio stream for a synthesis. */
export class DeepgramAudioUnavailableError extends Error {
  constructor() {
    super("The voice provider returned no audio.");
    this.name = "DeepgramAudioUnavailableError";
  }
}

/** Languages the voice pipeline can serve end-to-end (STT + verified Aura-2 TTS). */
export const supportedVoiceLanguages = ["en", "es", "de", "fr", "nl"] as const;
export type SupportedVoiceLanguage = (typeof supportedVoiceLanguages)[number];

export function isSupportedVoiceLanguage(language: string): language is SupportedVoiceLanguage {
  return (supportedVoiceLanguages as readonly string[]).includes(language);
}

/**
 * Verified Deepgram Aura-2 model IDs. Each model is documented publicly at
 * https://developers.deepgram.com/docs/tts-models. Voices are chosen to be
 * professional and interview-appropriate across languages.
 */
const ttsModelByLanguage: Record<SupportedVoiceLanguage, string> = {
  en: "aura-2-thalia-en",
  es: "aura-2-estrella-es",
  de: "aura-2-viktoria-de",
  fr: "aura-2-agathe-fr",
  nl: "aura-2-daphne-nl",
};

/** Returns the Aura-2 model for a language, or null when voice is not supported. */
export function ttsModelFor(language: string): string | null {
  return isSupportedVoiceLanguage(language) ? ttsModelByLanguage[language] : null;
}

export async function grantDeepgramAccessToken(environment: ServerEnvironment) {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  const client = new DeepgramClient({ apiKey: environment.DEEPGRAM_API_KEY });
  return grantDeepgramAccessTokenWithClient(client);
}

/**
 * Issues a short-lived Deepgram session token. Testable seam: the client can be
 * injected. On any failure the call throws DeepgramTokenGrantError so the caller
 * reports voice as unavailable instead of exposing the server API key.
 */
export async function grantDeepgramAccessTokenWithClient(client: DeepgramClient) {
  try {
    const grant = await observability().time(
      "voice.provider.call",
      { provider: "deepgram", capability: "grant-token" },
      () => client.auth.v1.tokens.grant(),
    );
    if (!grant.access_token) throw new Error("Token response contained no access token.");
    return grant.access_token;
  } catch (cause) {
    observability().event("voice.provider.token_grant_failed", {
      provider: "deepgram",
      reason: cause instanceof Error ? cause.message : String(cause),
    });
    throw new DeepgramTokenGrantError();
  }
}

export async function synthesizeSpeech(
  environment: ServerEnvironment,
  text: string,
  model: string,
) {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  const client = new DeepgramClient({ apiKey: environment.DEEPGRAM_API_KEY });
  const response = await observability().time(
    "voice.provider.call",
    { provider: "deepgram", capability: "text-to-speech", model },
    () =>
      client.speak.v1.audio.generate({
        text,
        model,
        encoding: "linear16",
        container: "wav",
      }),
  );
  const stream = response.stream();
  if (!stream) throw new DeepgramAudioUnavailableError();
  return stream;
}

/** Buffers a synthesized audio stream into a single Buffer for caching. */
export async function bufferAudioStream(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
