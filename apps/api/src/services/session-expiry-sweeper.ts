import type { PrismaClient } from "../../prisma/generated/client.js";

import { observability } from "./observability.js";

/**
 * Phase 3 duration enforcement: no interview may stay IN_PROGRESS forever.
 *
 * A live session closes itself at the cap (the agent gateway injects a short
 * goodbye, the legacy lane completes on its next request). This sweeper is the
 * safety net for the sessions nobody is watching: a closed tab, a lost phone,
 * a crashed gateway. It finds interviews whose `startedAt + durationMinutes`
 * has passed and runs the ordinary completion path, which marks the interview
 * COMPLETING and queues report generation — so an abandoned session still
 * produces the report its answers earned.
 *
 * A grace period matters: it lets a live gateway say goodbye through the normal
 * turn pipeline before the server completes the interview underneath it, and
 * `requestCompletion` is atomically claimed, so duplicate sweeps and concurrent
 * user completions are safe.
 */

export const sessionSweepIntervalMs = 60_000;
/** Let the live session close itself before the server completes it. */
export const sessionSweepGraceMs = 60_000;
const defaultBatchSize = 25;

export type ExpiredSessionRow = { id: string; userId: string };

type InterviewCompletionPort = {
  requestCompletion(id: string, userId: string): Promise<unknown>;
};

export type SweepResult = { expired: number; completed: number; failed: number };

export class InterviewSessionSweeper {
  private timer: NodeJS.Timeout | null = null;
  private sweeping = false;

  constructor(
    private readonly database: PrismaClient,
    private readonly interviews: InterviewCompletionPort,
    private readonly options: {
      intervalMs?: number;
      graceMs?: number;
      batchSize?: number;
      now?: () => number;
    } = {},
  ) {}

  start() {
    if (this.timer) return;
    const intervalMs = this.options.intervalMs ?? sessionSweepIntervalMs;
    this.timer = setInterval(() => void this.sweep(), intervalMs);
    // A recurring maintenance timer must never hold the process open.
    this.timer.unref();
    observability().event("interview.sweeper.started", { intervalMs });
  }

  async stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** One bounded pass. Safe to call concurrently: overlapping runs are skipped. */
  async sweep(): Promise<SweepResult> {
    if (this.sweeping) return { expired: 0, completed: 0, failed: 0 };
    this.sweeping = true;
    try {
      const now = this.options.now?.() ?? Date.now();
      const cutoff = new Date(now - (this.options.graceMs ?? sessionSweepGraceMs));
      const rows = await this.findExpired(cutoff, this.options.batchSize ?? defaultBatchSize);
      let completed = 0;
      let failed = 0;
      for (const row of rows) {
        try {
          await this.interviews.requestCompletion(row.id, row.userId);
          completed += 1;
        } catch (error) {
          failed += 1;
          observability().error(
            "interview.sweeper.completion_failed",
            { interviewId: row.id },
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }
      if (rows.length > 0) {
        observability().event("interview.sweeper.swept", {
          expired: rows.length,
          completed,
          failed,
        });
      }
      return { expired: rows.length, completed, failed };
    } catch (error) {
      observability().error(
        "interview.sweeper.failed",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );
      return { expired: 0, completed: 0, failed: 0 };
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * The expiry is computed in SQL so the limit applies to expired rows only —
   * selecting the oldest IN_PROGRESS rows first would let one long interview
   * starve short ones out of the batch.
   */
  private findExpired(cutoff: Date, batchSize: number): Promise<ExpiredSessionRow[]> {
    return this.database.$queryRaw<ExpiredSessionRow[]>`
      SELECT id, "userId"
      FROM interview
      WHERE status = 'IN_PROGRESS'
        AND "startedAt" IS NOT NULL
        AND "startedAt" + make_interval(mins => "durationMinutes") <= ${cutoff}
      ORDER BY "startedAt" ASC
      LIMIT ${batchSize}
    `;
  }
}
