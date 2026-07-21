import { DeepgramClient } from "@deepgram/sdk";
import type { ServerEnvironment } from "@interviewer-ai/config";

export class DeepgramConfigurationError extends Error {
  constructor() { super("DEEPGRAM_API_KEY is not configured."); this.name = "DeepgramConfigurationError"; }
}

export async function grantDeepgramAccessToken(environment: ServerEnvironment) {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  const client = new DeepgramClient({ apiKey: environment.DEEPGRAM_API_KEY });
  const grant = await client.auth.v1.tokens.grant();
  return grant.access_token;
}
