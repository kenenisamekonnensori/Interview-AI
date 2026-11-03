import { randomUUID } from "node:crypto";

import Redis from "ioredis";

import { createRedisConnectionOptions } from "./redis-connection.js";
import { observability } from "./observability.js";

/**
 * Phase 4 multi-instance ownership for live voice sessions.
 *
 * The silence ladder, the provider socket and the session director are all
 * in-process by design: exactly one gateway may drive one interview's live
 * timeline. When several API instances serve the same deployment (or a user
 * opens a second tab), nothing in the database prevents two gateways from
 * speaking, both arming timers and both persisting turns.
 *
 * This registry answers "who owns the live session right now" and makes the
 * newest connection win: the previous owner is told to close through pub/sub,
 * so the interview has one voice and one turn-taking timeline. Ownership is
 * advisory liveness, never durable state — if Redis is unavailable the
 * registry degrades to this process only (the same guarantee as before).
 *
 * The lease carries a TTL and is renewed while the socket lives, so a crashed
 * instance never leaves a stale owner behind. Claims always succeed: a
 * reconnecting candidate must never be locked out by a dead session.
 */

export type VoiceSessionOwner = {
  /** Releases ownership if this session still holds it. Idempotent. */
  release: () => Promise<void>;
  /**
   * Registers the takeover callback: the interview's live session moved to a
   * newer connection, so this one must stop speaking and close.
   */
  onSuperseded: (handler: () => void) => () => void;
};

export const voiceSessionLeaseTtlMs = 300_000;

const leaseKey = (interviewId: string) => `voice:session:${interviewId}`;
const controlChannel = "voice:session:control";

type ControlMessage = { interviewId: string; sessionId: string };

type Ownership = {
  sessionId: string;
  handlers: Set<() => void>;
};

export class VoiceSessionRegistry {
  private readonly instanceId = randomUUID();
  private readonly owners = new Map<string, Ownership>();
  private readonly renewal: NodeJS.Timeout;
  private redis: { pub: Redis; sub: Redis } | undefined;
  private closed = false;

  constructor(
    private readonly redisUrl?: string,
    options: { renewIntervalMs?: number } = {},
  ) {
    const interval = options.renewIntervalMs ?? Math.floor(voiceSessionLeaseTtlMs / 3);
    this.renewal = setInterval(() => void this.renewLeases(), interval);
    this.renewal.unref();
  }

  /**
   * Claims the interview's live session. The previous owner (in this process
   * or another instance) is notified and must close.
   */
  async claim(interviewId: string, sessionId: string): Promise<VoiceSessionOwner> {
    const previous = this.owners.get(interviewId);
    const ownership: Ownership = { sessionId, handlers: new Set() };
    this.owners.set(interviewId, ownership);

    // Local takeover: the previous gateway in this process may already be
    // gone from the map while its socket is still draining, so this is the
    // authoritative notification for same-process hand-offs.
    if (previous && previous.sessionId !== sessionId) this.notify(previous);

    const redis = this.ensureRedis();
    if (redis) {
      try {
        await redis.pub.set(
          leaseKey(interviewId),
          this.leaseValue(sessionId),
          "PX",
          voiceSessionLeaseTtlMs,
        );
        await redis.pub.publish(controlChannel, JSON.stringify({ interviewId, sessionId }));
      } catch (error) {
        observability().event("voice.session.lease_failed", {
          interviewId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        const current = this.owners.get(interviewId);
        if (current === ownership) this.owners.delete(interviewId);
        if (!redis) return;
        try {
          await redis.pub.eval(
            `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`,
            1,
            leaseKey(interviewId),
            this.leaseValue(sessionId),
          );
        } catch {
          // A lost lease is harmless: claims always take over and the TTL expires.
        }
      },
      onSuperseded: (handler) => {
        ownership.handlers.add(handler);
        return () => {
          ownership.handlers.delete(handler);
        };
      },
    };
  }

  /** Current owner session id for one interview (observability/tests). */
  async owner(interviewId: string): Promise<string | null> {
    const redis = this.ensureRedis();
    if (redis) {
      try {
        const value = await redis.pub.get(leaseKey(interviewId));
        return value ? value.slice(value.indexOf(":") + 1) : null;
      } catch {
        // fall through to the local view
      }
    }
    return this.owners.get(interviewId)?.sessionId ?? null;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.renewal);
    this.owners.clear();
    if (!this.redis) return;
    const { pub, sub } = this.redis;
    this.redis = undefined;
    await Promise.allSettled([pub.quit(), sub.quit()]);
  }

  private leaseValue(sessionId: string) {
    return `${this.instanceId}:${sessionId}`;
  }

  private notify(ownership: Ownership) {
    for (const handler of [...ownership.handlers]) {
      try {
        handler();
      } catch (error) {
        observability().event("voice.session.supersede_handler_failed", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async renewLeases() {
    const redis = this.redis;
    if (this.closed || !redis) return;
    await Promise.allSettled(
      [...this.owners.entries()].map(([interviewId, ownership]) =>
        redis.pub.eval(
          `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("PEXPIRE", KEYS[1], ARGV[2]) end return 0`,
          1,
          leaseKey(interviewId),
          this.leaseValue(ownership.sessionId),
          String(voiceSessionLeaseTtlMs),
        ),
      ),
    );
  }

  private ensureRedis() {
    if (this.closed || !this.redisUrl) return undefined;
    if (this.redis) return this.redis;
    const options = createRedisConnectionOptions(this.redisUrl, { worker: true });
    const pub = new Redis(options);
    const sub = new Redis(options);
    pub.on("error", (error) => this.observeRedisError("publisher", error));
    sub.on("error", (error) => this.observeRedisError("subscriber", error));
    sub.on("message", (_channel, message) => this.handleControlMessage(message));
    sub.subscribe(controlChannel).catch((error) => this.observeRedisError("subscribe", error));
    this.redis = { pub, sub };
    return this.redis;
  }

  private handleControlMessage(message: string) {
    const parsed = parseControlMessage(message);
    if (!parsed) return;
    const ownership = this.owners.get(parsed.interviewId);
    // Ignore our own round-trip and stale takeovers for a different session.
    if (!ownership || ownership.sessionId === parsed.sessionId) return;
    this.notify(ownership);
  }

  private observeRedisError(role: string, error: Error) {
    observability().event("voice.session.redis_error", { role, reason: error.message });
  }
}

function parseControlMessage(message: string): ControlMessage | null {
  try {
    const parsed = JSON.parse(message) as ControlMessage;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.interviewId !== "string" ||
      typeof parsed.sessionId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
