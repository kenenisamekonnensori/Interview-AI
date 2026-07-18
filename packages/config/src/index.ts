import { z } from "zod";

export const serverEnvironmentSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.url(),
  WEB_URL: z.url(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
