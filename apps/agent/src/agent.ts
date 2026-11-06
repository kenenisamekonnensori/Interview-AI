import { initializeLogger, tts, voice } from "@livekit/agents";
import * as cartesia from "@livekit/agents-plugin-cartesia";
import * as deepgram from "@livekit/agents-plugin-deepgram";
import * as google from "@livekit/agents-plugin-google";
import * as silero from "@livekit/agents-plugin-silero";
import {
  buildAgentGreeting,
  buildAgentInterviewInstruction,
  type AgentInterviewInstructionInput,
} from "@interviewer-ai/prompts";

initializeLogger({ level: "info", pretty: false });

export type AgentPipelineOptions = {
  interviewId: string;
  language?: string | undefined;
  cartesiaApiKey?: string | undefined;
  deepgramApiKey?: string | undefined;
  geminiApiKey?: string | undefined;
  instructionInput?: Partial<AgentInterviewInstructionInput> | undefined;
  vad?: silero.VAD | undefined;
};

export function createTTS(options?: {
  cartesiaApiKey?: string | undefined;
  deepgramApiKey?: string | undefined;
}) {
  const cartesiaKey = options?.cartesiaApiKey ?? process.env.CARTESIA_API_KEY;
  const deepgramKey = options?.deepgramApiKey ?? process.env.DEEPGRAM_API_KEY;

  const deepgramTts = new deepgram.TTS({
    model: "aura-asteria-en",
    ...(deepgramKey ? { apiKey: deepgramKey } : {}),
  });

  if (cartesiaKey && cartesiaKey.trim().length > 0) {
    const cartesiaTts = new cartesia.TTS({
      model: "sonic-english",
      ...(cartesiaKey ? { apiKey: cartesiaKey } : {}),
    });
    return new tts.FallbackAdapter({
      ttsInstances: [cartesiaTts, deepgramTts],
    });
  }

  return deepgramTts;
}

export async function createAgentPipeline(options: AgentPipelineOptions) {
  // LiveKit VADOptions require durations in milliseconds (minSilenceDuration must be >= 250ms for TurnDetector)
  const vad =
    options.vad ??
    (await silero.VAD.load({
      minSpeechDuration: 200,
      minSilenceDuration: 600,
      prefixPaddingDuration: 500,
      activationThreshold: 0.5,
    }));

  const language = options.language ?? "en";
  const deepgramKey = options.deepgramApiKey ?? process.env.DEEPGRAM_API_KEY;
  const stt = new deepgram.STT({
    model: "nova-3",
    language,
    ...(deepgramKey ? { apiKey: deepgramKey } : {}),
  });

  const instructionInput: AgentInterviewInstructionInput = {
    interviewType: options.instructionInput?.interviewType ?? "TECHNICAL",
    difficulty: options.instructionInput?.difficulty ?? "MEDIUM",
    targetRole: options.instructionInput?.targetRole ?? "Software Engineer",
    language,
    topics: options.instructionInput?.topics ?? [],
    objectives: options.instructionInput?.objectives ?? [],
    ...options.instructionInput,
  };

  const instructions = buildAgentInterviewInstruction(instructionInput);
  const greeting = buildAgentGreeting(instructionInput);

  const geminiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY;
  const llm = new google.LLM({
    model: "gemini-2.0-flash",
    ...(geminiKey ? { apiKey: geminiKey } : {}),
  });

  const ttsInstance = createTTS({
    cartesiaApiKey: options.cartesiaApiKey,
    deepgramApiKey: options.deepgramApiKey,
  });

  const agent = new voice.Agent({
    instructions,
    vad,
    stt,
    llm,
    tts: ttsInstance,
  });

  return {
    agent,
    vad,
    stt,
    llm,
    tts: ttsInstance,
    greeting,
    instructionInput,
  };
}
