import type { RedisOptions } from "ioredis";

/** Converts either a local redis:// URL or Upstash's TLS rediss:// URL to BullMQ options. */
export function createRedisConnectionOptions(
  redisUrl: string,
  { worker = false }: { worker?: boolean } = {},
): RedisOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol.");
  }

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    ...(worker ? { maxRetriesPerRequest: null } : {}),
    enableReadyCheck: false,
  };
}
