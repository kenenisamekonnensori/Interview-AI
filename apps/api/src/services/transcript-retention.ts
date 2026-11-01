import type { PrismaClient } from "../../prisma/generated/client.js";

import { observability } from "./observability.js";

/**
 * Phase 4 privacy policy: transcript retention.
 *
 * The platform never stores audio (see `docs/architecture.md`). What it does
 * keep is the validated transcript, which the report and interview history read
 * from. `TRANSCRIPT_RETENTION_DAYS` lets a deployment put a hard age limit on
 * those turns for completed interviews; `0` (the default) keeps them for the
 * interview's lifetime.
 *
 * Evaluations and reports are generated minutes after completion, so the
 * default of "keep" is the safe product choice. When a retention window is
 * configured, only `conversation_turn` rows are deleted: the interview, its
 * memory and its report remain, so history and outcomes survive the transcript.
 */

export const transcriptRetentionIntervalMs = 60 * 60 * 1_000;
/** Bounds one pass so a large backlog is deleted in slices, not one huge lock. */
const batchSize = 5_000;

export type RetentionResult = { deleted: number; skipped: boolean };

export class TranscriptRetentionSweeper {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly database: PrismaClient,
    private readonly options: {
      retentionDays: number;
      intervalMs?: number;
      now?: () => number;
    },
  ) {}

  get enabled() {
    return this.options.retentionDays > 0;
  }

  start() {
    if (this.timer || !this.enabled) return;
    const interval = this.options.intervalMs ?? transcriptRetentionIntervalMs;
    this.timer = setInterval(() => void this.sweep(), interval);
    this.timer.unref();
    observability().event("transcript.retention.started", {
      retentionDays: this.options.retentionDays,
      intervalMs: interval,
    });
  }

  async stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Deletes one bounded slice of expired transcripts. Safe to call concurrently. */
  async sweep(): Promise<RetentionResult> {
    if (!this.enabled) return { deleted: 0, skipped: true };
    if (this.running) return { deleted: 0, skipped: true };
    this.running = true;
    try {
      const now = this.options.now?.() ?? Date.now();
      const cutoff = new Date(now - this.options.retentionDays * 24 * 60 * 60 * 1_000);
      const deleted = await this.database.$executeRaw`
        DELETE FROM conversation_turn
        WHERE id IN (
          SELECT turn.id
          FROM conversation_turn turn
          JOIN conversation conversation ON conversation.id = turn."conversationId"
          JOIN interview interview ON interview.id = conversation."interviewId"
          WHERE interview.status = 'COMPLETED'
            AND interview."completedAt" IS NOT NULL
            AND interview."completedAt" < ${cutoff}
          LIMIT ${batchSize}
        )
      `;
      if (deleted > 0) {
        observability().event("transcript.retention.deleted", {
          deleted,
          cutoff: cutoff.toISOString(),
        });
      }
      return { deleted: Number(deleted), skipped: false };
    } catch (error) {
      observability().error(
        "transcript.retention.failed",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return { deleted: 0, skipped: false };
    } finally {
      this.running = false;
    }
  }
}
