import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEnvironment } from "@interviewer-ai/config";

import {
  DeepgramConfigurationError,
  DeepgramDeadlineError,
} from "../modules/conversation/deepgram.js";
import {
  buildAgentSettings,
  connectAgentTransport,
} from "../modules/conversation/agent-transport.js";

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
});
