import { cli, defineAgent, type JobContext, type JobRequest, ServerOptions, voice } from "@livekit/agents";
import { createAgentPipeline } from "./agent.js";
import dotenv from "dotenv";

dotenv.config();

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name ?? "";
    const interviewId = roomName.replace(/^interview-/, "");

    const pipeline = await createAgentPipeline({
      interviewId,
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

if (process.argv[1] && process.argv[1].endsWith("index.ts")) {
  cli.runApp(createServerOptions(new URL("./index.ts", import.meta.url).pathname));
}
