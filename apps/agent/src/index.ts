import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cli,
  defineAgent,
  type JobContext,
  type JobProcess,
  type JobRequest,
  ServerOptions,
  voice,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import { createAgentPipeline } from "./agent.js";
import dotenv from "dotenv";

const candidatePaths = [
  process.env.DOTENV_CONFIG_PATH,
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(new URL(".", import.meta.url).pathname, "../../../.env"),
].filter(Boolean) as string[];

for (const path of candidatePaths) {
  if (existsSync(path)) {
    dotenv.config({ path });
  }
}
dotenv.config();

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Pre-load Silero VAD neural network weights on worker startup
    proc.userData.vad = await silero.VAD.load({
      minSpeechDuration: 200,
      minSilenceDuration: 600,
      prefixPaddingDuration: 500,
      activationThreshold: 0.5,
    });
  },
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name ?? "";
    const interviewId = roomName.replace(/^interview-/, "");

    const pipeline = await createAgentPipeline({
      interviewId,
      vad: ctx.proc.userData.vad as silero.VAD | undefined,
    });

    await ctx.connect();

    // Wait for candidate participant to connect
    await ctx.waitForParticipant();

    const session = new voice.AgentSession();
    await session.start({ agent: pipeline.agent, room: ctx.room });

    // Emit opening greeting upon candidate connection
    session.say(pipeline.greeting);
  },
});

export function createServerOptions(agentEntryPath: string) {
  return new ServerOptions({
    agent: agentEntryPath,
    agentName: "interviewer-ai-voice-agent",
    numIdleProcesses: 1,
    initializeProcessTimeout: 60_000,
    requestFunc: async (req: JobRequest) => {
      const roomName = req.room?.name ?? "";
      if (roomName.startsWith("interview-")) {
        await req.accept();
      } else {
        await req.reject();
      }
    },
  });
}

const currentFilePath = fileURLToPath(import.meta.url);
const entryArg = process.argv[1];
const isDirectlyExecuted =
  entryArg !== undefined &&
  (entryArg.endsWith("index.ts") ||
    entryArg.endsWith("index.js") ||
    entryArg === currentFilePath);

if (isDirectlyExecuted) {
  cli.runApp(createServerOptions(currentFilePath));
}
