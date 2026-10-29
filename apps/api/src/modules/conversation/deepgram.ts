import { DeepgramClient } from "@deepgram/sdk";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { observability } from "../../services/observability.js";

/**
 * Deadline boundaries for voice-provider network segments (Phase 0 of the
 * voice-system roadmap). A session step must NEVER exceed its deadline: a
 * provider that never answers has to become a fast, observable failure that
 * the caller degrades on, not minutes of silent waiting.
 */
export const voiceGrantTokenDeadlineMs = 5_000;
export const voiceLiveConnectDeadlineMs = 8_000;
export const voiceTtsGenerateDeadlineMs = 6_000;
/** No TTS audio chunk for this long = the stream stalled. */
export const voiceTtsChunkIdleDeadlineMs = 6_000;

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

/** Raised when a voice-provider network segment exceeds its deadline. */
export class DeepgramDeadlineError extends Error {
  constructor(readonly segment: string, readonly deadlineMs: number) {
    super(`The voice provider did not respond within ${deadlineMs} ms (${segment}).`);
    this.name = "DeepgramDeadlineError";
  }
}

function noteDeadlineExceeded(segment: string, deadlineMs: number, cause?: unknown) {
  observability().event("voice.provider.deadline_exceeded", {
    segment,
    deadlineMs,
    reason: cause instanceof Error ? cause.message : undefined,
  });
}

/**
 * Races the operation against a hard deadline. The Deepgram SDK does not accept
 * abort signals on these calls, so the underlying request may complete later;
 * the CALLER still stops waiting at the deadline, which is the guarantee Phase 0
 * requires: no session step can hang on a provider segment.
 */
export async function withVoiceDeadline<T>(
  segment: string,
  deadlineMs: number,
  operation: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      noteDeadlineExceeded(segment, deadlineMs);
      reject(new DeepgramDeadlineError(segment, deadlineMs));
    }, deadlineMs);
    timer.unref();
  });
  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
      () =>
        withVoiceDeadline(
          "grant-token",
          voiceGrantTokenDeadlineMs,
          () => client.auth.v1.tokens.grant(),
        ),
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

/**
 * Attempts to grant a direct client token, returning null if the API key
 * lacks manage/token-grant permissions rather than failing the request.
 */
export async function tryGrantDeepgramAccessToken(
  environment: ServerEnvironment,
): Promise<string | null> {
  try {
    return await grantDeepgramAccessToken(environment);
  } catch {
    return null;
  }
}

/**
 * Creates an authoritative server-to-Deepgram live transcription stream
 * using the server's API key. This bypasses client-side token grant restrictions.
 */
export async function createDeepgramLiveStream(
  environment: ServerEnvironment,
  language: string = "en",
) {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  const client = new DeepgramClient({ apiKey: environment.DEEPGRAM_API_KEY });
  // The returned connection object itself is created synchronously; its
  // rest-open must still be bounded. The bridge listens for "open" and for a
  // connect deadline injected through this metadata (see controller), so a
  // never-opening stream degrades fast instead of stranding the client socket.
  return client.listen.v1.connect({
    model: "nova-3",
    language,
    punctuate: "true",
    interim_results: "true",
    smart_format: "true",
    endpointing: "500",
  });
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
      withVoiceDeadline("text-to-speech", voiceTtsGenerateDeadlineMs, () =>
        client.speak.v1.audio.generate({
          text,
          model,
          encoding: "linear16",
          container: "wav",
        }),
      ),
  );
  const stream = response.stream();
  if (!stream) throw new DeepgramAudioUnavailableError();
  return stream;
}

/**
 * Buffers a synthesized audio stream into a single Buffer with an idle
 * deadline: synthesis legitimately takes as long as the audio lasts, but
 * progress must be — if no chunk arrives within the idle window the stream
 * is declared stalled and the caller degrades fast.
 */
export async function bufferAudioStream(
  stream: AsyncIterable<Uint8Array>,
  idleDeadlineMs: number = voiceTtsChunkIdleDeadlineMs,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const iterator = stream[Symbol.asyncIterator]();
  for (;;) {
    let timer: NodeJS.Timeout | undefined;
    const idle = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        noteDeadlineExceeded("tts-stream-idle", idleDeadlineMs);
        reject(new DeepgramDeadlineError("tts-stream-idle", idleDeadlineMs));
      }, idleDeadlineMs);
      timer.unref();
    });
    let next;
    try {
      next = await Promise.race([iterator.next(), idle]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (next.done) break;
    chunks.push(Buffer.isBuffer(next.value) ? next.value : Buffer.from(next.value));
  }
  return Buffer.concat(chunks);
}
