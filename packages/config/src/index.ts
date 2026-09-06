import { z } from "zod";

const optionalEnvironmentString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const commaSeparatedUrls = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length > 0
      ? value.split(",").map((origin) => origin.trim())
      : [],
  z.array(z.url()),
);

const environmentBoolean = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean(),
);

export const serverEnvironmentSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(4000),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DATABASE_URL: z.url(),
    DEEPGRAM_API_KEY: optionalEnvironmentString,
    EMAIL_FROM: z.string().min(1),
    GITHUB_CLIENT_ID: optionalEnvironmentString,
    GITHUB_CLIENT_SECRET: optionalEnvironmentString,
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    GEMINI_API_KEY: optionalEnvironmentString,
    GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
    REDIS_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    RESEND_API_KEY: z.string().min(1),
    R2_ACCESS_KEY_ID: optionalEnvironmentString,
    R2_BUCKET: optionalEnvironmentString,
    R2_ENDPOINT: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
    R2_SECRET_ACCESS_KEY: optionalEnvironmentString,
    CORS_ALLOWED_ORIGINS: commaSeparatedUrls.default([]),
    TRUST_PROXY: environmentBoolean.default(false),
    WEB_URL: z.url(),
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production" && !environment.WEB_URL.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        path: ["WEB_URL"],
        message: "WEB_URL must use HTTPS in production.",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

/** Environment values that are intentionally safe to expose to the browser. */
export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
