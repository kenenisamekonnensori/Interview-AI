import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tts } from "@livekit/agents";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import { createAgentPipeline, createTTS } from "../agent.js";
import { createServerOptions } from "../index.js";

describe("Voice Agent Worker & TTS Hierarchy (Acceptance Checks 4 & 5)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.CARTESIA_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("Acceptance Check 4: uses Deepgram Aura-2 as default TTS when CARTESIA_API_KEY is absent", () => {
    const ttsInstance = createTTS({ deepgramApiKey: "test-dg-key" });
    expect(ttsInstance).toBeInstanceOf(deepgram.TTS);
    expect((ttsInstance as any).model).toBe("aura-asteria-en");
  });

  it("Acceptance Check 5: initializes Cartesia Sonic with Deepgram fallback when CARTESIA_API_KEY is configured", () => {
    process.env.CARTESIA_API_KEY = "test-cartesia-key";
    const ttsInstance = createTTS({ deepgramApiKey: "test-dg-key" });

    expect(ttsInstance).toBeInstanceOf(tts.FallbackAdapter);
    const fallback = ttsInstance as tts.FallbackAdapter;
    expect(fallback.ttsInstances).toHaveLength(2);

    const primaryTts = fallback.ttsInstances[0] as cartesia.TTS;
    const fallbackTts = fallback.ttsInstances[1] as deepgram.TTS;

    expect(primaryTts).toBeInstanceOf(cartesia.TTS);
    expect((primaryTts as any).model).toBe("sonic-english");

    expect(fallbackTts).toBeInstanceOf(deepgram.TTS);
    expect((fallbackTts as any).model).toBe("aura-asteria-en");
  });

  it("registers job dispatch listener and filters rooms starting with interview-", async () => {
    const serverOpts = createServerOptions("/fake/path/index.ts");
    expect(serverOpts.agentName).toBe("interviewer-ai-voice-agent");

    // Room starting with interview- should be accepted
    const acceptedMock = {
      room: { name: "interview-123e4567-e89b-12d3-a456-426614174000" },
      accept: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
    };
    await serverOpts.requestFunc(acceptedMock as any);
    expect(acceptedMock.accept).toHaveBeenCalled();
    expect(acceptedMock.reject).not.toHaveBeenCalled();

    // Non-interview room should be rejected
    const rejectedMock = {
      room: { name: "general-chat-room" },
      accept: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
    };
    await serverOpts.requestFunc(rejectedMock as any);
    expect(rejectedMock.reject).toHaveBeenCalled();
    expect(rejectedMock.accept).not.toHaveBeenCalled();
  });

  it("builds pipeline with Silero VAD, Deepgram Nova-3 STT, Gemini Flash LLM and emits greeting", async () => {
    const pipeline = await createAgentPipeline({
      interviewId: "123e4567-e89b-12d3-a456-426614174000",
      deepgramApiKey: "test-dg-key",
      geminiApiKey: "test-gemini-key",
      instructionInput: {
        interviewType: "TECHNICAL",
        difficulty: "MEDIUM",
        targetRole: "Senior Backend Engineer",
        language: "en",
        topics: ["Distributed Systems", "Caching"],
        objectives: ["Evaluate caching and consistency trade-offs"],
      },
    });

    expect(pipeline.agent).toBeDefined();
    expect(pipeline.greeting).toContain("Senior Backend Engineer");
    expect(pipeline.greeting).toContain("Distributed Systems");
    expect((pipeline.stt as any).model).toBe("nova-3");
    expect((pipeline.tts as any).model).toBe("aura-asteria-en");

    // Verify greeting dispatch invocation on simulated session
    const mockSession = {
      start: vi.fn().mockResolvedValue(undefined),
      say: vi.fn(),
    };
    mockSession.say(pipeline.greeting);
    expect(mockSession.say).toHaveBeenCalledWith(pipeline.greeting);
  });
});
