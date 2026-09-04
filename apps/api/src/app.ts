import cors from "@fastify/cors";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import Fastify from "fastify";

import { createAuth } from "./modules/auth/index.js";
import { createAuthFastifyIntegration } from "./modules/auth/fastify.js";
import { registerResumeRoutes } from "./modules/resumes/index.js";
import { registerJobDescriptionRoutes } from "./modules/jobs/index.js";
import { registerInterviewRoutes } from "./modules/interviews/index.js";
import { registerConversationRoutes } from "./modules/conversation/index.js";
import { createCareerAnalysisQueue } from "./services/career-analysis-queue.js";
import { createReportQueue } from "./services/report-queue.js";
import { registerReportRoutes } from "./modules/reports/index.js";
import { registerAnalyticsRoutes } from "./modules/analytics/index.js";
import { registerUserProfileRoutes } from "./modules/users/index.js";
import { createRequestRateLimiter } from "./services/request-rate-limit.js";
import {
  configureObservability,
  createRequestId,
  setRequestCorrelationId,
} from "./services/observability.js";
import {
  allowedCorsMethods,
  configuredCorsOrigins,
  logSafeError,
  sendSafeRateLimitError,
  sendSafeUnexpectedError,
} from "./services/security.js";

import { MonolithExecutionManager, isMonolithMode } from "./services/monolith-execution.js";
import { RealtimeEventBus } from "./services/realtime-events.js";

export function createApp() {
  const environment = serverEnvironmentSchema.parse(process.env);
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.body.password",
          "req.body.token",
          "req.body.accessToken",
          "req.body.text",
          "req.body.rawText",
        ],
        remove: true,
      },
    },
    trustProxy: environment.TRUST_PROXY,
    genReqId: (request) => createRequestId(request.headers["x-request-id"]),
  });
  const telemetry = configureObservability(app.log);

  if (isMonolithMode()) {
    app.log.info("Running in monolith mode: background tasks will execute directly in process");
  } else {
    app.log.info("Running in worker mode: background tasks will be enqueued to Redis queues");
  }

  const { auth, database, monolith, dispose } = createAuth(
    environment,
    app.log,
    (db) => new MonolithExecutionManager(db, environment),
  );
  const careerAnalysisQueue = createCareerAnalysisQueue(environment.REDIS_URL);
  const reportQueue = createReportQueue(environment.REDIS_URL);
  const rateLimiter = createRequestRateLimiter(environment.REDIS_URL);
  const eventBus = new RealtimeEventBus(environment.REDIS_URL);

  app.decorate("auth", auth);
  app.decorateRequest("authContext", null);
  app.addHook("onClose", async () => {
    await careerAnalysisQueue.close();
    await reportQueue.close();
    await rateLimiter.close();
    await eventBus.close();
    await dispose();
  });

  app.setErrorHandler((error, request, reply) => sendSafeUnexpectedError(request, reply, error));

  app.addHook("onRequest", async (request, reply) => {
    setRequestCorrelationId(request.id);
    reply.header("X-Request-Id", request.id);
    try {
      const result = await rateLimiter.consume({
        method: request.method,
        url: request.url,
        ip: request.ip,
      });
      if (!result) return;
      reply.header("RateLimit-Limit", String(result.policy.limit));
      reply.header("RateLimit-Remaining", String(Math.max(0, result.policy.limit - result.count)));
      reply.header("RateLimit-Reset", String(result.resetSeconds));
      if (result.exceeded) return sendSafeRateLimitError(reply, result.resetSeconds, request.id);
    } catch (error) {
      logSafeError(request.log, "Rate-limit check failed", error, { requestId: request.id });
      return reply.status(503).send({
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Request protection is temporarily unavailable. Please try again later.",
        requestId: request.id,
      });
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    telemetry.metric("http.server.duration_ms", reply.elapsedTime, {
      method: request.method,
      statusCode: reply.statusCode,
      route: request.routeOptions.url ?? request.url.split("?")[0],
    });
    telemetry.event("http.request.completed", {
      requestId: request.id,
      method: request.method,
      statusCode: reply.statusCode,
      route: request.routeOptions.url ?? request.url.split("?")[0],
    });
  });

  app.register(cors, {
    origin: configuredCorsOrigins(environment),
    credentials: true,
    methods: allowedCorsMethods,
  });

  const authIntegration = createAuthFastifyIntegration(auth, environment);
  app.route(authIntegration.route);
  app.decorate("requireSession", authIntegration.requireSession);
  app.decorate("requireVerifiedUser", authIntegration.requireVerifiedUser);

  registerResumeRoutes(app, { database, environment, queue: careerAnalysisQueue, monolith });
  registerJobDescriptionRoutes(app, { database, queue: careerAnalysisQueue, monolith });
  const interviewService = registerInterviewRoutes(
    app,
    database,
    careerAnalysisQueue,
    reportQueue,
    monolith,
    eventBus,
  );
  const reportService = registerReportRoutes(
    app,
    database,
    environment,
    reportQueue,
    monolith,
    eventBus,
  );
  interviewService.setReportService(reportService);
  registerAnalyticsRoutes(app, database);
  registerUserProfileRoutes(app, database);
  registerConversationRoutes(app, database, environment, interviewService, eventBus);

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async (request, reply) => {
    try {
      await database.$queryRawUnsafe("SELECT 1");
      await rateLimiter.ping();
      return { status: "ready", requestId: request.id };
    } catch (error) {
      logSafeError(request.log, "Readiness dependency check failed", error, {
        requestId: request.id,
      });
      return reply.status(503).send({
        code: "NOT_READY",
        message: "A required dependency is unavailable.",
        requestId: request.id,
      });
    }
  });

  return app;
}
