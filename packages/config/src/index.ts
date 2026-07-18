import { z } from "zod";

export const serverEnvironmentSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  DATABASE_URL: z.url(),
  EMAIL_FROM: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.url(),
  RESEND_API_KEY: z.string().min(1),
  WEB_URL: z.url(),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

/** Environment values that are intentionally safe to expose to the browser. */
export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
