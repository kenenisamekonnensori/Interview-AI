import { DeepgramClient } from "@deepgram/sdk";
import type { ServerEnvironment } from "@interviewer-ai/config";
import { observability } from "../../services/observability.js";

export class DeepgramConfigurationError extends Error {
  constructor() {
    super("DEEPGRAM_API_KEY is not configured.");
    this.name = "DeepgramConfigurationError";
  }
}

export async function grantDeepgramAccessToken(environment: ServerEnvironment) {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  const client = new DeepgramClient({ apiKey: environment.DEEPGRAM_API_KEY });
  const grant = await observability().time(
    "voice.provider.call",
    { provider: "deepgram", capability: "grant-token" },
    () => client.auth.v1.tokens.grant(),
  );
  return grant.access_token;
}

export async function synthesizeSpeech(environment: ServerEnvironment, text: string) {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  const client = new DeepgramClient({ apiKey: environment.DEEPGRAM_API_KEY });
  const response = await observability().time(
    "voice.provider.call",
    { provider: "deepgram", capability: "text-to-speech" },
    () =>
      client.speak.v1.audio.generate({
        text,
        model: "aura-2-thalia-en",
        encoding: "linear16",
        container: "wav",
      }),
  );
  return response.stream();
}
