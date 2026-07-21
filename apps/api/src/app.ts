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

export function createApp() {
  const environment = serverEnvironmentSchema.parse(process.env);
  const app = Fastify({ logger: true });
  const { auth, database, dispose } = createAuth(environment, app.log);
  const careerAnalysisQueue = createCareerAnalysisQueue(environment.REDIS_URL);

  app.decorate("auth", auth);
  app.decorateRequest("authContext", null);
  app.addHook("onClose", async () => {
    await careerAnalysisQueue.close();
    await dispose();
  });

  app.register(cors, {
    origin: environment.WEB_URL,
    credentials: true,
  });

  const authIntegration = createAuthFastifyIntegration(auth, environment);
  app.route(authIntegration.route);
  app.decorate("requireSession", authIntegration.requireSession);
  app.decorate("requireVerifiedUser", authIntegration.requireVerifiedUser);

  registerResumeRoutes(app, { database, environment, queue: careerAnalysisQueue });
  registerJobDescriptionRoutes(app, { database, queue: careerAnalysisQueue });
  registerInterviewRoutes(app, database, careerAnalysisQueue);
  registerConversationRoutes(app, database);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
