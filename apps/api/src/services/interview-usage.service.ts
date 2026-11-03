import type { PrismaClient } from "../../prisma/generated/client.js";

import { observability } from "./observability.js";

/**
 * Per-interview provider consumption (Phase 3).
 *
 * The counters are additive and server-authoritative: they are incremented by
 * the code that actually calls the provider (agent gateway, generation path,
 * TTS synthesis) and never derived from anything the browser reports. A
 * metering failure is observed and swallowed — losing a counter is cheaper than
 * failing a live interview over telemetry.
 *
 * This is the ledger billing will read. Pricing, plan caps and invoice-period
 * conversion stay billing decisions (`UsageService` owns those), so no price
 * is stored here.
 */
export type InterviewUsageDelta = {
  /** Seconds of server-owned voice session (agent lane). */
  voiceSeconds?: number;
  /** LLM requests: interviewer turns plus post-turn assessments. */
  thinkRequests?: number;
  /** Interviewer characters actually sent to speech synthesis. */
  speakCharacters?: number;
};

export type InterviewUsageSnapshot = {
  interviewId: string;
  voiceSeconds: number;
  thinkRequests: number;
  speakCharacters: number;
};

function count(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export class InterviewUsageService {
  constructor(private readonly database: PrismaClient) {}

  async record(interviewId: string, delta: InterviewUsageDelta): Promise<void> {
    const voiceSeconds = count(delta.voiceSeconds);
    const thinkRequests = count(delta.thinkRequests);
    const speakCharacters = count(delta.speakCharacters);
    if (voiceSeconds + thinkRequests + speakCharacters === 0) return;
    try {
      await this.database.interviewUsage.upsert({
        where: { interviewId },
        create: { interviewId, voiceSeconds, thinkRequests, speakCharacters },
        update: {
          ...(voiceSeconds > 0 ? { voiceSeconds: { increment: voiceSeconds } } : {}),
          ...(thinkRequests > 0 ? { thinkRequests: { increment: thinkRequests } } : {}),
          ...(speakCharacters > 0 ? { speakCharacters: { increment: speakCharacters } } : {}),
        },
      });
    } catch (error) {
      observability().error(
        "usage.interview.record_failed",
        { interviewId },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async read(interviewId: string): Promise<InterviewUsageSnapshot | null> {
    const row = await this.database.interviewUsage.findUnique({ where: { interviewId } });
    if (!row) return null;
    return {
      interviewId: row.interviewId,
      voiceSeconds: row.voiceSeconds,
      thinkRequests: row.thinkRequests,
      speakCharacters: row.speakCharacters,
    };
  }
}
