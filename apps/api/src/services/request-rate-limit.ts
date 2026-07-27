import Redis from "ioredis";

import { createRedisConnectionOptions } from "./redis-connection.js";

export type RateLimitPolicy = {
  name: "authentication" | "resume-upload" | "conversation" | "voice-token";
  limit: number;
  windowSeconds: number;
};

export type RateLimitStore = {
  eval: (script: string, numberOfKeys: number, ...args: string[]) => Promise<unknown>;
  quit?: () => Promise<unknown>;
  ping?: () => Promise<unknown>;
};

const incrementWithExpiry = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return { count, redis.call("TTL", KEYS[1]) }
`;

export function requestRateLimitPolicy(method: string, url: string): RateLimitPolicy | null {
  const path = url.split("?")[0] ?? "";
  if (method === "POST" && path.startsWith("/api/auth/")) {
    return { name: "authentication", limit: 10, windowSeconds: 10 * 60 };
  }
  if (method === "POST" && path === "/api/v1/resumes/uploads") {
    return { name: "resume-upload", limit: 5, windowSeconds: 15 * 60 };
  }
  if (method === "POST" && /^\/api\/v1\/interviews\/[^/]+\/voice-token$/.test(path)) {
    return { name: "voice-token", limit: 10, windowSeconds: 60 };
  }
  if (method === "POST" && /^\/api\/v1\/interviews\/[^/]+\/conversation(?:\/|$)/.test(path)) {
    return { name: "conversation", limit: 40, windowSeconds: 60 };
  }
  return null;
}

export function isRateLimitExceeded(count: number, policy: RateLimitPolicy) {
  return count > policy.limit;
}

export class RequestRateLimiter {
  constructor(private readonly store: RateLimitStore) {}

  async consume({ method, url, ip }: { method: string; url: string; ip: string }) {
    const policy = requestRateLimitPolicy(method, url);
    if (!policy) return null;
    const key = `interviewer-ai:rate-limit:${policy.name}:${encodeURIComponent(ip)}`;
    const raw = await this.store.eval(incrementWithExpiry, 1, key, String(policy.windowSeconds));
    const [count, ttl] = Array.isArray(raw) ? raw : [];
    if (typeof count !== "number" || typeof ttl !== "number") {
      throw new Error("Rate-limit store returned an invalid response.");
    }
    return {
      policy,
      count,
      resetSeconds: Math.max(1, ttl),
      exceeded: isRateLimitExceeded(count, policy),
    };
  }

  async close() {
    await this.store.quit?.();
  }

  async ping() {
    await this.store.ping?.();
  }
}

export function createRequestRateLimiter(redisUrl: string) {
  const client = new Redis(createRedisConnectionOptions(redisUrl));
  return new RequestRateLimiter(client);
}
