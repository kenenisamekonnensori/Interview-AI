import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnvironment } from "@interviewer-ai/config";

import {
  DeepgramConfigurationError,
  DeepgramDeadlineError,
} from "../modules/conversation/deepgram.js";
import {
  buildAgentSettings,
  connectAgentTransport,
  resolveThinkModels,
} from "../modules/conversation/agent-transport.js";
import {
  agentDegradedNotice,
  isThinkProviderWarning,
  shouldDegradeAgentSession,
} from "../modules/conversation/agent-recovery.js";

/**
 * Phase 1 agent-pipeline guards: the outbound Settings payload must carry the
 * exact pipeline configuration, and the transport setup must stay
 * deadline-bounded — a silent provider fails fast instead of hanging the
 * session, and audio streaming only starts after SettingsApplied.
 */

const captured = vi.hoisted(() => ({
  sockets: [] as Array<{
    url: string;
    options?: unknown;
    readyState: number;
    sentMessages: Array<string | Buffer>;
    close: (code?: number, reason?: string) => void;
    emit: (event: string, ...args: unknown[]) => boolean;
    emitMessage: (data: unknown) => void;
  }>,
  reset() {
    this.sockets.length = 0;
  },
}));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeAgentSocket extends EventEmitter {
    readyState = 1;
    sentMessages: Array<string | Buffer> = [];
    close = vi.fn();
    constructor(
      public url: string,
      public options?: unknown,
    ) {
      super();
      captured.sockets.push(this);
    }
    send = (data: string | Buffer) => {
      this.sentMessages.push(data);
    };
    /** Drive a provider event through the transport handlers. */
    emitMessage(data: unknown) {
      this.emit("message", data, false);
    }
  }
  return { default: FakeAgentSocket };
});

const environment = {
  DEEPGRAM_API_KEY: "dg-key",
  GEMINI_API_KEY: "gemini-key",
  GEMINI_MODEL: "gemini-3.5-flash-lite",
} as unknown as ServerEnvironment;

describe("buildAgentSettings", () => {
  it("configures the full converse pipeline for the interview language", () => {
    const settings = buildAgentSettings(environment, {
      language: "en",
      geminiModel: "gemini-3.5-flash-lite",
      instruction: "You are the interviewer.",
    }) as Record<string, unknown>;
    expect(settings.type).toBe("Settings");
    const audio = settings.audio as {
      input: { encoding: string; sample_rate: number };
      output: { encoding: string; sample_rate: number; container: string };
    };
    expect(audio.input).toEqual({ encoding: "linear16", sample_rate: 16_000 });
    expect(audio.output).toEqual({
      encoding: "linear16",
      sample_rate: 24_000,
      container: "none",
    });
    const agent = settings.agent as {
      listen: { provider: { type: string; model: string; language: string } };
      think: { endpoint: { url: string } };
      speak: { provider: { model: string } };
    };
    expect(agent.listen.provider).toEqual({
      type: "deepgram",
      model: "nova-3",
      language: "en",
    });
    expect(agent.think.endpoint.url).toContain("gemini-3.5-flash-lite:streamGenerateContent");
    expect(agent.speak.provider.model).toBe("aura-2-thalia-en");
  });

  it("speaks the verbatim greeting before any LLM turn on a fresh session", () => {
    const settings = buildAgentSettings(environment, {
      language: "en",
      geminiModel: "gemini-3.5-flash-lite",
      instruction: "You are the interviewer.",
      greeting: "Hi, and welcome. Let's start with caching: walk me through it.",
    }) as { agent: { greeting?: string } };
    expect(settings.agent.greeting).toBe(
      "Hi, and welcome. Let's start with caching: walk me through it.",
    );
  });

  it("omits the greeting on a resumed session so it is not repeated", () => {
    const settings = buildAgentSettings(environment, {
      language: "en",
      geminiModel: "gemini-3.5-flash-lite",
      instruction: "You are the interviewer.",
      history: [{ role: "assistant", content: "Tell me about caching." }],
    }) as { agent: { greeting?: string; context?: unknown } };
    expect(settings.agent.greeting).toBeUndefined();
    expect(settings.agent.context).toBeDefined();
  });

  it("sends the per-session instruction as the think prompt", () => {
    const settings = buildAgentSettings(environment, {
      language: "de",
      geminiModel: "gemini-3.5-flash-lite",
      instruction: "Interviewer instruction for de.",
    });
    const agent = settings.agent as {
      think: { prompt: string };
      speak: { provider: { model: string } };
    };
    expect(agent.think.prompt).toBe("Interviewer instruction for de.");
    expect(agent.speak.provider.model).toBe("aura-2-viktoria-de");
  });

  it("refuses to run without the required API keys", () => {
    expect(() =>
      buildAgentSettings(
        { DEEPGRAM_API_KEY: "dg-key", GEMINI_API_KEY: undefined } as unknown as ServerEnvironment,
        { language: "en", geminiModel: "m", instruction: "i" },
      ),
    ).toThrowError(/GEMINI_API_KEY/);
    expect(() =>
      buildAgentSettings({ DEEPGRAM_API_KEY: undefined } as unknown as ServerEnvironment, {
        language: "en",
        geminiModel: "m",
        instruction: "i",
      }),
    ).toThrowError(DeepgramConfigurationError);
  });

  it("sends the primary model followed by the configured fallbacks as one ordered chain", () => {
    const settings = buildAgentSettings(environment, {
      language: "en",
      geminiModel: "gemini-3.5-flash-lite",
      geminiFallbackModels: ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"],
      instruction: "You are the interviewer.",
    }) as { agent: { think: Array<{ endpoint: { url: string } }> } };
    // Order is preserved and duplicates collapse: the primary model is listed once.
    expect(Array.isArray(settings.agent.think)).toBe(true);
    expect(settings.agent.think.map((entry) => entry.endpoint.url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    ]);
  });

  it("keeps a single think provider when no extra fallbacks are configured", () => {
    const settings = buildAgentSettings(environment, {
      language: "en",
      geminiModel: "gemini-3.5-flash-lite",
      instruction: "You are the interviewer.",
    }) as { agent: { think: unknown } };
    expect(Array.isArray(settings.agent.think)).toBe(false);
    expect(resolveThinkModels({ geminiModel: "m1", geminiFallbackModels: [] })).toEqual(["m1"]);
    expect(resolveThinkModels({ geminiModel: "m1", geminiFallbackModels: ["m2", "m1"] })).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("rejects a language without a supported TTS model", () => {
    expect(() =>
      buildAgentSettings(environment, {
        language: "ja",
        geminiModel: "m",
        instruction: "i",
      }),
    ).toThrowError(/ja/);
  });
});

describe("connectAgentTransport setup", () => {
  afterEach(() => {
    vi.useRealTimers();
    captured.reset();
  });

  function silentEvents() {
    return {
      onReady: () => {},
      onUserStartedSpeaking: () => {},
      onUserStatement: () => {},
      onAgentThinking: () => {},
      onAgentStatement: () => {},
      onAgentAudio: () => {},
      onAgentAudioDone: () => {},
      onWarning: () => {},
      onError: () => {},
      onClose: () => {},
    };
  }

  it("waits for SettingsApplied before the caller may stream audio", async () => {
    const ready = vi.fn();
    const transportPromise = connectAgentTransport(
      environment,
      { language: "en", geminiModel: "gemini-3.5-flash-lite", instruction: "teach" },
      { ...silentEvents(), onReady: ready },
    );

    expect(captured.sockets).toHaveLength(1);
    const socket = captured.sockets[0];
    if (!socket) throw new Error("No agent socket was created.");
    expect(socket.url).toBe("wss://agent.deepgram.com/v1/agent/converse");
    expect(socket.options).toMatchObject({
      headers: { Authorization: "Token dg-key" },
    });

    socket.emitMessage(Buffer.from(JSON.stringify({ type: "Welcome" })));
    // Settings goes out as the first outbound message on Welcome arrival.
    const sent = socket.sentMessages as string[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('"type":"Settings"');

    socket.emitMessage(Buffer.from(JSON.stringify({ type: "SettingsApplied" })));
    const transport = await transportPromise;
    expect(ready).toHaveBeenCalledOnce();
    // The greeting injection is the gateway's job after onReady fires.
    expect(transport.sendAudio).toBeTypeOf("function");
    expect(transport.injectUserMessage).toBeTypeOf("function");
  });

  it("fails fast when the provider never completes setup", async () => {
    vi.useFakeTimers();
    const assertion = expect(
      connectAgentTransport(
        environment,
        { language: "en", geminiModel: "gemini-3.5-flash-lite", instruction: "teach" },
        silentEvents(),
      ),
    ).rejects.toBeInstanceOf(DeepgramDeadlineError);
    await vi.advanceTimersByTimeAsync(9_000);
    await assertion;
  });

  it("keeps the fallback chain after a mid-interview think refresh", async () => {
    const transportPromise = connectAgentTransport(
      environment,
      {
        language: "en",
        geminiModel: "gemini-3.5-flash-lite",
        geminiFallbackModels: ["gemini-2.5-flash"],
        instruction: "teach",
      },
      silentEvents(),
    );
    const socket = captured.sockets[0];
    if (!socket) throw new Error("No agent socket was created.");
    socket.emitMessage(Buffer.from(JSON.stringify({ type: "Welcome" })));
    socket.emitMessage(Buffer.from(JSON.stringify({ type: "SettingsApplied" })));
    const transport = await transportPromise;

    transport.updateThinkPrompt("Fresh memory digest.");
    const update = JSON.parse(String(socket.sentMessages.at(-1))) as {
      type: string;
      think: Array<{ endpoint: { url: string }; prompt: string }>;
    };
    expect(update.type).toBe("UpdateThink");
    expect(update.think.map((entry) => entry.endpoint.url)).toEqual([
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    ]);
    expect(update.think[0]?.prompt).toBe("Fresh memory digest.");
  });

  it("forwards provider warning and error codes so the gateway can classify them", async () => {
    const onWarning = vi.fn();
    const onError = vi.fn();
    const transportPromise = connectAgentTransport(
      environment,
      { language: "en", geminiModel: "gemini-3.5-flash-lite", instruction: "teach" },
      { ...silentEvents(), onWarning, onError },
    );
    const socket = captured.sockets[0];
    if (!socket) throw new Error("No agent socket was created.");
    socket.emitMessage(Buffer.from(JSON.stringify({ type: "Welcome" })));
    socket.emitMessage(Buffer.from(JSON.stringify({ type: "SettingsApplied" })));
    await transportPromise;

    socket.emitMessage(
      Buffer.from(
        JSON.stringify({
          type: "Warning",
          description: "The think provider rejected the request.",
          code: "THINK_REQUEST_FAILED",
        }),
      ),
    );
    expect(onWarning).toHaveBeenCalledWith(
      "The think provider rejected the request.",
      "THINK_REQUEST_FAILED",
    );

    socket.emitMessage(
      Buffer.from(
        JSON.stringify({
          type: "Error",
          description: "Failed to think.",
          code: "FAILED_TO_THINK",
        }),
      ),
    );
    expect(onError).toHaveBeenCalledWith("Failed to think.", "FAILED_TO_THINK");
  });
});

describe("degraded agent recovery", () => {
  it("degrades only after the think/speak stage is exhausted", () => {
    expect(shouldDegradeAgentSession("FAILED_TO_THINK")).toBe(true);
    expect(shouldDegradeAgentSession("FAILED_TO_SPEAK")).toBe(true);
    // Transport, settings and timing failures keep the normal close path.
    expect(shouldDegradeAgentSession("INTERNAL_SERVER_ERROR")).toBe(false);
    expect(shouldDegradeAgentSession("USER_AUDIO_FORMAT")).toBe(false);
    expect(shouldDegradeAgentSession(undefined)).toBe(false);
  });

  it("treats think-stage warnings as observable, not terminal", () => {
    expect(isThinkProviderWarning("THINK_REQUEST_FAILED")).toBe(true);
    expect(isThinkProviderWarning("SLOW_THINK_REQUEST")).toBe(true);
    expect(isThinkProviderWarning("SPEAK_REQUEST_FAILED")).toBe(false);
    expect(isThinkProviderWarning(undefined)).toBe(false);
  });

  it("returns the candidate to text with a fixed notice per language", () => {
    const english = agentDegradedNotice("en");
    expect(english).toContain("text");
    // The notice is a canned instruction, never a fabricated interview answer.
    expect(english.endsWith("?")).toBe(false);
    expect(agentDegradedNotice("de")).toContain("schriftlich");
    expect(agentDegradedNotice("es")).toContain("por escrito");
    // Unknown languages fall back to English rather than speaking nothing.
    expect(agentDegradedNotice("ja")).toBe(english);
  });
});
