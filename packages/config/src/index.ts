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

const commaSeparatedEmails = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length > 0
      ? value.split(",").map((item) => item.trim().toLowerCase())
      : [],
  z.array(z.string().email()),
);

/** Ordered list inputs (think fallbacks): empty input means "no extra entries". */
const commaSeparatedStrings = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length > 0
      ? value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  z.array(z.string().min(1)),
);

export const serverEnvironmentSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(4000),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    DATABASE_URL: z.url(),
    DEEPGRAM_API_KEY: optionalEnvironmentString,
    /**
     * The realtime voice pipeline. `agent` (default since Phase 4) routes the
     * session through our server-owned Deepgram Voice Agent gateway, which owns
     * turn-taking, the greeting and silence policy. `legacy` is the
     * client-orchestrated browser-to-Deepgram pipeline, kept as a fallback.
     */
    VOICE_PIPELINE: z.enum(["agent", "legacy"]).default("agent"),
    /**
     * Phase 4 concurrency management: live server-owned voice sessions allowed
     * per deployment (across instances when Redis is configured). Past the cap,
     * a new session closes cleanly and the client continues in text mode.
     */
    VOICE_MAX_CONCURRENT_SESSIONS: z.coerce.number().int().positive().default(100),
    /**
     * Phase 4 privacy policy: transcript retention in days for completed
     * interviews. `0` keeps the validated transcript for the interview's
     * lifetime (the default; reports are derived from it). Audio is never
     * stored either way.
     */
    TRANSCRIPT_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
    EMAIL_FROM: z.string().min(1),
    GITHUB_CLIENT_ID: optionalEnvironmentString,
    GITHUB_CLIENT_SECRET: optionalEnvironmentString,
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    OWNER_EMAILS: commaSeparatedEmails.default([]),
    PADDLE_API_KEY: optionalEnvironmentString,
    PADDLE_CLIENT_TOKEN: optionalEnvironmentString,
    PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    PADDLE_PRO_MONTHLY_PRICE_ID: optionalEnvironmentString,
    PADDLE_PRO_PRODUCT_ID: optionalEnvironmentString,
    PADDLE_PRO_YEARLY_PRICE_ID: optionalEnvironmentString,
    PADDLE_WEBHOOK_SECRET: optionalEnvironmentString,
    GEMINI_API_KEY: optionalEnvironmentString,
    GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
    /**
     * Phase 2 of the voice-system roadmap: ordered think-provider fallbacks.
     * The agent `think` chain is `GEMINI_MODEL` followed by these models, so
     * provider-quota exhaustion retries instead of killing the interview.
     * Empty by default: the chain is exactly the primary model.
     */
    GEMINI_FALLBACK_MODELS: commaSeparatedStrings.default([]),
    REDIS_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().optional(),
    ),
    RESEND_API_KEY: z.string().min(1),
    R2_ACCESS_KEY_ID: optionalEnvironmentString,
    R2_BUCKET: optionalEnvironmentString,
    R2_ENDPOINT: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
    R2_SECRET_ACCESS_KEY: optionalEnvironmentString,
    LIVEKIT_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().url().default("ws://localhost:7880"),
    ),
    LIVEKIT_API_KEY: optionalEnvironmentString.default("devkey"),
    LIVEKIT_API_SECRET: optionalEnvironmentString.default("secret"),
    LIVEKIT_NODE_IP: optionalEnvironmentString.optional(),
    CARTESIA_API_KEY: optionalEnvironmentString,
    INTERNAL_API_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).default("dev-internal-secret-min-16-chars"),
    ),
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
    // Sandbox and production billing credentials must never be mixed. A
    // production deployment that has Paddle credentials configured must point
    // at the production environment; sandbox testing runs outside production.
    if (
      environment.NODE_ENV === "production" &&
      environment.PADDLE_API_KEY &&
      environment.PADDLE_ENVIRONMENT !== "production"
    ) {
      context.addIssue({
        code: "custom",
        path: ["PADDLE_ENVIRONMENT"],
        message: 'PADDLE_ENVIRONMENT must be "production" when Paddle is configured in production.',
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      environment.INTERNAL_API_SECRET === "dev-internal-secret-min-16-chars"
    ) {
      context.addIssue({
        code: "custom",
        path: ["INTERNAL_API_SECRET"],
        message: "INTERNAL_API_SECRET must not use the development default in production.",
      });
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

/** Environment values that are intentionally safe to expose to the browser. */
export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;
