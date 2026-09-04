import { randomUUID } from "node:crypto";

import Redis from "ioredis";
import type { RealtimeEvent } from "@interviewer-ai/types";

import { createRedisConnectionOptions } from "./redis-connection.js";
import { observability } from "./observability.js";

type EventHandler = (event: RealtimeEvent) => void;

type RedisMessage = { instanceId: string; event: RealtimeEvent };

const redisChannel = "realtime:events";

/**
 * Fan-out hub for interview lifecycle and conversation events.
 *
 * Events are published after their owning database transaction has committed.
 * Delivery is best-effort and at-most-once: consumers (SSE streams) use events
 * as a signal to re-read authoritative state, never as the source of truth.
 *
 * Transport:
 * - In-process: dispatch to local subscribers keyed by interviewId.
 * - Redis: when REDIS_URL is configured, events are additionally published to a
 *   single Redis pub/sub channel so that multiple API/worker processes share
 *   them. Each process filters the channel by interviewId for its own streams.
 */
export class RealtimeEventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly instanceId = randomUUID();
  private redis: { pub: Redis; sub: Redis } | undefined;
  private subscribed = false;
  private closed = false;

  constructor(private readonly redisUrl?: string) {}

  publish(event: RealtimeEvent) {
    if (this.closed) return;
    const interviewId = event.payload.interviewId;
    const handlers = this.handlers.get(interviewId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (cause) {
          observability().event("realtime.handler_failed", {
            eventName: event.name,
            interviewId,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    }
    if (!this.redisUrl) return;
    try {
      this.ensureRedis();
      const message: RedisMessage = { instanceId: this.instanceId, event };
      void this.redis!.pub.publish(redisChannel, JSON.stringify(message)).catch((cause) => {
        observability().event("realtime.redis_publish_failed", {
          eventName: event.name,
          interviewId,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      });
    } catch {
      // Redis is optional for realtime sync; failures are observed, not fatal.
    }
  }

  /** Registers a handler for one interview and returns an unsubscribe function. */
  subscribe(interviewId: string, handler: EventHandler): () => void {
    let handlers = this.handlers.get(interviewId);
    if (!handlers) {
      handlers = new Set();
      this.handlers.set(interviewId, handlers);
    }
    handlers.add(handler);
    this.ensureRedisSubscription();
    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) this.handlers.delete(interviewId);
    };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.subscribed = false;
    this.handlers.clear();
    if (!this.redis) return;
    const { pub, sub } = this.redis;
    this.redis = undefined;
    try {
      await Promise.allSettled([sub.unsubscribe(redisChannel), pub.quit(), sub.quit()]);
    } catch (cause) {
      observability().event("realtime.redis_close_failed", {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  private ensureRedis() {
    if (this.redis || !this.redisUrl) return;
    const options = createRedisConnectionOptions(this.redisUrl, { worker: true });
    const pub = new Redis(options);
    const sub = new Redis(options);
    pub.on("error", (cause) => this.observeRedisError("publisher", cause));
    sub.on("error", (cause) => this.observeRedisError("subscriber", cause));
    sub.on("message", (_channel, message) => {
      // In-process dispatch already delivered events published by this instance;
      // ignore our own Redis round-trip to avoid duplicate delivery.
      const parsed = parseMessage(message);
      if (!parsed || parsed.instanceId === this.instanceId) return;
      const event = parsed.event;
      const handlers = this.handlers.get(event.payload.interviewId);
      if (!handlers) return;
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (cause) {
          observability().event("realtime.handler_failed", {
            eventName: event.name,
            interviewId: event.payload.interviewId,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    });
    this.redis = { pub, sub };
  }

  private ensureRedisSubscription() {
    if (!this.redisUrl || this.subscribed) return;
    this.ensureRedis();
    this.subscribed = true;
    // ioredis buffers commands until the client connects, so this is safe even
    // while the connection is still establishing.
    void this.redis!.sub.subscribe(redisChannel).catch((cause) => {
      this.subscribed = false;
      this.observeRedisError("subscribe", cause);
    });
  }

  private observeRedisError(role: string, cause: Error) {
    observability().event("realtime.redis_error", {
      role,
      reason: cause.message,
    });
  }
}

function parseMessage(message: string): RedisMessage | null {
  try {
    const parsed = JSON.parse(message) as RedisMessage;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.instanceId !== "string" ||
      typeof parsed.event?.name !== "string" ||
      typeof parsed.event?.payload?.interviewId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
