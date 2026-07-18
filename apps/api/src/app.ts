import cors from "@fastify/cors";
import { serverEnvironmentSchema } from "@interviewer-ai/config";
import Fastify from "fastify";

import { createAuth } from "./modules/auth/index.js";

export function createApp() {
  const environment = serverEnvironmentSchema.parse(process.env);
  const app = Fastify({ logger: true });
  const { auth, dispose } = createAuth(environment);

  app.decorate("auth", auth);
  app.addHook("onClose", dispose);

  void app.register(cors, {
    origin: environment.WEB_URL,
    credentials: true,
  });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
