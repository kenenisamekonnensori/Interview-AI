import assert from "node:assert/strict";
import { test } from "vitest";
import Fastify from "fastify";
import type { PrismaClient } from "../../prisma/generated/client.js";
import { createRedisSecondaryStorage } from "../modules/auth/storage.js";
import { createAuthConfig } from "../modules/auth/config.js";
import { createAuthFastifyIntegration } from "../modules/auth/fastify.js";
import type { ServerEnvironment } from "@interviewer-ai/config";

test("Redis secondary storage performs get, set, delete with key prefixing", async () => {
  const store = new Map<string, string>();
  const mockRedis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
  } as unknown as import("ioredis").default;

  const storage = createRedisSecondaryStorage(mockRedis);

  // Set without TTL
  await storage.set("test-token", JSON.stringify({ userId: "u123" }));
  assert.equal(store.has("interviewer-ai:auth:test-token"), true);

  // Get
  const fetched = await storage.get("test-token");
  assert.deepEqual(JSON.parse(fetched!), { userId: "u123" });

  // Delete
  await storage.delete("test-token");
  assert.equal(await storage.get("test-token"), null);
});

test("Redis secondary storage gracefully handles Redis errors without crashing", async () => {
  const faultyRedis = {
    get: async () => {
      throw new Error("Redis connection lost");
    },
    set: async () => {
      throw new Error("Redis write failure");
    },
    del: async () => {
      throw new Error("Redis del failure");
    },
  } as unknown as import("ioredis").default;

  const storage = createRedisSecondaryStorage(faultyRedis);

  // None of these should throw
  const getResult = await storage.get("token-key");
  assert.equal(getResult, null);

  await assert.doesNotReject(async () => {
    await storage.set("token-key", "data", 60);
  });

  await assert.doesNotReject(async () => {
    await storage.delete("token-key");
  });
});

test("createAuthConfig enforces secure account linking and attaches secondary storage", () => {
  const dummyEnv: ServerEnvironment = {
    API_PORT: 4000,
    BETTER_AUTH_SECRET: "01234567890123456789012345678901",
    BETTER_AUTH_URL: "http://localhost:4000",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/interviewer_ai?schema=public",
    EMAIL_FROM: "test@example.com",
    GOOGLE_CLIENT_ID: "google-test-id",
    GOOGLE_CLIENT_SECRET: "google-test-secret",
    NODE_ENV: "test",
    PADDLE_ENVIRONMENT: "sandbox",
    RESEND_API_KEY: "resend-test-key",
    CORS_ALLOWED_ORIGINS: [],
    TRUST_PROXY: false,
    WEB_URL: "http://localhost:3000",
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    OWNER_EMAILS: [],
  };

  const dummyDb = {} as PrismaClient;
  const dummyLogger = { error: () => {} };

  // Test without Redis
  const configWithoutRedis = createAuthConfig(dummyEnv, dummyDb, dummyLogger);
  assert.equal(configWithoutRedis.account?.accountLinking?.disableImplicitLinking, true);
  assert.equal(configWithoutRedis.secondaryStorage, undefined);
  assert.ok(configWithoutRedis.socialProviders?.google);

  // Test with Redis
  const mockRedis = {} as unknown as import("ioredis").default;
  const configWithRedis = createAuthConfig(dummyEnv, dummyDb, dummyLogger, undefined, mockRedis);
  assert.ok(configWithRedis.secondaryStorage);
});

test("createAuthConfig registers user.create and session.create database hooks to initialize and preserve preferredName", async () => {
  const dummyEnv: ServerEnvironment = {
    API_PORT: 4000,
    BETTER_AUTH_SECRET: "01234567890123456789012345678901",
    BETTER_AUTH_URL: "http://localhost:4000",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/interviewer_ai?schema=public",
    EMAIL_FROM: "test@example.com",
    GOOGLE_CLIENT_ID: "google-test-id",
    GOOGLE_CLIENT_SECRET: "google-test-secret",
    NODE_ENV: "test",
    PADDLE_ENVIRONMENT: "sandbox",
    RESEND_API_KEY: "resend-test-key",
    CORS_ALLOWED_ORIGINS: [],
    TRUST_PROXY: false,
    WEB_URL: "http://localhost:3000",
    GEMINI_MODEL: "gemini-3.5-flash-lite",
    OWNER_EMAILS: [],
  };

  let upsertArg: unknown;
  let createArg: unknown;

  const mockDb = {
    userProfile: {
      upsert: async (args: unknown) => {
        upsertArg = args;
        return {};
      },
      findUnique: async () => null,
      create: async (args: unknown) => {
        createArg = args;
        return {};
      },
      update: async () => ({}),
    },
    user: {
      findUnique: async () => ({ name: "Session Candidate" }),
    },
  } as unknown as PrismaClient;

  const config = createAuthConfig(dummyEnv, mockDb, { error: () => {} });
  assert.ok(config.databaseHooks?.user?.create?.after);
  assert.ok(config.databaseHooks?.session?.create?.after);

  // 1. User create hook sets default preferredName
  await config.databaseHooks!.user!.create!.after!(
    {
      id: "user-new",
      name: "New Candidate",
      email: "new@example.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    null,
  );
  assert.deepEqual(upsertArg, {
    where: { userId: "user-new" },
    create: { userId: "user-new", preferredName: "New Candidate" },
    update: {},
  });

  // 2. Session create hook sets default preferredName when missing
  await config.databaseHooks!.session!.create!.after!(
    {
      id: "sess-1",
      userId: "user-sess",
      token: "tok",
      expiresAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    null,
  );
  assert.deepEqual(createArg, {
    data: { userId: "user-sess", preferredName: "Session Candidate" },
  });
});

test("Fastify auth integration registers all modern REST methods", () => {
  const dummyAuth = {
    api: { getSession: async () => null },
    handler: async () => new Response(null, { status: 200 }),
  } as unknown as ReturnType<typeof import("../modules/auth/auth.js").createAuth>["auth"];

  const dummyEnv = {
    BETTER_AUTH_URL: "http://localhost:4000",
  } as unknown as ServerEnvironment;

  const integration = createAuthFastifyIntegration(dummyAuth, dummyEnv);
  assert.deepEqual(integration.route.method, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
});

test("requireSession and requireVerifiedUser guard unauthorized access", async () => {
  const app = Fastify();

  let mockSession: {
    session: { id: string };
    user: { id: string; email: string; emailVerified: boolean; name: string };
  } | null = null;

  const mockAuth = {
    api: {
      getSession: async () => mockSession,
    },
    handler: async () => new Response("ok", { status: 200 }),
  } as unknown as ReturnType<typeof import("../modules/auth/auth.js").createAuth>["auth"];

  const dummyEnv = {
    BETTER_AUTH_URL: "http://localhost:4000",
  } as unknown as ServerEnvironment;

  const integration = createAuthFastifyIntegration(mockAuth, dummyEnv);

  app.decorateRequest("authContext", null);
  app.get("/test/protected", { preHandler: integration.requireSession }, async () => ({ status: "ok" }));
  app.get("/test/verified", { preHandler: integration.requireVerifiedUser }, async () => ({ status: "verified" }));

  // 1. Unauthenticated request -> 401
  const unauthRes = await app.inject({ method: "GET", url: "/test/protected" });
  assert.equal(unauthRes.statusCode, 401);
  assert.deepEqual(JSON.parse(unauthRes.body), {
    code: "AUTHENTICATION_REQUIRED",
    message: "Authentication is required.",
  });

  // 2. Unverified user -> 403 on requireVerifiedUser
  mockSession = {
    session: { id: "sess-1" },
    user: { id: "user-1", email: "unverified@example.com", emailVerified: false, name: "Unverified" },
  };

  const unverifiedRes = await app.inject({ method: "GET", url: "/test/verified" });
  assert.equal(unverifiedRes.statusCode, 403);
  assert.deepEqual(JSON.parse(unverifiedRes.body), {
    code: "EMAIL_VERIFICATION_REQUIRED",
    message: "Email verification is required.",
  });

  // 3. Verified user -> 200 on requireVerifiedUser
  mockSession = {
    session: { id: "sess-1" },
    user: { id: "user-1", email: "verified@example.com", emailVerified: true, name: "Verified" },
  };

  const verifiedRes = await app.inject({ method: "GET", url: "/test/verified" });
  assert.equal(verifiedRes.statusCode, 200);
  assert.deepEqual(JSON.parse(verifiedRes.body), { status: "verified" });
});
