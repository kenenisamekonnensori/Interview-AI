import { randomUUID } from "node:crypto";

import Redis from "ioredis";

import { createRedisConnectionOptions } from "./redis-connection.js";
import { observability } from "./observability.js";

/**
 * Phase 4 concurrency management for server-owned voice sessions.
 *
 * Every live agent session holds one Deepgram Voice Agent socket and one
 * speech pipeline on our side. Deepgram plans are priced and limited per
 * concurrent session, so an unbounded number of tabs must not be able to
 * exhaust the deployment.
 *
 * When Redis is configured the count is shared across instances; otherwise it
 * is per process (the same blast radius as the in-process session director).
 * The acquire is a single Lua script so two instances cannot both take the
 * last slot. Entries expire on their own after `staleAfterMs`, which makes a
 * crashed process harmless: its slots are reclaimed, not leaked.
 */

export type VoiceConcurrencyLease = { release: () => Promise<void> };

export type VoiceConcurrencyDenial = { active: number; limit: number };

export class VoiceConcurrencyLimiter {
  private readonly instanceId = randomUUID();
  private readonly active = new Set<string>();
  private readonly key = "voice:active_sessions";
  private readonly redis: Redis | undefined;
  private readonly renewal: NodeJS.Timeout;
  private readonly staleAfterMs: number;

  constructor(
    redisUrl: string | undefined,
    private readonly limit: number,
    options: { staleAfterMs?: number; renewIntervalMs?: number } = {},
  ) {
    this.staleAfterMs = options.staleAfterMs ?? 180_000;
    this.redis = redisUrl
      ? new Redis(createRedisConnectionOptions(redisUrl, { worker: true }))
      : undefined;
    this.redis?.on("error", (error) =>
      observability().event("voice.concurrency.redis_error", { reason: error.message }),
    );
    const interval = options.renewIntervalMs ?? 60_000;
    this.renewal = setInterval(() => void this.renew(), interval);
    this.renewal.unref();
  }

  /** Returns a lease when a slot is available, or the current capacity. */
  async acquire(): Promise<VoiceConcurrencyLease | VoiceConcurrencyDenial> {
    const id = `${this.instanceId}:${randomUUID()}`;
    if (!this.redis) {
      if (this.active.size >= this.limit) return { active: this.active.size, limit: this.limit };
      this.active.add(id);
      return {
        release: async () => {
          this.active.delete(id);
        },
      };
    }
    try {
      const now = Date.now();
      const granted = Number(
        await this.redis.eval(
          `redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[2])
           local active = redis.call("ZCARD", KEYS[1])
           if active >= tonumber(ARGV[3]) then return 0 end
           redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
           return 1`,
          1,
          this.key,
          String(now),
          String(now - this.staleAfterMs),
          String(this.limit),
          id,
        ),
      );
      if (!granted) {
        const active = Number(
          await this.redis.zcount(this.key, `(${now - this.staleAfterMs}`, "+inf"),
        );
        return { active, limit: this.limit };
      }
    } catch (error) {
      // Capacity protection must never take the interview down with Redis:
      // degrade to this process's view rather than rejecting the session.
      observability().event("voice.concurrency.acquire_failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      if (this.active.size >= this.limit) return { active: this.active.size, limit: this.limit };
    }
    this.active.add(id);
    return {
      release: async () => {
        this.active.delete(id);
        try {
          await this.redis?.zrem(this.key, id);
        } catch {
          // The entry expires on its own.
        }
      },
    };
  }

  /** Total live sessions, for readiness/observability. */
  async activeCount(): Promise<number> {
    if (this.redis) {
      try {
        await this.redis.zremrangebyscore(this.key, "-inf", Date.now() - this.staleAfterMs);
        return await this.redis.zcard(this.key);
      } catch {
        // fall through
      }
    }
    return this.active.size;
  }

  async close() {
    clearInterval(this.renewal);
    this.active.clear();
    if (!this.redis) return;
    await this.redis.quit().catch(() => undefined);
  }

  private async renew() {
    if (!this.redis || this.active.size === 0) return;
    const now = Date.now();
    await Promise.allSettled([...this.active].map((id) => this.redis!.zadd(this.key, now, id)));
  }
}

export function isVoiceConcurrencyLease(
  result: VoiceConcurrencyLease | VoiceConcurrencyDenial,
): result is VoiceConcurrencyLease {
  return "release" in result;
}
