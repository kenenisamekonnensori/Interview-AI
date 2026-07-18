import cors from "@fastify/cors";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import Fastify from "fastify";

import { createAuth } from "./modules/auth/index.js";
import { createAuthFastifyIntegration } from "./modules/auth/fastify.js";

export function createApp() {
  const environment = serverEnvironmentSchema.parse(process.env);
  const app = Fastify({ logger: true });
  const { auth, dispose } = createAuth(environment, app.log);

  app.decorate("auth", auth);
  app.decorateRequest("authContext", null);
  app.addHook("onClose", dispose);

  app.register(cors, {
    origin: environment.WEB_URL,
    credentials: true,
  });

  const authIntegration = createAuthFastifyIntegration(auth, environment);
  app.route(authIntegration.route);
  app.decorate("requireSession", authIntegration.requireSession);
  app.decorate("requireVerifiedUser", authIntegration.requireVerifiedUser);

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
