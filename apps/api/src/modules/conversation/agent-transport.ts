import WebSocket from "ws";

import type { ServerEnvironment } from "@interviewer-ai/config";

import { observability } from "../../services/observability.js";
import {
  DeepgramConfigurationError,
  ttsModelFor,
  voiceLiveConnectDeadlineMs,
  withVoiceDeadline,
} from "./deepgram.js";

/**
 * Deepgram Voice Agent transport (Phase 1 of the voice-system roadmap).
 *
 * ONE WebSocket to `agent.deepgram.com/v1/agent/converse` carries the whole
 * conversational loop: our API streams the candidate's audio in, and receives
 * speech events, agent text and binary audio out. The server never exposes a
 * credential to the browser; this connection is the session's conversational
 * core (see docs/voice-system-roadmap.md).
 */

export const deepgramAgentUrl = "wss://agent.deepgram.com/v1/agent/converse";

export type AgentTransportSettings = {
  language: string;
  geminiModel: string;
  /** Ordered think fallbacks after the primary model (Phase 2). */
  geminiFallbackModels?: string[];
  instruction: string;
  /** Persisted turns replayed as provider-native history on reconnect. */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /**
   * Verbatim first words, spoken by the provider immediately after
   * SettingsApplied without involving the think model. Used only on a fresh
   * session: a reconnect has history and must not be greeted again.
   */
  greeting?: string | null;
  /** Minimized context pack fetched once by the gateway before connect. */
  resumeSummary?: string | null;
  resumeSkills?: string[];
  jobRequiredSkills?: string[];
  /** Stable provider credentials context supplied by the gateway. */
  thinkHeaders?: Record<string, string>;
};

export type AgentTransportEvents = {
  /** SettingsApplied was received: audio streaming and injections may begin. */
  onReady: () => void;
  onUserStartedSpeaking: () => void;
  /** One finalized user statement (ConversationText, role "user"). */
  onUserStatement: (text: string) => void;
  /** The agent started thinking: the user's turn is complete. */
  onAgentThinking: () => void;
  /** The agent began emitting speech (audio may still be generating). */
  onAgentStartedSpeaking?: () => void;
  /** The provider refused an injected message; the turn was not produced. */
  onInjectionRefused?: (reason?: string) => void;
  /** One spoken agent statement (ConversationText, role "assistant"). */
  onAgentStatement: (text: string) => void;
  /** One chunk of synthesized agent audio (linear16 PCM frames). */
  onAgentAudio: (chunk: Buffer) => void;
  onAgentAudioDone: () => void;
  /** Non-fatal provider warning; the code identifies the failing stage. */
  onWarning: (summary: string, code?: string) => void;
  onThinkUpdated?: () => void;
  /** A terminal provider error; the session is unusable after this. */
  onError: (summary: string, code?: string) => void;
  onClose: (code: number, reason: string) => void;
};

export type AgentTransport = {
  /** Streams candidate mic audio (linear16 16 kHz PCM) into the agent session. */
  sendAudio: (chunk: Buffer) => void;
  /** Sends the deterministic opening instruction (the spoken greeting trigger). */
  injectUserMessage: (content: string) => void;
  /** Replace the live think config with a fresh context-aware instruction. */
  updateThinkPrompt: (instruction: string, headers?: Record<string, string>) => void;
  sendKeepAlive: () => void;
  close: () => void;
};

type AgentServerEvent = {
  type?: string;
  role?: string;
  content?: string;
  message?: string;
  description?: string;
  code?: string;
};

/**
 * The think chain is `GEMINI_MODEL` followed by the configured fallbacks,
 * de-duplicated and order-preserving. Deepgram tries the entries in order, so
 * a quota-exhausted primary model no longer ends the interview.
 */
export function resolveThinkModels({
  geminiModel,
  geminiFallbackModels,
}: {
  geminiModel: string;
  geminiFallbackModels?: string[] | undefined;
}): string[] {
  return [
    ...new Set([geminiModel, ...(geminiFallbackModels ?? [])].map((model) => model.trim())),
  ].filter(Boolean);
}

/** Build the `Settings` payload for the agent connect + think + speak pipeline. */
function buildThinkInstruction(
  instruction: string,
  context: {
    resumeSummary?: string | null;
    resumeSkills?: string[];
    jobRequiredSkills?: string[];
  },
) {
  const contextLines = [
    context.resumeSummary ? `Candidate resume summary: ${context.resumeSummary}` : null,
    context.resumeSkills?.length ? `Candidate skills: ${context.resumeSkills.join(", ")}.` : null,
    context.jobRequiredSkills?.length
      ? `Job requirements: ${context.jobRequiredSkills.join(", ")}.`
      : null,
  ].filter((line): line is string => Boolean(line));
  if (contextLines.length === 0) return instruction;
  return `${instruction}\n\n### Candidate context\n${contextLines.map((line) => `- ${line}`).join("\\n")}`;
}

function buildThinkSettings(
  environment: ServerEnvironment,
  geminiModel: string,
  instruction: string,
  headers?: Record<string, string>,
) {
  return {
    provider: { type: "google", temperature: 0.6 },
    endpoint: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse`,
      headers: headers ?? { "x-goog-api-key": environment.GEMINI_API_KEY! },
    },
    prompt: instruction,
  };
}

/**
 * One think provider is a plain object; a fallback chain is the ordered array
 * form Deepgram retries in sequence.
 */
function buildThinkChain(
  environment: ServerEnvironment,
  models: string[],
  instruction: string,
  headers?: Record<string, string>,
) {
  const chain = models.map((model) => buildThinkSettings(environment, model, instruction, headers));
  return chain.length > 1 ? chain : chain[0];
}

export function buildAgentSettings(
  environment: ServerEnvironment,
  settings: AgentTransportSettings,
): Record<string, unknown> {
  const {
    language,
    geminiModel,
    geminiFallbackModels,
    instruction,
    history,
    greeting,
    resumeSummary,
    resumeSkills,
    jobRequiredSkills,
  } = settings;
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  if (!environment.GEMINI_API_KEY)
    throw new Error("The AI provider is not configured (GEMINI_API_KEY missing).");
  const speakModel = ttsModelFor(language);
  if (!speakModel) throw new Error(`Voice is not available in ${language}.`);
  return {
    type: "Settings",
    audio: {
      input: { encoding: "linear16", sample_rate: 16_000 },
      output: { encoding: "linear16", sample_rate: 24_000, container: "none" },
    },
    agent: {
      ...(greeting ? { greeting } : {}),
      ...(history && history.length > 0
        ? {
            context: {
              messages: history.map((message) => ({
                type: "History",
                role: message.role,
                content: message.content,
              })),
            },
          }
        : {}),
      listen: {
        provider: { type: "deepgram", model: "nova-3", language },
      },
      think: buildThinkChain(
        environment,
        resolveThinkModels({ geminiModel, geminiFallbackModels }),
        buildThinkInstruction(instruction, {
          ...(resumeSummary !== undefined ? { resumeSummary } : {}),
          ...(resumeSkills !== undefined ? { resumeSkills } : {}),
          ...(jobRequiredSkills !== undefined ? { jobRequiredSkills } : {}),
        }),
      ),
      speak: {
        provider: { type: "deepgram", version: "v1", model: speakModel },
      },
    },
  };
}

export class AgentTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentTransportError";
  }
}

/**
 * Opens the agent session and resolves only after `SettingsApplied`: callers
 * may stream audio and inject messages from then on. Every setup phase is
 * deadline-bounded so a dead provider degrades into a typed failure instead of
 * a hanging session (Phase 0 rules apply to the new pipeline too).
 */
export async function connectAgentTransport(
  environment: ServerEnvironment,
  settings: AgentTransportSettings,
  events: AgentTransportEvents,
): Promise<AgentTransport> {
  if (!environment.DEEPGRAM_API_KEY) throw new DeepgramConfigurationError();
  if (!environment.GEMINI_API_KEY)
    throw new Error("The AI provider is not configured (GEMINI_API_KEY missing).");

  const socket = new WebSocket(deepgramAgentUrl, {
    headers: { Authorization: `Token ${environment.DEEPGRAM_API_KEY}` },
  });

  let setupFailed = false;
  let ready = false;
  let readyResolve: (() => void) | undefined;

  const fail = (summary: string, code?: string) => {
    if (!ready && !setupFailed) {
      setupFailed = true;
      observability().event("voice.agent.setup_failed", { reason: summary, code });
    }
    events.onError(summary, code);
  };

  socket.on("open", () => {
    // Nothing precedes the server's Welcome; Settings goes out on its arrival.
  });

  socket.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
    if (isBinary) {
      events.onAgentAudio(data as Buffer);
      return;
    }
    let parsed: AgentServerEvent;
    try {
      parsed = JSON.parse(data.toString()) as AgentServerEvent;
    } catch {
      return;
    }
    switch (parsed.type) {
      case "Welcome":
        socket.send(JSON.stringify(buildAgentSettings(environment, settings)));
        break;
      case "SettingsApplied":
        ready = true;
        readyResolve?.();
        events.onReady();
        break;
      case "UserStartedSpeaking":
        events.onUserStartedSpeaking();
        break;
      case "ConversationText": {
        if (typeof parsed.content === "string" && parsed.content.length > 0) {
          if (parsed.role === "assistant") events.onAgentStatement(parsed.content);
          else if (parsed.role === "user") events.onUserStatement(parsed.content);
        }
        break;
      }
      case "AgentThinking":
        events.onAgentThinking();
        break;
      case "AgentStartedSpeaking":
        events.onAgentStartedSpeaking?.();
        break;
      case "InjectionRefused":
        events.onInjectionRefused?.(
          parsed.description ?? parsed.message ?? "The voice provider refused the injection.",
        );
        break;
      case "AgentAudioDone":
        events.onAgentAudioDone();
        break;
      case "Warning":
        events.onWarning(
          parsed.description ?? parsed.message ?? "The voice provider sent a warning.",
          parsed.code,
        );
        break;
      case "ThinkUpdated":
        events.onThinkUpdated?.();
        break;
      case "Error":
        fail(
          parsed.description ?? parsed.message ?? "The voice provider returned an error.",
          parsed.code,
        );
        break;
      default:
        break;
    }
  });

  socket.on("error", (err: unknown) => {
    fail(err instanceof Error ? err.message : "The voice agent connection failed.");
  });

  socket.on("close", (code: number, reason: Buffer) => {
    const summary = reason.toString().trim();
    if (!ready) {
      // Never became ready: surface a setup failure only if none was reported.
      fail(`The voice agent closed during setup (${code}).`);
      return;
    }
    observability().event("voice.agent.closed", { code, reason: summary || undefined });
    events.onClose(code, summary);
  });

  observability().event("voice.agent.connecting", { language: settings.language });
  await withVoiceDeadline("agent-open", voiceLiveConnectDeadlineMs, async () => {
    await new Promise<void>((resolve) => {
      socket.once("message", () => resolve());
    });
  });

  // Wait for SettingsApplied under the same connection deadline family: the
  // whole setup must fit inside bounded time even if the Welcome arrived.
  await withVoiceDeadline("agent-setup", voiceLiveConnectDeadlineMs, async () => {
    if (ready) return;
    await new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      socket.once("close", (code: number) =>
        reject(new AgentTransportError(`The voice agent closed during setup (${code}).`)),
      );
      socket.once("error", reject);
    });
  });

  observability().event("voice.agent.ready", { language: settings.language });

  return {
    sendAudio: (chunk: Buffer) => {
      if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true });
    },
    injectUserMessage: (content: string) =>
      socket.send(JSON.stringify({ type: "InjectUserMessage", content })),
    updateThinkPrompt: (instruction: string, headers?: Record<string, string>) =>
      socket.send(
        JSON.stringify({
          type: "UpdateThink",
          // A refresh must keep the fallback chain: dropping it on the first
          // turn would silently remove the quota protection mid-interview.
          think: buildThinkChain(
            environment,
            resolveThinkModels(settings),
            buildThinkInstruction(instruction, settings),
            headers ?? settings.thinkHeaders,
          ),
        }),
      ),
    sendKeepAlive: () => socket.send(JSON.stringify({ type: "KeepAlive" })),
    close: () => {
      try {
        socket.close(1000, "interview closed");
      } catch {
        // already closed
      }
    },
  };
}
