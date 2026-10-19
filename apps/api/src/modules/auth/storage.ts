import type Redis from "ioredis";

export interface AuthSecondaryStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

/**
 * High-performance Redis cache adapter for Better Auth sessions.
 * Caches active session tokens in memory (<1ms lookup) while PostgreSQL
 * via Prisma remains the authoritative persistent store.
 *
 * All operations include graceful error handling: if Redis is temporarily
 * unavailable, requests degrade transparently to PostgreSQL without failing.
 */
export function createRedisSecondaryStorage(redis: Redis): AuthSecondaryStorage {
  const prefix = "interviewer-ai:auth:";

  return {
    get: async (key: string) => {
      try {
        return await redis.get(`${prefix}${key}`);
      } catch {
        // Fallback to PostgreSQL if Redis lookup fails
        return null;
      }
    },

    set: async (key: string, value: string, ttl?: number) => {
      try {
        if (ttl && ttl > 0) {
          await redis.set(`${prefix}${key}`, value, "EX", ttl);
        } else {
          await redis.set(`${prefix}${key}`, value);
        }
      } catch {
        // Silently continue: session is always committed to PostgreSQL first
      }
    },

    delete: async (key: string) => {
      try {
        await redis.del(`${prefix}${key}`);
      } catch {
        // Silently continue
      }
    },
  };
}
